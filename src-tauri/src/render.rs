use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{Emitter, Manager};

use crate::blender;
use crate::error::{AppError, AppResult};
use crate::paths;
use crate::{AppState, RenderJob};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelTexture {
    pub panel_id: String,
    pub object_name: String,
    pub base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BodyTexture {
    pub base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderRequest {
    pub root: String,
    pub project_id: String,
    pub model_path: String,
    pub output_name: String,
    pub engine: String,
    pub width: u32,
    pub height: u32,
    pub samples: u32,
    pub camera: String,
    pub transparent_background: bool,
    pub include_floor: bool,
    pub paint_color: String,
    pub panel_textures: Vec<PanelTexture>,
    #[serde(default)]
    pub body_texture: Option<BodyTexture>,
    #[serde(default)]
    pub blender_path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Resolution {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RenderResult {
    pub job_id: String,
    pub output_path: String,
    pub metadata_path: String,
    pub duration_ms: u64,
    pub engine: String,
    pub device: Option<String>,
    pub blender_version: Option<String>,
    pub resolution: Resolution,
}

#[derive(Debug, Deserialize)]
struct ProgressPayload {
    stage: String,
    percent: f64,
    message: String,
}

fn safe_component(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 120
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

fn valid_paint_color(value: &str) -> bool {
    value.len() == 7 && value.starts_with('#') && value[1..].chars().all(|c| c.is_ascii_hexdigit())
}

fn resolve_model(app: &tauri::AppHandle, root: &Path, model_path: &str) -> AppResult<PathBuf> {
    if let Some(asset_id) = model_path.strip_prefix("bundled:") {
        let bundled = paths::resolve_bundled_dir(app, asset_id)?;
        let model = bundled.join("model").join("vehicle.glb");
        if !model.is_file() {
            return Err(AppError::NotFound("Bundled vehicle model is missing.".into()));
        }
        Ok(model)
    } else {
        paths::safe_read_path(root, model_path)
    }
}

fn prepare_job(
    app: &tauri::AppHandle,
    job_id: &str,
    request: &RenderRequest,
) -> AppResult<PreparedJob> {
    if !safe_component(job_id) {
        return Err(AppError::InvalidInput("Invalid render job id.".into()));
    }
    if request.project_id.len() > 200 {
        return Err(AppError::InvalidInput("Invalid project id.".into()));
    }
    if !matches!(
        request.engine.as_str(),
        "BLENDER_EEVEE" | "CYCLES" | "BLENDER_WORKBENCH"
    ) {
        return Err(AppError::InvalidInput("Unsupported render engine.".into()));
    }
    if !(64..=8192).contains(&request.width) || !(64..=8192).contains(&request.height) {
        return Err(AppError::InvalidInput(
            "Render resolution must be between 64 and 8192 pixels.".into(),
        ));
    }
    if !(1..=4096).contains(&request.samples) {
        return Err(AppError::InvalidInput(
            "Render samples must be between 1 and 4096.".into(),
        ));
    }
    if !matches!(
        request.camera.as_str(),
        "three-quarter-front"
            | "three-quarter-rear"
            | "front"
            | "rear"
            | "left"
            | "right"
            | "top"
    ) {
        return Err(AppError::InvalidInput("Unsupported camera preset.".into()));
    }
    if !valid_paint_color(&request.paint_color) {
        return Err(AppError::InvalidInput("Invalid paint colour.".into()));
    }
    paths::validate_file_name(&request.output_name)?;
    if !request.output_name.to_lowercase().ends_with(".png") {
        return Err(AppError::InvalidInput("Render output must be a PNG file.".into()));
    }
    let root = paths::existing_project_root(&request.root)?;
    if !root.join("project.json").is_file() {
        return Err(AppError::NotFound(
            "Save the project before starting a Blender render.".into(),
        ));
    }
    let mut model = resolve_model(app, &root, &request.model_path)?;

    let (invocation, version) = blender::find(&request.blender_path).ok_or(AppError::BlenderNotFound)?;
    if invocation.flatpak {
        if let Some(home) = paths::home_dir() {
            let inside_home = root.starts_with(&home);
            let inside_tmp = root.starts_with("/tmp");
            if !inside_home && !inside_tmp {
                return Err(AppError::InvalidInput(format!(
                    "Blender is installed as a Flatpak and can only read this project at {}. Move the project under your home directory or grant Flatpak filesystem access.",
                    root.display()
                )));
            }
        }
    }

    let renders_dir = root.join("renders");
    let logs_dir = renders_dir.join("logs");
    fs::create_dir_all(&logs_dir)?;
    let temp_dir = renders_dir.join(format!(".tmp-{job_id}"));
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir)?;
    }
    let textures_dir = temp_dir.join("textures");
    fs::create_dir_all(&textures_dir)?;
    if request.model_path.starts_with("bundled:") {
        let model_dir = temp_dir.join("model");
        fs::create_dir_all(&model_dir)?;
        let copied = model_dir.join("vehicle.glb");
        fs::copy(&model, &copied)?;
        model = copied;
    }

    let mut texture_configs: Vec<Value> = Vec::new();
    let mut total_texture_bytes: u64 = 0;
    for texture in &request.panel_textures {
        if !safe_component(&texture.panel_id) || !safe_component(&texture.object_name) {
            return Err(AppError::InvalidInput(
                "Panel texture identifiers contain invalid characters.".into(),
            ));
        }
        let bytes = paths::decode_base64(&texture.base64)?;
        total_texture_bytes = total_texture_bytes.saturating_add(bytes.len() as u64);
        if bytes.len() as u64 > 80 * 1024 * 1024 || total_texture_bytes > 600 * 1024 * 1024 {
            return Err(AppError::TooLarge(
                "Panel textures exceed the render memory limit.".into(),
            ));
        }
        let target = textures_dir.join(format!("{}.png", texture.panel_id));
        fs::write(&target, &bytes)?;
        texture_configs.push(json!({
            "panel_id": texture.panel_id,
            "object_name": texture.object_name,
            "path": target.display().to_string(),
        }));
    }

    let body_texture_path = match &request.body_texture {
        Some(texture) => Some(write_body_texture(texture, &textures_dir)?.display().to_string()),
        None => None,
    };

    let script_source = paths::resolve_blender_script(app)?;
    let script_target = temp_dir.join("render_scene.py");
    fs::copy(&script_source, &script_target)?;

    let output_path = renders_dir.join(&request.output_name);
    let stem = Path::new(&request.output_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(job_id);
    let metadata_path = renders_dir.join(format!("{stem}.json"));
    let log_path = logs_dir.join(format!("{job_id}.log"));
    let config_path = temp_dir.join("render-config.json");

    let config = json!({
        "job_id": job_id,
        "model_path": model.display().to_string(),
        "output_path": output_path.display().to_string(),
        "metadata_path": metadata_path.display().to_string(),
        "engine": request.engine,
        "width": request.width,
        "height": request.height,
        "samples": request.samples,
        "camera": request.camera,
        "transparent_background": request.transparent_background,
        "include_floor": request.include_floor,
        "paint_color": request.paint_color,
        "panel_textures": texture_configs,
        "body_texture_path": body_texture_path,
    });
    fs::write(&config_path, serde_json::to_vec_pretty(&config)?)?;

    Ok(PreparedJob {
        root,
        temp_dir,
        config_path,
        output_path,
        metadata_path,
        log_path,
        invocation,
        blender_version: version,
        width: request.width,
        height: request.height,
        engine: request.engine.clone(),
    })
}

/// Writes the composed livery atlas next to the panel textures so Blender can
/// replace the model's base-colour images with it.
fn write_body_texture(texture: &BodyTexture, textures_dir: &Path) -> AppResult<PathBuf> {
    let bytes = paths::decode_base64(&texture.base64)?;
    if bytes.len() as u64 > 120 * 1024 * 1024 {
        return Err(AppError::TooLarge(
            "The livery texture exceeds the render memory limit.".into(),
        ));
    }
    let target = textures_dir.join("body-livery.png");
    fs::write(&target, &bytes)?;
    Ok(target)
}

struct PreparedJob {
    root: PathBuf,
    temp_dir: PathBuf,
    config_path: PathBuf,
    output_path: PathBuf,
    metadata_path: PathBuf,
    log_path: PathBuf,
    invocation: blender::BlenderInvocation,
    blender_version: String,
    width: u32,
    height: u32,
    engine: String,
}

#[tauri::command]
pub fn start_render(
    app: tauri::AppHandle,
    job_id: String,
    request: RenderRequest,
) -> AppResult<()> {
    let prepared = match prepare_job(&app, &job_id, &request) {
        Ok(prepared) => prepared,
        Err(error) => {
            let _ = app.emit(
                "render://failed",
                json!({
                    "jobId": job_id,
                    "message": error.to_string(),
                }),
            );
            return Err(error);
        }
    };

    let mut command = Command::new(&prepared.invocation.program);
    command
        .args(&prepared.invocation.prefix_args)
        .args([
            "-b".to_string(),
            "--factory-startup".to_string(),
            "--python".to_string(),
            prepared.temp_dir.join("render_scene.py").display().to_string(),
            "--".to_string(),
            prepared.config_path.display().to_string(),
        ])
        .env("PYTHONUNBUFFERED", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|error| {
        AppError::Process(format!(
            "Could not start {}: {error}",
            prepared.invocation.display
        ))
    })?;
    let pid = child.id();
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let state = app.state::<AppState>();
        let mut jobs = state
            .jobs
            .lock()
            .map_err(|_| AppError::Process("Render job state is poisoned.".into()))?;
        jobs.insert(
            job_id.clone(),
            RenderJob {
                pid,
                cancelled: cancelled.clone(),
            },
        );
    }

    let stdout_pipe = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Process("Blender stdout was unavailable.".into()))?;
    let stderr_pipe = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Process("Blender stderr was unavailable.".into()))?;

    let log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&prepared.log_path)?;
    let log = Arc::new(Mutex::new(BufWriter::new(log_file)));

    let app_for_thread = app.clone();
    let job_id_for_thread = job_id.clone();
    let cancelled_for_thread = cancelled.clone();
    let started = Instant::now();

    std::thread::spawn(move || {
        let log_for_stdout = log.clone();
        let app_for_stdout = app_for_thread.clone();
        let job_for_stdout = job_id_for_thread.clone();
        let stdout_thread = std::thread::spawn(move || {
            let reader = BufReader::new(stdout_pipe);
            for line in reader.lines().map_while(Result::ok) {
                if let Ok(mut handle) = log_for_stdout.lock() {
                    let _ = writeln!(handle, "{line}");
                    let _ = handle.flush();
                }
                if let Some(payload) = line.strip_prefix("WF_PROGRESS ") {
                    if let Ok(progress) = serde_json::from_str::<ProgressPayload>(payload) {
                        let _ = app_for_stdout.emit(
                            "render://progress",
                            json!({
                                "jobId": job_for_stdout,
                                "stage": progress.stage,
                                "percent": progress.percent,
                                "message": progress.message,
                            }),
                        );
                    }
                }
            }
        });

        let log_for_stderr = log.clone();
        let stderr_thread = std::thread::spawn(move || {
            let reader = BufReader::new(stderr_pipe);
            for line in reader.lines().map_while(Result::ok) {
                if let Ok(mut handle) = log_for_stderr.lock() {
                    let _ = writeln!(handle, "[stderr] {line}");
                    let _ = handle.flush();
                }
            }
        });

        let status = child.wait();
        let _ = stdout_thread.join();
        let _ = stderr_thread.join();
        let duration_ms = started.elapsed().as_millis() as u64;

        {
            let state = app_for_thread.state::<AppState>();
            let lock = state.jobs.lock();
            if let Ok(mut jobs) = lock {
                jobs.remove(&job_id_for_thread);
            }
        }

        let was_cancelled = cancelled_for_thread.load(Ordering::SeqCst);
        let log_path_string = prepared.log_path.display().to_string();
        if was_cancelled {
            let _ = app_for_thread.emit(
                "render://failed",
                json!({
                    "jobId": job_id_for_thread,
                    "message": "Render cancelled.",
                    "logPath": log_path_string,
                }),
            );
            return;
        }
        let status = match status {
            Ok(status) => status,
            Err(error) => {
                let _ = app_for_thread.emit(
                    "render://failed",
                    json!({
                        "jobId": job_id_for_thread,
                        "message": format!("Blender could not be waited on: {error}"),
                        "logPath": log_path_string,
                    }),
                );
                return;
            }
        };
        if !status.success() {
            let _ = app_for_thread.emit(
                "render://failed",
                json!({
                    "jobId": job_id_for_thread,
                    "message": format!("Blender exited with {}. Review the render log for details.", status.code().map(|code| code.to_string()).unwrap_or_else(|| "an unknown status".into())),
                    "logPath": log_path_string,
                }),
            );
            return;
        }
        if !prepared.output_path.is_file() {
            let _ = app_for_thread.emit(
                "render://failed",
                json!({
                    "jobId": job_id_for_thread,
                    "message": "Blender finished without writing the expected PNG.",
                    "logPath": log_path_string,
                }),
            );
            return;
        }

        let metadata: Option<Value> = fs::read(&prepared.metadata_path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok());
        let engine = metadata
            .as_ref()
            .and_then(|value| value.get("engine"))
            .and_then(Value::as_str)
            .unwrap_or(&prepared.engine)
            .to_string();
        let device = metadata
            .as_ref()
            .and_then(|value| value.get("device"))
            .and_then(Value::as_str)
            .map(ToString::to_string);
        let blender_version = metadata
            .as_ref()
            .and_then(|value| value.get("blenderVersion"))
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .or_else(|| Some(prepared.blender_version.clone()));
        let resolution = metadata
            .as_ref()
            .and_then(|value| value.get("resolution"))
            .and_then(|value| {
                Some(Resolution {
                    width: value.get("width")?.as_u64()? as u32,
                    height: value.get("height")?.as_u64()? as u32,
                })
            })
            .unwrap_or(Resolution {
                width: prepared.width,
                height: prepared.height,
            });

        let result = RenderResult {
            job_id: job_id_for_thread.clone(),
            output_path: prepared.output_path.display().to_string(),
            metadata_path: prepared.metadata_path.display().to_string(),
            duration_ms: metadata
                .as_ref()
                .and_then(|value| value.get("durationMs"))
                .and_then(Value::as_u64)
                .unwrap_or(duration_ms),
            engine,
            device,
            blender_version,
            resolution,
        };
        let _ = app_for_thread.emit("render://done", result);
        let _ = fs::remove_dir_all(&prepared.temp_dir);
        let _ = prepared.root;
    });

    Ok(())
}

#[tauri::command]
pub fn cancel_render(app: tauri::AppHandle, job_id: String) -> AppResult<()> {
    let state = app.state::<AppState>();
    let jobs = state
        .jobs
        .lock()
        .map_err(|_| AppError::Process("Render job state is poisoned.".into()))?;
    if let Some(job) = jobs.get(&job_id) {
        job.cancelled.store(true, Ordering::SeqCst);
        blender::kill_process(job.pid);
        Ok(())
    } else {
        Err(AppError::NotFound(format!(
            "No running render job named {job_id}."
        )))
    }
}

pub fn kill_all_jobs(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    let lock = state.jobs.lock();
    if let Ok(mut jobs) = lock {
        for (_, job) in jobs.drain() {
            job.cancelled.store(true, Ordering::SeqCst);
            blender::kill_process(job.pid);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_render_identifiers() {
        assert!(safe_component("render-123"));
        assert!(!safe_component("../escape"));
        assert!(!safe_component(""));
        assert!(!safe_component("has space"));
    }

    #[test]
    fn validates_paint_colour() {
        assert!(valid_paint_color("#d9552f"));
        assert!(!valid_paint_color("d9552f"));
        assert!(!valid_paint_color("#xyzxyz"));
        assert!(!valid_paint_color("#12345"));
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "wrapforge-render-test-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    #[test]
    fn writes_the_livery_texture_into_the_job_folder() {
        let dir = temp_dir("body-texture");
        let texture = BodyTexture {
            base64: paths::encode_base64(b"\x89PNG\r\npreview"),
        };
        let written = write_body_texture(&texture, &dir).expect("texture written");
        assert_eq!(written.file_name().unwrap(), "body-livery.png");
        assert!(fs::read(&written).expect("read back").starts_with(b"\x89PNG"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_an_invalid_base64_texture() {
        let dir = temp_dir("body-texture-invalid");
        let texture = BodyTexture {
            base64: "not base64 !!".to_string(),
        };
        assert!(write_body_texture(&texture, &dir).is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}

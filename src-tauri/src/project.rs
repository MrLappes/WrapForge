use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::{AppError, AppResult};
use crate::paths::{self, MAX_PROJECT_ASSET_BYTES, MAX_PROJECT_BYTES};
use crate::recent;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkFilePayload {
    pub relative_path: String,
    #[serde(default)]
    pub base64: Option<String>,
    #[serde(default)]
    pub text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProjectRequest {
    pub root: Option<String>,
    pub project_json: String,
    #[serde(default)]
    pub files: Vec<ArtworkFilePayload>,
    #[serde(default)]
    pub thumbnail_data_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProjectResult {
    pub root: String,
    pub project_json: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedProject {
    pub root: String,
    pub project_json: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExistingProjectInfo {
    pub exists: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedFile {
    pub name: String,
    pub mime_type: String,
    pub base64: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    pub byte_length: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileData {
    #[serde(default)]
    pub base64: Option<String>,
    #[serde(default)]
    pub text: Option<String>,
}

impl FileData {
    fn into_bytes(self) -> AppResult<Vec<u8>> {
        match (self.base64, self.text) {
            (Some(base64), _) => paths::decode_base64(&base64),
            (None, Some(text)) => Ok(text.into_bytes()),
            (None, None) => Err(AppError::InvalidInput(
                "File payload has neither base64 nor text data.".into(),
            )),
        }
    }
}

fn read_project_value(project_json: &str) -> AppResult<Value> {
    if project_json.len() as u64 > MAX_PROJECT_BYTES {
        return Err(AppError::TooLarge(
            "The project document exceeds the 50 MB limit.".into(),
        ));
    }
    Ok(serde_json::from_str(project_json)?)
}

fn validate_project_fields(project: &Value) -> AppResult<(String, String, String)> {
    let id = project
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::InvalidInput("Project id is missing.".into()))?
        .to_string();
    let name = project
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::InvalidInput("Project name is missing.".into()))?
        .to_string();
    let model_path = project
        .get("vehicle")
        .and_then(|vehicle| vehicle.get("modelPath"))
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::InvalidInput("Vehicle modelPath is missing.".into()))?
        .to_string();
    if id.len() > 200 || name.len() > 200 {
        return Err(AppError::InvalidInput(
            "Project id or name is unreasonably long.".into(),
        ));
    }
    Ok((id, name, model_path))
}

fn write_project_assets(
    app: &tauri::AppHandle,
    root: &Path,
    project: &mut Value,
) -> AppResult<()> {
    let model_path = project
        .get("vehicle")
        .and_then(|vehicle| vehicle.get("modelPath"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if !model_path.starts_with("bundled:") {
        return Ok(());
    }
    let asset_id = model_path.trim_start_matches("bundled:");
    let bundled = paths::resolve_bundled_dir(app, asset_id)?;
    let model_source = bundled.join("model").join("vehicle.glb");
    let manifest_source = bundled.join("manifest.json");
    if !model_source.is_file() || !manifest_source.is_file() {
        return Err(AppError::NotFound(
            "Bundled vehicle model or manifest is missing.".into(),
        ));
    }
    let model_bytes = paths::read_limited(&model_source, 200 * 1024 * 1024)?;
    let manifest_bytes = paths::read_limited(&manifest_source, 20 * 1024 * 1024)?;
    let model_target = paths::safe_write_path(root, "assets/vehicle/vehicle.glb")?;
    let manifest_target = paths::safe_write_path(root, "assets/vehicle/manifest.json")?;
    paths::write_atomic(&model_target, &model_bytes, false)?;
    paths::write_atomic(&manifest_target, &manifest_bytes, false)?;

    if let Some(vehicle) = project.get_mut("vehicle").and_then(Value::as_object_mut) {
        vehicle.insert(
            "modelPath".to_string(),
            Value::String("assets/vehicle/vehicle.glb".to_string()),
        );
        vehicle.insert(
            "manifestPath".to_string(),
            Value::String("assets/vehicle/manifest.json".to_string()),
        );
    }
    Ok(())
}

#[tauri::command]
pub fn save_project(
    app: tauri::AppHandle,
    request: SaveProjectRequest,
) -> AppResult<SaveProjectResult> {
    let root_input = request
        .root
        .ok_or_else(|| AppError::InvalidInput("A project folder is required.".into()))?;
    let root = paths::canonical_project_root(&root_input)?;
    let mut value = read_project_value(&request.project_json)?;
    let is_envelope = value.get("project").is_some();
    let (_id, name, _) = {
        let project = if is_envelope {
            value
                .get("project")
                .ok_or_else(|| AppError::InvalidInput("Project envelope is missing project data.".into()))?
        } else {
            &value
        };
        validate_project_fields(project)?
    };

    {
        let project = if is_envelope {
            value
                .get_mut("project")
                .ok_or_else(|| AppError::InvalidInput("Project envelope is missing project data.".into()))?
        } else {
            &mut value
        };
        write_project_assets(&app, &root, project)?;
    }

    let mut total_assets: u64 = 0;
    for file in request.files {
        let relative = paths::safe_relative(&file.relative_path)?;
        let first = relative
            .components()
            .next()
            .and_then(|component| component.as_os_str().to_str())
            .unwrap_or_default();
        if first != "assets" {
            return Err(AppError::InvalidPath(
                "Only asset files under assets/ may be written by a project save.".into(),
            ));
        }
        let bytes = match (file.base64, file.text) {
            (Some(base64), _) => paths::decode_base64(&base64)?,
            (None, Some(text)) => text.into_bytes(),
            (None, None) => continue,
        };
        total_assets = total_assets.saturating_add(bytes.len() as u64);
        if total_assets > MAX_PROJECT_ASSET_BYTES {
            return Err(AppError::TooLarge(
                "Artwork assets exceed the 200 MB project limit.".into(),
            ));
        }
        let target = paths::safe_write_path(&root, &file.relative_path)?;
        paths::write_atomic(&target, &bytes, false)?;
    }

    let saved_at = chrono::Utc::now().to_rfc3339();
    let serialized = if is_envelope {
        if let Some(object) = value.as_object_mut() {
            object.insert("savedAt".to_string(), Value::String(saved_at));
            object.insert(
                "appVersion".to_string(),
                Value::String(env!("CARGO_PKG_VERSION").to_string()),
            );
        }
        value
    } else {
        json!({
            "format": "wrapforge-project",
            "formatVersion": 1,
            "appVersion": env!("CARGO_PKG_VERSION"),
            "savedAt": saved_at,
            "project": value,
        })
    };

    let project_bytes = serde_json::to_vec_pretty(&serialized)?;
    let project_path = paths::safe_write_path(&root, "project.json")?;
    paths::write_atomic(&project_path, &project_bytes, true)?;

    if let Some(thumbnail) = request.thumbnail_data_url {
        if let Ok((mime, bytes)) = paths::parse_data_url(&thumbnail) {
            if mime.starts_with("image/") && bytes.len() as u64 <= paths::MAX_THUMBNAIL_BYTES {
                let target = paths::safe_write_path(&root, "thumbnail.png")?;
                paths::write_atomic(&target, &bytes, false)?;
            }
        }
    }

    let _ = recent::remember(&app, &root, &name);

    Ok(SaveProjectResult {
        root: root.display().to_string(),
        project_json: String::from_utf8(project_bytes)
            .map_err(|_| AppError::InvalidInput("Project JSON was not valid UTF-8.".into()))?,
    })
}

#[tauri::command]
pub fn load_project(root: String) -> AppResult<LoadedProject> {
    let canonical = paths::existing_project_root(&root)?;
    let project_path = paths::safe_read_path(&canonical, "project.json")?;
    let project_json = paths::read_text_limited(&project_path, MAX_PROJECT_BYTES)?;
    Ok(LoadedProject {
        root: canonical.display().to_string(),
        project_json,
    })
}

#[tauri::command]
pub fn inspect_project_root(root: String) -> AppResult<ExistingProjectInfo> {
    let path = paths::absolute_path(&root)?;
    let project_path = path.join("project.json");
    if !project_path.is_file() {
        return Ok(ExistingProjectInfo {
            exists: false,
            id: None,
            name: None,
        });
    }
    let info = paths::read_text_limited(&project_path, MAX_PROJECT_BYTES)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .map(|value| {
            let project = value.get("project").cloned().unwrap_or(value);
            (
                project
                    .get("id")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                project
                    .get("name")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
            )
        });
    Ok(ExistingProjectInfo {
        exists: true,
        id: info.as_ref().and_then(|entry| entry.0.clone()),
        name: info.and_then(|entry| entry.1),
    })
}

#[tauri::command]
pub fn read_project_text(root: String, relative_path: String) -> AppResult<String> {
    let root = paths::existing_project_root(&root)?;
    let path = paths::safe_read_path(&root, &relative_path)?;
    paths::read_text_limited(&path, paths::MAX_TEXT_BYTES)
}

#[tauri::command]
pub fn read_project_binary_base64(root: String, relative_path: String) -> AppResult<String> {
    let root = paths::existing_project_root(&root)?;
    let path = paths::safe_read_path(&root, &relative_path)?;
    let bytes = paths::read_limited(&path, 200 * 1024 * 1024)?;
    Ok(paths::encode_base64(&bytes))
}

fn extension(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase()
}

fn mime_for_extension(ext: &str) -> &'static str {
    match ext {
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "glb" => "model/gltf-binary",
        "gltf" => "model/gltf+json",
        "json" => "application/json",
        "pdf" => "application/pdf",
        "tif" | "tiff" => "image/tiff",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
pub fn import_file(path: String) -> AppResult<ImportedFile> {
    let path = paths::absolute_path(&path)?;
    let metadata = fs::metadata(&path)?;
    if metadata.len() > paths::MAX_IMPORT_BYTES {
        return Err(AppError::TooLarge(format!(
            "Imported files are limited to {} MB.",
            paths::MAX_IMPORT_BYTES / 1024 / 1024
        )));
    }
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::InvalidPath("Imported file has no valid name.".into()))?
        .to_string();
    let ext = extension(&path);
    let mime_type = mime_for_extension(&ext).to_string();
    let bytes = fs::read(&path)?;
    let text = if ext == "svg" || mime_type.starts_with("text/") {
        Some(String::from_utf8_lossy(&bytes).to_string())
    } else {
        None
    };
    Ok(ImportedFile {
        name,
        mime_type,
        base64: paths::encode_base64(&bytes),
        text,
        byte_length: metadata.len(),
    })
}

#[tauri::command]
pub fn write_absolute_file(path: String, data: FileData) -> AppResult<String> {
    let path = paths::absolute_path(&path)?;
    let bytes = data.into_bytes()?;
    if bytes.len() as u64 > paths::MAX_EXPORT_BYTES {
        return Err(AppError::TooLarge(
            "Exports are limited to 500 MB per file.".into(),
        ));
    }
    paths::write_atomic(&path, &bytes, false)?;
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn write_export_file(directory: String, file_name: String, data: FileData) -> AppResult<String> {
    paths::validate_file_name(&file_name)?;
    let directory = paths::absolute_path(&directory)?;
    fs::create_dir_all(&directory)?;
    if !directory.is_dir() {
        return Err(AppError::InvalidPath(
            "Export destination is not a directory.".into(),
        ));
    }
    let bytes = data.into_bytes()?;
    if bytes.len() as u64 > paths::MAX_EXPORT_BYTES {
        return Err(AppError::TooLarge(
            "Exports are limited to 500 MB per file.".into(),
        ));
    }
    let target = directory.join(&file_name);
    paths::write_atomic(&target, &bytes, false)?;
    Ok(target.display().to_string())
}

#[tauri::command]
pub fn read_image_base64(path: String) -> AppResult<String> {
    let path = paths::absolute_path(&path)?;
    let ext = extension(&path);
    if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp") {
        return Err(AppError::Unsupported(
            "Only PNG, JPEG, and WebP images can be read as render results.".into(),
        ));
    }
    let bytes = paths::read_limited(&path, 200 * 1024 * 1024)?;
    Ok(paths::encode_base64(&bytes))
}

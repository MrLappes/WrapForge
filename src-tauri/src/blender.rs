use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::Manager;
use wait_timeout::ChildExt;

use crate::error::{AppError, AppResult};
use crate::paths;

#[derive(Debug, Clone)]
pub struct BlenderInvocation {
    pub program: String,
    pub prefix_args: Vec<String>,
    pub display: String,
    pub via: String,
    pub flatpak: bool,
}

#[derive(Debug)]
pub struct CapturedOutput {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlenderInfo {
    pub found: bool,
    pub executable: Option<String>,
    pub display_name: Option<String>,
    pub via: String,
    pub version: Option<String>,
    pub compatibility: String,
    pub message: String,
    pub checked_at: String,
}

fn configured_candidate(value: &str) -> Option<BlenderInvocation> {
    if value.trim().is_empty() {
        return None;
    }
    let path = PathBuf::from(value.trim());
    if path.is_file() {
        return Some(BlenderInvocation {
            program: path.display().to_string(),
            prefix_args: vec![],
            display: path.display().to_string(),
            via: "configured".to_string(),
            flatpak: false,
        });
    }
    None
}

fn flatpak_invocation() -> Option<BlenderInvocation> {
    let flatpak = find_on_path("flatpak")?;
    Some(BlenderInvocation {
        program: flatpak,
        prefix_args: vec![
            "run".to_string(),
            "--command=blender".to_string(),
            "org.blender.Blender".to_string(),
        ],
        display: "flatpak run --command=blender org.blender.Blender".to_string(),
        via: "flatpak".to_string(),
        flatpak: true,
    })
}

fn find_on_path(name: &str) -> Option<String> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate.display().to_string());
        }
        #[cfg(windows)]
        {
            let exe = dir.join(format!("{name}.exe"));
            if exe.is_file() {
                return Some(exe.display().to_string());
            }
        }
    }
    None
}

pub fn candidates(configured: &str) -> Vec<BlenderInvocation> {
    let mut list: Vec<BlenderInvocation> = Vec::new();
    if let Some(candidate) = configured_candidate(configured) {
        list.push(candidate);
    }
    if let Ok(value) = std::env::var("WRAPFORGE_BLENDER") {
        if let Some(candidate) = configured_candidate(&value) {
            list.push(candidate);
        }
    }
    if let Some(path) = find_on_path("blender") {
        list.push(BlenderInvocation {
            program: path.clone(),
            prefix_args: vec![],
            display: path,
            via: "path".to_string(),
            flatpak: false,
        });
    }
    let mut known = vec![
        "/usr/bin/blender".to_string(),
        "/usr/local/bin/blender".to_string(),
        "/opt/blender/blender".to_string(),
        "/snap/bin/blender".to_string(),
    ];
    if let Some(home) = paths::home_dir() {
        known.push(home.join(".local/bin/blender").display().to_string());
        known.push(
            home.join(".local/share/flatpak/exports/bin/org.blender.Blender")
                .display()
                .to_string(),
        );
        known.push(
            home.join(".var/app/org.blender.Blender/current")
                .display()
                .to_string(),
        );
    }
    known.push("/var/lib/flatpak/exports/bin/org.blender.Blender".to_string());
    for path in known {
        if Path::new(&path).is_file() {
            list.push(BlenderInvocation {
                program: path.clone(),
                prefix_args: vec![],
                display: path,
                via: "known-path".to_string(),
                flatpak: false,
            });
        }
    }
    if let Some(candidate) = flatpak_invocation() {
        list.push(candidate);
    }
    let mut seen = std::collections::HashSet::new();
    list.retain(|candidate| seen.insert(format!("{} {:?}", candidate.program, candidate.prefix_args)));
    list
}

pub fn run_capture(
    invocation: &BlenderInvocation,
    extra_args: &[String],
    timeout: Duration,
) -> AppResult<CapturedOutput> {
    let mut command = Command::new(&invocation.program);
    command
        .args(&invocation.prefix_args)
        .args(extra_args)
        .env("PYTHONUNBUFFERED", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|error| {
        AppError::Process(format!(
            "Could not start {}: {error}",
            invocation.display
        ))
    })?;
    let mut stdout_pipe = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Process("Blender stdout was unavailable.".into()))?;
    let mut stderr_pipe = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Process("Blender stderr was unavailable.".into()))?;
    let stdout_handle = std::thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = stdout_pipe.read_to_end(&mut buffer);
        buffer
    });
    let stderr_handle = std::thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = stderr_pipe.read_to_end(&mut buffer);
        buffer
    });

    let status = match child.wait_timeout(timeout) {
        Ok(Some(status)) => status,
        Ok(None) => {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_handle.join();
            let _ = stderr_handle.join();
            return Err(AppError::Timeout(format!(
                "{} did not respond within {} seconds.",
                invocation.display,
                timeout.as_secs()
            )));
        }
        Err(error) => {
            let _ = child.kill();
            return Err(AppError::Process(error.to_string()));
        }
    };
    let stdout = stdout_handle.join().unwrap_or_default();
    let stderr = stderr_handle.join().unwrap_or_default();
    Ok(CapturedOutput {
        success: status.success(),
        stdout: String::from_utf8_lossy(&stdout).to_string(),
        stderr: String::from_utf8_lossy(&stderr).to_string(),
    })
}

fn parse_version(output: &CapturedOutput) -> Option<String> {
    let text = if output.stdout.trim().is_empty() {
        &output.stderr
    } else {
        &output.stdout
    };
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("Blender ") {
            let trimmed = rest.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn compatibility(version: &str) -> &'static str {
    let major = version
        .split(|character: char| !character.is_ascii_digit())
        .find(|part| !part.is_empty())
        .and_then(|part| part.parse::<u32>().ok());
    match major {
        Some(5) => "tested",
        Some(4) => "untested",
        Some(_) => "unsupported",
        None => "unknown",
    }
}

pub fn find(configured: &str) -> Option<(BlenderInvocation, String)> {
    for candidate in candidates(configured) {
        if let Ok(output) = run_capture(
            &candidate,
            &["--version".to_string()],
            Duration::from_secs(25),
        ) {
            if output.success {
                if let Some(version) = parse_version(&output) {
                    return Some((candidate, version));
                }
            }
        }
    }
    None
}

#[tauri::command]
pub fn discover_blender(configured_path: String) -> AppResult<BlenderInfo> {
    let checked_at = chrono::Utc::now().to_rfc3339();
    match find(&configured_path) {
        Some((invocation, version)) => {
            let compatibility = compatibility(&version);
            Ok(BlenderInfo {
                found: true,
                executable: Some(invocation.display.clone()),
                display_name: Some(format!("Blender {version}")),
                via: invocation.via.clone(),
                version: Some(version.clone()),
                compatibility: compatibility.to_string(),
                message: format!(
                    "Blender {} detected via {}. {}",
                    version,
                    invocation.via,
                    match compatibility {
                        "tested" => "This major version has been exercised by the project's integration tests.",
                        "untested" => "This major version is not covered by the current integration tests.",
                        _ => "This major version is not supported by the current render script.",
                    }
                ),
                checked_at,
            })
        }
        None => Ok(BlenderInfo {
            found: false,
            executable: None,
            display_name: None,
            via: "none".to_string(),
            version: None,
            compatibility: "unknown".to_string(),
            message: "Blender was not found via the configured path, PATH, common install locations, or Flatpak. Install Blender 4.2+ or set the executable path in Preferences.".to_string(),
            checked_at,
        }),
    }
}

const PROBE_SCRIPT: &str = r#"
import json
import os
import platform
import sys

import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)

engines = []
try:
    engines = [item.identifier for item in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
except Exception as error:
    engines = [f"error: {error}"]

gpu_info = {}
try:
    import gpu
    gpu_info = {
        "vendor": gpu.platform.vendor_get(),
        "renderer": gpu.platform.renderer_get(),
        "version": gpu.platform.version_get(),
    }
    try:
        gpu_info["backend"] = gpu.platform.backend_type_get()
    except Exception:
        gpu_info["backend"] = None
except Exception as error:
    gpu_info = {"error": str(error)}

cycles = {}
try:
    addon = bpy.context.preferences.addons.get("cycles")
    if addon is None:
        cycles = {"available": False, "note": "cycles addon is not enabled"}
    else:
        preferences = addon.preferences
        preferences.get_devices()
        cycles = {
            "available": True,
            "computeDeviceType": preferences.compute_device_type,
            "devices": [
                {"name": device.name, "type": device.type, "use": device.use}
                for device in preferences.devices
            ],
        }
except Exception as error:
    cycles = {"available": False, "error": str(error)}

data = {
    "available": True,
    "version": bpy.app.version_string,
    "python": sys.version.split()[0],
    "engines": engines,
    "cpu": {
        "processor": platform.processor(),
        "count": os.cpu_count(),
        "machine": platform.machine(),
        "system": platform.system(),
    },
    "gpu": gpu_info,
    "cycles": cycles,
    "gpuNote": "Values are reported by Blender's GPU module; WrapForge does not run a render benchmark to confirm device use.",
}
print("WF_PROBE " + json.dumps(data), flush=True)
"#;

#[tauri::command]
pub fn probe_blender(app: tauri::AppHandle, configured_path: String) -> AppResult<Value> {
    let Some((invocation, version)) = find(&configured_path) else {
        return Ok(json!({
            "available": false,
            "message": "Blender was not found. Install Blender 4.2+ or configure its path.",
        }));
    };
    if invocation.flatpak {
        let cache = app
            .path()
            .app_cache_dir()
            .map_err(|error| AppError::Io(error.to_string()))?;
        std::fs::create_dir_all(&cache)?;
        let script_path = cache.join(format!("wrapforge-probe-{}.py", std::process::id()));
        std::fs::write(&script_path, PROBE_SCRIPT)?;
        let args = vec![
            "-b".to_string(),
            "--factory-startup".to_string(),
            "--python".to_string(),
            script_path.display().to_string(),
        ];
        let result = run_capture(&invocation, &args, Duration::from_secs(120));
        let _ = std::fs::remove_file(&script_path);
        let output = result?;
        let mut value = parse_probe(&output.stdout).unwrap_or_else(|| {
            json!({
                "available": false,
                "message": "Blender ran but did not return a probe payload.",
                "stderr": output.stderr.lines().rev().take(20).collect::<Vec<_>>().join("\n"),
            })
        });
        if let Some(object) = value.as_object_mut() {
            object.insert("executable".to_string(), json!(invocation.display));
            object.insert("versionReportedByProbe".to_string(), json!(version));
            object.insert("via".to_string(), json!(invocation.via));
        }
        return Ok(value);
    }

    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|error| AppError::Io(error.to_string()))?;
    std::fs::create_dir_all(&cache)?;
    let script_path = cache.join(format!("wrapforge-probe-{}.py", std::process::id()));
    std::fs::write(&script_path, PROBE_SCRIPT)?;
    let args = vec![
        "-b".to_string(),
        "--factory-startup".to_string(),
        "--python".to_string(),
        script_path.display().to_string(),
    ];
    let result = run_capture(&invocation, &args, Duration::from_secs(120));
    let _ = std::fs::remove_file(&script_path);
    let output = result?;
    let mut value = parse_probe(&output.stdout).unwrap_or_else(|| {
        json!({
            "available": false,
            "message": "Blender ran but did not return a probe payload.",
            "stderr": output.stderr.lines().rev().take(20).collect::<Vec<_>>().join("\n"),
        })
    });
    if let Some(object) = value.as_object_mut() {
        object.insert("executable".to_string(), json!(invocation.display));
        object.insert("versionReportedByProbe".to_string(), json!(version));
        object.insert("via".to_string(), json!(invocation.via));
    }
    Ok(value)
}

fn parse_probe(stdout: &str) -> Option<Value> {
    for line in stdout.lines() {
        if let Some(payload) = line.strip_prefix("WF_PROBE ") {
            if let Ok(value) = serde_json::from_str::<Value>(payload) {
                return Some(value);
            }
        }
    }
    None
}

pub fn kill_process(pid: u32) {
    #[cfg(unix)]
    unsafe {
        libc::kill(pid as i32, libc::SIGTERM);
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_version_banner() {
        let output = CapturedOutput {
            success: true,
            stdout: "Blender 5.2.0 LTS\nbuild date: 2026-07-14\n".to_string(),
            stderr: String::new(),
        };
        assert_eq!(parse_version(&output).as_deref(), Some("5.2.0 LTS"));
    }

    #[test]
    fn classifies_compatibility() {
        assert_eq!(compatibility("5.2.0 LTS"), "tested");
        assert_eq!(compatibility("4.5.0 LTS"), "untested");
        assert_eq!(compatibility("3.6.0"), "unsupported");
        assert_eq!(compatibility("unknown"), "unknown");
    }

    #[test]
    fn discovers_blender_when_installed() {
        match find("") {
            Some((_invocation, version)) => assert!(!version.is_empty()),
            None => eprintln!("Blender is not available in this environment; discovery test skipped."),
        }
    }

    #[test]
    fn candidates_are_deduplicated() {
        let candidates = candidates("");
        let mut keys = std::collections::HashSet::new();
        for candidate in &candidates {
            assert!(keys.insert(format!("{} {:?}", candidate.program, candidate.prefix_args)));
        }
    }
}

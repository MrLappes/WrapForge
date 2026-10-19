use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::error::{AppError, AppResult};
use crate::paths;

const MAX_RECENT: usize = 25;
const MAX_RECENT_THUMBNAIL_BYTES: u64 = 1_500_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentProjectEntry {
    pub path: String,
    pub name: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentProject {
    pub path: String,
    pub name: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_data_url: Option<String>,
}

fn index_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Io(format!("Could not resolve app data directory: {error}")))?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join("recent-projects.json"))
}

fn load_entries(app: &tauri::AppHandle) -> AppResult<Vec<RecentProjectEntry>> {
    let path = index_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = paths::read_text_limited(&path, 2 * 1024 * 1024)?;
    let mut entries: Vec<RecentProjectEntry> = serde_json::from_str(&text)?;
    entries.truncate(MAX_RECENT);
    Ok(entries)
}

fn store_entries(app: &tauri::AppHandle, entries: &[RecentProjectEntry]) -> AppResult<()> {
    let path = index_path(app)?;
    let payload = serde_json::to_vec_pretty(entries)?;
    paths::write_atomic(&path, &payload, false)
}

pub fn remember(app: &tauri::AppHandle, root: &Path, name: &str) -> AppResult<()> {
    let root_string = root.display().to_string();
    let mut entries = load_entries(app).unwrap_or_default();
    entries.retain(|entry| entry.path != root_string);
    entries.insert(
        0,
        RecentProjectEntry {
            path: root_string,
            name: name.to_string(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        },
    );
    entries.truncate(MAX_RECENT);
    store_entries(app, &entries)
}

pub fn list(app: &tauri::AppHandle) -> AppResult<Vec<RecentProject>> {
    let entries = load_entries(app)?;
    let original_len = entries.len();
    let mut output = Vec::new();
    for entry in entries {
        let project_file = Path::new(&entry.path).join("project.json");
        if !project_file.is_file() {
            continue;
        }
        let thumbnail_data_url = read_thumbnail(Path::new(&entry.path));
        output.push(RecentProject {
            path: entry.path,
            name: entry.name,
            updated_at: entry.updated_at,
            thumbnail_data_url,
        });
    }
    if output.len() < original_len {
        let retained: Vec<RecentProjectEntry> = output
            .iter()
            .map(|entry| RecentProjectEntry {
                path: entry.path.clone(),
                name: entry.name.clone(),
                updated_at: entry.updated_at.clone(),
            })
            .collect();
        let _ = store_entries(app, &retained);
    }
    Ok(output)
}

fn read_thumbnail(root: &Path) -> Option<String> {
    let path = root.join("thumbnail.png");
    let metadata = fs::metadata(&path).ok()?;
    if metadata.len() == 0 || metadata.len() > MAX_RECENT_THUMBNAIL_BYTES {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    Some(format!(
        "data:image/png;base64,{}",
        paths::encode_base64(&bytes)
    ))
}

#[tauri::command]
pub fn list_recent_projects(app: tauri::AppHandle) -> AppResult<Vec<RecentProject>> {
    list(&app)
}

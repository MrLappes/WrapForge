use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;

use crate::error::{AppError, AppResult};

pub const MAX_PROJECT_BYTES: u64 = 50 * 1024 * 1024;
pub const MAX_PROJECT_ASSET_BYTES: u64 = 200 * 1024 * 1024;
pub const MAX_IMPORT_BYTES: u64 = 50 * 1024 * 1024;
pub const MAX_EXPORT_BYTES: u64 = 500 * 1024 * 1024;
pub const MAX_TEXT_BYTES: u64 = 20 * 1024 * 1024;
pub const MAX_THUMBNAIL_BYTES: u64 = 8 * 1024 * 1024;

pub fn absolute_path(input: &str) -> AppResult<PathBuf> {
    if input.trim().is_empty() {
        return Err(AppError::InvalidPath("Path is empty.".into()));
    }
    if input.contains('\0') {
        return Err(AppError::InvalidPath("Path contains a null byte.".into()));
    }
    let path = PathBuf::from(input);
    if !path.is_absolute() {
        return Err(AppError::InvalidPath(format!(
            "Expected an absolute path, received {input:?}."
        )));
    }
    Ok(path)
}

pub fn canonical_project_root(input: &str) -> AppResult<PathBuf> {
    let path = absolute_path(input)?;
    fs::create_dir_all(&path)?;
    let canonical = path.canonicalize()?;
    if !canonical.is_dir() {
        return Err(AppError::InvalidPath(format!(
            "Project root is not a directory: {}",
            canonical.display()
        )));
    }
    Ok(canonical)
}

pub fn existing_project_root(input: &str) -> AppResult<PathBuf> {
    let path = absolute_path(input)?;
    if !path.is_dir() {
        return Err(AppError::InvalidPath(format!(
            "Project folder does not exist: {}",
            path.display()
        )));
    }
    Ok(path.canonicalize()?)
}

pub fn safe_relative(relative: &str) -> AppResult<PathBuf> {
    if relative.trim().is_empty() {
        return Err(AppError::InvalidPath("Relative path is empty.".into()));
    }
    if relative.contains('\0') {
        return Err(AppError::InvalidPath("Relative path contains a null byte.".into()));
    }
    if relative.contains('\\') {
        return Err(AppError::InvalidPath(
            "Relative paths must use forward slashes.".into(),
        ));
    }
    let path = Path::new(relative);
    if path.is_absolute() {
        return Err(AppError::InvalidPath(format!(
            "Relative path must not be absolute: {relative:?}."
        )));
    }
    for component in path.components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            Component::ParentDir => {
                return Err(AppError::InvalidPath(format!(
                    "Relative path must not contain '..': {relative:?}."
                )))
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err(AppError::InvalidPath(format!(
                    "Relative path must stay inside the project: {relative:?}."
                )))
            }
        }
    }
    Ok(path.to_path_buf())
}

pub fn safe_read_path(root: &Path, relative: &str) -> AppResult<PathBuf> {
    let canonical_root = root.canonicalize()?;
    let relative_path = safe_relative(relative)?;
    let full = canonical_root.join(relative_path);
    if !full.exists() {
        return Err(AppError::NotFound(full.display().to_string()));
    }
    let canonical_full = full.canonicalize()?;
    if !canonical_full.starts_with(&canonical_root) {
        return Err(AppError::InvalidPath(
            "Path escapes the project directory.".into(),
        ));
    }
    Ok(canonical_full)
}

pub fn safe_write_path(root: &Path, relative: &str) -> AppResult<PathBuf> {
    let canonical_root = root.canonicalize()?;
    let relative_path = safe_relative(relative)?;
    let full = canonical_root.join(relative_path);
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent)?;
        let canonical_parent = parent.canonicalize()?;
        if !canonical_parent.starts_with(&canonical_root) {
            return Err(AppError::InvalidPath(
                "Path escapes the project directory.".into(),
            ));
        }
    }
    if full.exists() {
        let canonical_full = full.canonicalize()?;
        if !canonical_full.starts_with(&canonical_root) {
            return Err(AppError::InvalidPath(
                "Path escapes the project directory.".into(),
            ));
        }
    }
    Ok(full)
}

pub fn validate_file_name(name: &str) -> AppResult<()> {
    if name.trim().is_empty() || name.len() > 255 {
        return Err(AppError::InvalidInput("Invalid file name length.".into()));
    }
    if name.contains('/') || name.contains('\\') || name.contains('\0') {
        return Err(AppError::InvalidInput(format!(
            "File name must not contain a path separator: {name:?}."
        )));
    }
    if name == "." || name == ".." {
        return Err(AppError::InvalidInput("Invalid file name.".into()));
    }
    Ok(())
}

pub fn read_limited(path: &Path, limit: u64) -> AppResult<Vec<u8>> {
    let metadata = fs::metadata(path)?;
    if metadata.len() > limit {
        return Err(AppError::TooLarge(format!(
            "{} is {} bytes; the limit is {} bytes.",
            path.display(),
            metadata.len(),
            limit
        )));
    }
    Ok(fs::read(path)?)
}

pub fn read_text_limited(path: &Path, limit: u64) -> AppResult<String> {
    let bytes = read_limited(path, limit)?;
    String::from_utf8(bytes).map_err(|_| AppError::InvalidInput(format!(
        "{} is not valid UTF-8 text.",
        path.display()
    )))
}

pub fn write_atomic(path: &Path, bytes: &[u8], backup: bool) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::InvalidPath("Destination has no parent directory.".into()))?;
    fs::create_dir_all(parent)?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::InvalidPath("Destination has no valid file name.".into()))?;
    let temp = parent.join(format!(".{file_name}.tmp-{}", std::process::id()));
    {
        let mut handle = fs::File::create(&temp)?;
        handle.write_all(bytes)?;
        handle.sync_all()?;
    }
    if backup && path.exists() {
        let backup_path = parent.join(format!("{file_name}.bak"));
        let _ = fs::copy(path, &backup_path);
    }
    #[cfg(unix)]
    {
        fs::rename(&temp, path)?;
    }
    #[cfg(not(unix))]
    {
        if path.exists() {
            fs::remove_file(path)?;
        }
        fs::rename(&temp, path)?;
    }
    Ok(())
}

pub fn encode_base64(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}

pub fn decode_base64(input: &str) -> AppResult<Vec<u8>> {
    let clean = input
        .split_once(',')
        .map(|(_, value)| value)
        .unwrap_or(input);
    Ok(STANDARD.decode(clean.trim())?)
}

pub fn parse_data_url(input: &str) -> AppResult<(String, Vec<u8>)> {
    let (header, payload) = input
        .split_once(',')
        .ok_or_else(|| AppError::InvalidInput("Invalid data URL.".into()))?;
    if !header.starts_with("data:") || !header.contains(";base64") {
        return Err(AppError::InvalidInput(
            "Only base64 data URLs are supported.".into(),
        ));
    }
    let mime = header
        .trim_start_matches("data:")
        .split(';')
        .next()
        .unwrap_or("application/octet-stream")
        .to_string();
    Ok((mime, decode_base64(payload)?))
}

pub fn resolve_bundled_dir(app: &tauri::AppHandle, asset_id: &str) -> AppResult<PathBuf> {
    use tauri::Manager;
    if asset_id != "wrapforge-sample-hatch" {
        return Err(AppError::NotFound(format!(
            "Unknown bundled vehicle asset: {asset_id}"
        )));
    }
    let mut candidates: Vec<PathBuf> = Vec::new();
    // In a debug build the bundled copy next to the binary goes stale as soon as
    // the script is edited, so prefer the source tree.
    if cfg!(debug_assertions) {
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("resources")
                .join("blender")
                .join("render_scene.py"),
        );
    }
    if let Ok(resource) = app.path().resource_dir() {
        candidates.push(resource.join("assets").join("sample-vehicle"));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("assets")
            .join("sample-vehicle"),
    );
    if let Ok(current) = std::env::current_dir() {
        candidates.push(current.join("assets").join("sample-vehicle"));
        candidates.push(current.join("..").join("assets").join("sample-vehicle"));
    }
    for candidate in candidates {
        if candidate.join("manifest.json").is_file() {
            return Ok(candidate);
        }
    }
    Err(AppError::NotFound(
        "The bundled sample vehicle could not be located.".into(),
    ))
}

pub fn resolve_blender_script(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    use tauri::Manager;
    let mut candidates: Vec<PathBuf> = Vec::new();
    // In a debug build the bundled copy next to the binary goes stale as soon as
    // the script is edited, so prefer the source tree.
    if cfg!(debug_assertions) {
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("resources")
                .join("blender")
                .join("render_scene.py"),
        );
    }
    if let Ok(resource) = app.path().resource_dir() {
        candidates.push(resource.join("blender").join("render_scene.py"));
        candidates.push(
            resource
                .join("resources")
                .join("blender")
                .join("render_scene.py"),
        );
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("blender")
            .join("render_scene.py"),
    );
    for candidate in candidates {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err(AppError::NotFound(
        "The Blender render script could not be located.".into(),
    ))
}

pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "wrapforge-path-test-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(&dir).expect("create temp root");
        dir
    }

    #[test]
    fn rejects_traversal_and_absolute_relative_paths() {
        assert!(safe_relative("assets/logo.svg").is_ok());
        assert!(safe_relative("../escape").is_err());
        assert!(safe_relative("assets/../../escape").is_err());
        assert!(safe_relative("/etc/passwd").is_err());
        assert!(safe_relative("assets\\evil").is_err());
        assert!(safe_relative("").is_err());
    }

    #[test]
    fn rejects_invalid_file_names() {
        assert!(validate_file_name("panel.png").is_ok());
        assert!(validate_file_name("../panel.png").is_err());
        assert!(validate_file_name("a/b.png").is_err());
        assert!(validate_file_name("").is_err());
    }

    #[test]
    fn safe_write_and_read_stay_inside_root() {
        let root = temp_root();
        let target = safe_write_path(&root, "assets/artwork/logo.svg").expect("safe path");
        fs::write(&target, b"<svg/>").expect("write");
        let read = safe_read_path(&root, "assets/artwork/logo.svg").expect("read path");
        assert_eq!(fs::read(read).expect("read"), b"<svg/>");
        assert!(safe_read_path(&root, "../outside").is_err());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn atomic_write_replaces_and_backs_up() {
        let root = temp_root();
        let target = root.join("project.json");
        write_atomic(&target, b"first", true).expect("first write");
        write_atomic(&target, b"second", true).expect("second write");
        assert_eq!(fs::read(&target).expect("read target"), b"second");
        assert_eq!(
            fs::read(root.join("project.json.bak")).expect("read backup"),
            b"first"
        );
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn read_limit_blocks_large_files() {
        let root = temp_root();
        let target = root.join("large.bin");
        fs::write(&target, vec![0u8; 32]).expect("write");
        assert!(read_limited(&target, 16).is_err());
        assert!(read_limited(&target, 64).is_ok());
        fs::remove_dir_all(root).ok();
    }
}

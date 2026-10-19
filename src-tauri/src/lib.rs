#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod blender;
mod error;
mod paths;
mod project;
mod recent;
mod render;

use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

pub use error::AppError;

pub struct RenderJob {
    pub pid: u32,
    pub cancelled: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct AppState {
    pub jobs: Mutex<HashMap<String, RenderJob>>,
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            project::save_project,
            project::load_project,
            project::inspect_project_root,
            project::read_project_text,
            project::read_project_binary_base64,
            project::import_file,
            project::write_absolute_file,
            project::write_export_file,
            project::read_image_base64,
            recent::list_recent_projects,
            blender::discover_blender,
            blender::probe_blender,
            render::start_render,
            render::cancel_render,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build WrapForge")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                render::kill_all_jobs(app);
            }
        });
}

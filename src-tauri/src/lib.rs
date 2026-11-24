//! LLM Manager — Rust core.
//!
//! Principles from the blueprint (§1.4):
//! - Host, don't fork: Claude Code / OpenCode run as external processes.
//! - One source of truth for the model: `AppState.settings.active_model`.
//! - Per-process injection, never global edits: env + generated config are
//!   scoped to each spawned process; `~/.claude` and `~/.config/opencode`
//!   are never touched.

mod commands;
mod error;
mod settings;
mod state;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            let loaded = settings::load(&config_dir);
            app.manage(state::AppState::new(loaded, config_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::models::list_models,
            commands::models::test_connection,
            commands::chat::send_chat,
            commands::system::pick_folder,
            commands::agent::run_agent_prompt,
            commands::agent::stop_agent,
        ])
        .run(tauri::generate_context!())
        .expect("error while running LLM Manager");
}

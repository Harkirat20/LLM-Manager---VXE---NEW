use tauri::State;

use crate::error::{AppError, AppResult};
use crate::settings;
use crate::state::AppState;

/// Read the current settings (frontend boot).
#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> settings::AppSettings {
    state.settings()
}

/// Persist settings and update the in-memory state. Returns the saved copy.
#[tauri::command]
pub fn save_settings(
    state: State<'_, AppState>,
    settings: settings::AppSettings,
) -> AppResult<settings::AppSettings> {
    if settings.provider.base_url.trim().is_empty() {
        return Err(AppError::new("Base URL cannot be empty"));
    }
    settings::save(&state.config_dir, &settings)?;
    *state
        .settings
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = settings.clone();
    Ok(settings)
}

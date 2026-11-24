use tauri::State;

use crate::error::{AppError, AppResult};
// Aliased: the `settings` parameter below must not interact with the module
// name in expression paths (`settings::save(...)`). Type-namespace resolution
// would pick the module, but an alias removes any doubt.
use crate::settings as app_settings;
use crate::state::AppState;

/// Read the current settings (frontend boot).
#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> app_settings::AppSettings {
    state.settings()
}

/// Persist settings and update the in-memory state. Returns the saved copy.
#[tauri::command]
pub fn save_settings(
    state: State<'_, AppState>,
    settings: app_settings::AppSettings,
) -> AppResult<app_settings::AppSettings> {
    if settings.provider.base_url.trim().is_empty() {
        return Err(AppError::new("Base URL cannot be empty"));
    }
    app_settings::save(&state.config_dir, &settings)?;
    *state
        .settings
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = settings.clone();
    Ok(settings)
}

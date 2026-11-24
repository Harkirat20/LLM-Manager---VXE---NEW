//! System integration — native folder picker for Code mode sessions.

use crate::error::AppResult;

/// Native folder dialog. Returns `null` when the user cancels.
#[tauri::command]
pub async fn pick_folder() -> AppResult<Option<String>> {
    let picked = rfd::AsyncFileDialog::new()
        .set_title("Choose a project folder")
        .pick_folder()
        .await;
    Ok(picked.map(|handle| {
        handle
            .path()
            .to_string_lossy()
            .into_owned()
    }))
}

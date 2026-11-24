//! Settings persistence — a plain JSON file in the app config dir
//! (`%APPDATA%/com.llmmanager.desktop/settings.json` on Windows).
//!
//! v0.2 swaps the API key storage to the OS keychain (blueprint G4) behind
//! this same module; callers never see where the secret lives.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ProviderSettings {
    pub base_url: String,
    pub api_key: String,
}

impl Default for ProviderSettings {
    fn default() -> Self {
        Self {
            base_url: "http://127.0.0.1:20128".to_string(),
            api_key: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub provider: ProviderSettings,
    /// The Active Model — single source of truth for Chat and Code (G3).
    pub active_model: String,
    pub completed_wizard: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            provider: ProviderSettings::default(),
            active_model: "auto/coding".to_string(),
            completed_wizard: false,
        }
    }
}

fn settings_path(dir: &Path) -> PathBuf {
    dir.join("settings.json")
}

/// Load settings, falling back to defaults on first run or corrupt file.
pub fn load(dir: &Path) -> AppSettings {
    match std::fs::read_to_string(settings_path(dir)) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => AppSettings::default(),
    }
}

/// Atomic-ish save (write temp file, then rename).
pub fn save(dir: &Path, settings: &AppSettings) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("Cannot create config dir: {e}"))?;
    let raw = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    let tmp = dir.join("settings.json.tmp");
    std::fs::write(&tmp, raw).map_err(|e| format!("Cannot write settings: {e}"))?;
    std::fs::rename(&tmp, settings_path(dir)).map_err(|e| format!("Cannot save settings: {e}"))
}

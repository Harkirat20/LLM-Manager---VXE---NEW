//! Shared application state managed by Tauri.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::settings::AppSettings;

pub struct AppState {
    /// Active settings (see `settings::AppSettings`).
    pub settings: Mutex<AppSettings>,
    /// App config dir — settings file + generated per-run agent configs.
    pub config_dir: PathBuf,
    /// Running agent processes: session id → pid, so `stop_agent` can kill
    /// the whole process tree (taskkill /T on Windows).
    pub agents: Mutex<HashMap<String, u32>>,
}

impl AppState {
    pub fn new(settings: AppSettings, config_dir: PathBuf) -> Self {
        Self {
            settings: Mutex::new(settings),
            config_dir,
            agents: Mutex::new(HashMap::new()),
        }
    }

    /// Read settings without ever panicking on a poisoned lock.
    pub fn settings(&self) -> AppSettings {
        self.settings
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }
}

//! Command error type. Serialized as `{ "message": "…" }` so the frontend can
//! show it in toasts / message bubbles.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub message: String,
}

impl AppError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for AppError {}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        Self::new(s)
    }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        Self::new(s)
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::new(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        Self::new(e.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

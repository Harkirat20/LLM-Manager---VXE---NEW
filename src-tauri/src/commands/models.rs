//! OmniRoute model discovery — `GET {base}/v1/models` (blueprint §3.3 V11).

use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatus {
    pub ok: bool,
    pub latency_ms: u64,
    pub message: String,
    pub model_count: usize,
}

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .unwrap_or_default()
}

fn models_url(base: &str) -> String {
    format!("{}/v1/models", base.trim().trim_end_matches('/'))
}

async fn fetch_models(base: &str, key: &str) -> AppResult<Vec<ModelInfo>> {
    let mut req = http().get(models_url(base));
    if !key.is_empty() {
        req = req.bearer_auth(key);
    }
    let res = req.send().await.map_err(|e| {
        AppError::new(format!("Cannot reach OmniRoute at {base}: {e}"))
    })?;
    let status = res.status();
    if !status.is_success() {
        return Err(AppError::new(format!(
            "OmniRoute /v1/models returned HTTP {status}"
        )));
    }
    let body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| AppError::new(format!("Bad /v1/models payload: {e}")))?;

    let mut out = Vec::new();
    if let Some(items) = body.get("data").and_then(|d| d.as_array()) {
        for item in items {
            if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                out.push(ModelInfo {
                    id: id.to_string(),
                    label: item
                        .get("name")
                        .and_then(|v| v.as_str())
                        .map(str::to_string),
                });
            }
        }
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out.dedup_by(|a, b| a.id == b.id);
    Ok(out)
}

/// List models from the configured provider (used by the Model Hub picker).
#[tauri::command]
pub async fn list_models(state: State<'_, AppState>) -> AppResult<Vec<ModelInfo>> {
    let s = state.settings();
    fetch_models(&s.provider.base_url, &s.provider.api_key).await
}

/// Wizard / Settings "Test connection" — reports status instead of erroring.
#[tauri::command]
pub async fn test_connection(
    base_url: String,
    api_key: String,
) -> AppResult<ConnectionStatus> {
    let start = Instant::now();
    let url = base_url.trim().trim_end_matches('/').to_string();
    match fetch_models(&url, &api_key.trim()).await {
        Ok(models) => Ok(ConnectionStatus {
            ok: true,
            latency_ms: start.elapsed().as_millis() as u64,
            message: format!("OmniRoute reachable — {} models listed", models.len()),
            model_count: models.len(),
        }),
        Err(e) => Ok(ConnectionStatus {
            ok: false,
            latency_ms: start.elapsed().as_millis() as u64,
            message: e.message,
            model_count: 0,
        }),
    }
}

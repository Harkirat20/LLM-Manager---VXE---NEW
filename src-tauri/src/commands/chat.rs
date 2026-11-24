//! Chat completions — OpenAI-compatible `POST {base}/v1/chat/completions`.
//! Non-streaming in v0.1; streaming (SSE → Tauri events) lands with spike V6.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageIn {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub model: String,
    pub base_url: String,
    pub api_key: String,
    pub messages: Vec<ChatMessageIn>,
}

#[derive(Debug, Serialize)]
struct OutgoingMessage<'a> {
    role: &'a str,
    content: &'a str,
}

/// Extract `choices[0].message.content`, tolerating both string content and
/// the array-of-parts shape some providers return.
fn extract_content(v: &serde_json::Value) -> Option<String> {
    let content = v.pointer("/choices/0/message/content")?;
    match content {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Array(parts) => {
            let mut out = String::new();
            for p in parts {
                if let Some(t) = p.get("text").and_then(|t| t.as_str()) {
                    out.push_str(t);
                }
            }
            if out.is_empty() {
                None
            } else {
                Some(out)
            }
        }
        _ => v
            .pointer("/choices/0/text")
            .and_then(|t| t.as_str())
            .map(str::to_string),
    }
}

#[tauri::command]
pub async fn send_chat(
    state: State<'_, AppState>,
    req: ChatRequest,
) -> AppResult<String> {
    let base = req.base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err(AppError::new("Provider base URL is not configured"));
    }
    if req.model.trim().is_empty() {
        return Err(AppError::new("No active model selected"));
    }
    if req.messages.is_empty() {
        return Err(AppError::new("No messages to send"));
    }

    let url = format!("{base}/v1/chat/completions");
    let outgoing: Vec<OutgoingMessage> = req
        .messages
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant" || m.role == "system")
        .map(|m| OutgoingMessage {
            role: &m.role,
            content: &m.content,
        })
        .collect();

    let body = serde_json::json!({
        "model": req.model,
        "messages": outgoing,
        "stream": false,
    });

    let mut http_req = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .unwrap_or_default()
        .post(&url)
        .json(&body);
    if !req.api_key.trim().is_empty() {
        http_req = http_req.bearer_auth(req.api_key.trim());
    }

    let res = http_req.send().await.map_err(|e| {
        AppError::new(format!("Request to {base} failed: {e}"))
    })?;

    let status = res.status();
    if !status.is_success() {
        // Surface OmniRoute's error body — it explains quota / routing issues.
        let detail = res.text().await.unwrap_or_default();
        let detail: String = detail.chars().take(600).collect();
        return Err(AppError::new(format!(
            "Provider returned HTTP {status}: {detail}"
        )));
    }

    let payload: serde_json::Value = res
        .json()
        .await
        .map_err(|e| AppError::new(format!("Bad chat completion payload: {e}")))?;

    extract_content(&payload).ok_or_else(|| {
        AppError::new("Unexpected response shape from /v1/chat/completions")
    })
}

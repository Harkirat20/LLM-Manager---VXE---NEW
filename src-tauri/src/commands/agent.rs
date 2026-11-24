//! Code mode agents — host Claude Code / OpenCode as external processes with
//! **per-process** model injection (blueprint G1, §1.4.3).
//!
//! What this does for each run:
//! - `claude`: env-only auth (`ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`
//!   pointing at OmniRoute, `ANTHROPIC_MODEL` = Active Model) + structured
//!   output (`--output-format stream-json`) — spikes V1/V2/V6.
//! - `opencode`: a generated config file in *our* config dir, passed via
//!   `OPENCODE_CONFIG` — never `~/.config/opencode` — spike V4 [VERIFY].
//!
//! Output lines are streamed to the UI as `agent-line` events; the final
//! assistant text is returned for the chat pane.

use std::path::Path;
use std::process::Stdio;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSpec {
    /// "claude" | "opencode"
    pub agent: String,
    pub folder: String,
    pub model: String,
    /// "manual" | "acceptEdits" | "plan" | "bypass"
    pub permission_mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentLine {
    pub session_id: String,
    pub line: String,
}

// ---------------------------------------------------------------------------
// spawn helpers
// ---------------------------------------------------------------------------

fn ensure_on_path(bin: &str) -> AppResult<()> {
    let found = std::process::Command::new(if cfg!(windows) { "where" } else { "which" })
        .arg(bin)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if found {
        return Ok(());
    }
    Err(AppError::new(match bin {
        "claude" => {
            "Claude Code was not found on PATH. Install it first:\n\
             npm install -g @anthropic-ai/claude-code"
        }
        "opencode" => {
            "OpenCode was not found on PATH. Install it first:\n\
             npm install -g opencode-ai  (see https://opencode.ai)"
        }
        other => other,
    }))
}

/// Strip ANSI escape sequences so panes stay readable.
fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            // skip until a terminating letter (CSI … m, etc.)
            while let Some(&n) = chars.peek() {
                chars.next();
                if n.is_ascii_alphabetic() || n == 'm' {
                    break;
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

/// Pull human-useful text out of one structured output line.
/// Returns `None` for lines that should only appear in the Terminal pane.
fn extract_text(agent: &str, line: &str, allow_result_fallback: bool) -> Option<String> {
    if line.trim().is_empty() {
        return None;
    }
    let v: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        // Not JSON → plain output (opencode, warnings): keep it.
        Err(_) => return Some(strip_ansi(line)),
    };
    let kind = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
    match (agent, kind) {
        ("claude", "assistant") | ("opencode", "assistant") => {
            let parts = v.pointer("/message/content")?.as_array()?;
            let mut out = String::new();
            for p in parts {
                match p.get("type").and_then(|t| t.as_str()) {
                    Some("text") => {
                        if let Some(t) = p.get("text").and_then(|t| t.as_str()) {
                            out.push_str(t);
                        }
                    }
                    Some("tool_use") => {
                        let name = p
                            .get("name")
                            .and_then(|n| n.as_str())
                            .unwrap_or("tool");
                        out.push_str(&format!("\n[tool: {name}]\n"));
                    }
                    _ => {}
                }
            }
            if out.trim().is_empty() {
                None
            } else {
                Some(out)
            }
        }
        // `claude -p --output-format stream-json` finishes with a result
        // event; use it only if no assistant text was captured.
        (_, "result") if allow_result_fallback => v
            .get("result")
            .and_then(|r| r.as_str())
            .map(|s| s.to_string()),
        // system / event / metadata → Terminal pane only
        _ => None,
    }
}

/// One-line summary for the Terminal pane.
fn humanize_line(agent: &str, line: &str) -> String {
    let cleaned = strip_ansi(line);
    let v: serde_json::Value = match serde_json::from_str(&cleaned) {
        Ok(v) => v,
        Err(_) => return cleaned,
    };
    let kind = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
    match kind {
        "assistant" => {
            let text = extract_text(agent, line, false).unwrap_or_default();
            let short: String = text.trim().chars().take(240).collect();
            format!("assistant: {short}")
        }
        "tool_use" => {
            let name = v.get("name").and_then(|n| n.as_str()).unwrap_or("?");
            format!("tool: {name}")
        }
        "system" => {
            let sub = v.get("subtype").and_then(|s| s.as_str()).unwrap_or("");
            format!("system: {sub}")
        }
        "result" => {
            let sub = v.get("subtype").and_then(|s| s.as_str()).unwrap_or("");
            format!("result: {sub}")
        }
        "" => cleaned,
        other => format!("{other}: {}", {
            let mut s = cleaned;
            if s.len() > 200 {
                s.truncate(200);
            }
            s
        }),
    }
}

fn build_command(
    spec: &AgentSpec,
    prompt: &str,
    base_url: &str,
    api_key: &str,
    config_dir: &Path,
) -> AppResult<Command> {
    let base = base_url.trim().trim_end_matches('/');
    let model = spec.model.trim();
    if model.is_empty() {
        return Err(AppError::new("No model selected for this session"));
    }

    let mut args: Vec<String> = Vec::new();
    let mut extra_env: Vec<(String, String)> = Vec::new();

    match spec.agent.as_str() {
        "claude" => {
            // Per-process env injection — the signature feature. Nothing is
            // written to ~/.claude or the system environment.
            args.push("-p".into());
            args.push(prompt.to_string());
            args.push("--output-format".into());
            args.push("stream-json".into());
            args.push("--verbose".into()); // required with -p + stream-json
            match spec.permission_mode.as_str() {
                "bypass" => args.push("--dangerously-skip-permissions".into()),
                "acceptEdits" => {
                    args.push("--permission-mode".into());
                    args.push("acceptEdits".into());
                }
                "plan" => {
                    args.push("--permission-mode".into());
                    args.push("plan".into());
                }
                _ => {
                    args.push("--permission-mode".into());
                    args.push("default".into());
                }
            }
            extra_env.push(("ANTHROPIC_BASE_URL".into(), base.to_string()));
            if !api_key.trim().is_empty() {
                extra_env.push((
                    "ANTHROPIC_AUTH_TOKEN".into(),
                    api_key.trim().to_string(),
                ));
            }
            extra_env.push(("ANTHROPIC_MODEL".into(), model.to_string()));
            extra_env.push(("ANTHROPIC_SMALL_FAST_MODEL".into(), model.to_string()));
            // Local-first: silence non-essential telemetry (G4).
            extra_env.push((
                "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC".into(),
                "1".into(),
            ));
        }
        "opencode" => {
            // Generated config lives in OUR config dir; OPENCODE_CONFIG points
            // this process at it. The user's ~/.config/opencode is untouched.
            // [VERIFY V4] — exact provider schema per current OpenCode docs.
            let cfg = serde_json::json!({
                "$schema": "https://opencode.ai/config.json",
                "provider": {
                    "omniroute": {
                        "npm": "@ai-sdk/openai-compatible",
                        "name": "OmniRoute",
                        "options": {
                            "baseURL": format!("{base}/v1"),
                            "apiKey": if api_key.trim().is_empty() { "local" } else { api_key.trim() }
                        },
                        "models": {
                            model: { "name": model }
                        }
                    }
                },
                "model": format!("omniroute/{model}")
            });
            let cfg_path = config_dir.join("opencode.generated.json");
            std::fs::create_dir_all(config_dir)?;
            std::fs::write(
                &cfg_path,
                serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?,
            )?;
            extra_env.push((
                "OPENCODE_CONFIG".into(),
                cfg_path.to_string_lossy().into_owned(),
            ));
            args.push("run".into());
            args.push("--model".into());
            args.push(format!("omniroute/{model}"));
            args.push(prompt.to_string());
        }
        other => {
            return Err(AppError::new(format!("Unknown agent: {other}")));
        }
    }

    let bin = if spec.agent == "claude" { "claude" } else { "opencode" };
    ensure_on_path(bin)?;

    // On Windows, npm installs are `.cmd` shims — run through cmd.exe so the
    // shim resolves; taskkill /T later kills the whole tree (V8 note).
    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(bin);
        c
    } else {
        Command::new(bin)
    };
    cmd.args(&args)
        .current_dir(&spec.folder)
        .envs(extra_env)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // Safety: no orphan processes if we exit on an error path.
        .kill_on_drop(true);
    Ok(cmd)
}

fn kill_tree(pid: u32) {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

/// Run one prompt through the session's agent and return the assistant text.
/// Streams `agent-line` events while running (Terminal pane).
#[tauri::command]
pub async fn run_agent_prompt(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    prompt: String,
    spec: AgentSpec,
) -> AppResult<String> {
    if prompt.trim().is_empty() {
        return Err(AppError::new("Prompt is empty"));
    }
    if !Path::new(&spec.folder).is_dir() {
        return Err(AppError::new(format!(
            "Project folder does not exist: {}",
            spec.folder
        )));
    }

    let settings = state.settings();
    let mut cmd = build_command(
        &spec,
        &prompt,
        &settings.provider.base_url,
        &settings.provider.api_key,
        &state.config_dir,
    )?;

    let mut child = cmd.spawn().map_err(|e| {
        AppError::new(format!("Failed to start {}: {e}", spec.agent))
    })?;
    let pid = child
        .id()
        .ok_or_else(|| AppError::new("Agent process vanished immediately"))?;

    // Register for stop_agent (kill by pid → whole tree).
    {
        let mut agents = state
            .agents
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        agents.insert(session_id.clone(), pid);
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::new("Agent stdout unavailable"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::new("Agent stderr unavailable"))?;

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    // stdout → events + collected text
    let app_out = app.clone();
    let sid_out = session_id.clone();
    let agent_out = spec.agent.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let human = humanize_line(&agent_out, &line);
            let _ = app_out.emit(
                "agent-line",
                AgentLine {
                    session_id: sid_out.clone(),
                    line: human,
                },
            );
            let _ = tx.send(line);
        }
    });

    // stderr → events only
    let app_err = app.clone();
    let sid_err = session_id.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_err.emit(
                "agent-line",
                AgentLine {
                    session_id: sid_err.clone(),
                    line: format!("err: {}", strip_ansi(&line)),
                },
            );
        }
    });

    // Drain structured output until the pipe closes…
    let mut text = String::new();
    while let Some(line) = rx.recv().await {
        if let Some(t) = extract_text(&spec.agent, &line, text.trim().is_empty()) {
            text.push_str(t.trim_end());
            text.push('\n');
        }
    }

    // …then reap the process and clean up.
    let status = child.wait().await;
    {
        let mut agents = state
            .agents
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        agents.remove(&session_id);
    }
    let status = status.map_err(|e| AppError::new(format!("Agent wait failed: {e}")))?;
    if !status.success() && text.trim().is_empty() {
        let code = status
            .code()
            .map(|c| c.to_string())
            .unwrap_or_else(|| "killed".into());
        return Err(AppError::new(format!(
            "{agent} exited with status {code} — see the Terminal pane",
            agent = spec.agent
        )));
    }

    let text = text.trim().to_string();
    if text.is_empty() {
        Ok("(no text output — see the Terminal pane)".to_string())
    } else {
        Ok(text)
    }
}

/// Stop a running agent. Kills the whole process tree on Windows
/// (`taskkill /T /F`), so the ConPTY/job-object concern (V8) is covered for
/// the non-interactive path.
#[tauri::command]
pub fn stop_agent(state: State<'_, AppState>, session_id: String) -> AppResult<()> {
    let pid = {
        let agents = state
            .agents
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        agents.get(&session_id).copied()
    };
    if let Some(pid) = pid {
        kill_tree(pid);
    }
    Ok(())
}

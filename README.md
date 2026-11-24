# LLM Manager (VXE)

A native desktop app that feels like Claude Desktop but runs on **any model**
through **OmniRoute** — with the signature **Model Hub**: the model you pick in
the app is automatically injected into Claude Code and OpenCode. No env vars,
no config files, no API keys to wire up by hand.

> Blueprint: [`docs/AI-Manager-Blueprint.md`](docs/AI-Manager-Blueprint.md)
> (v0.1 draft, 2026-11-24). Working name in the blueprint is *AI Manager*;
> this build is named **LLM Manager**.

## Stack

| Layer    | Tech                                   |
| -------- | -------------------------------------- |
| Shell    | Tauri v2 (Rust core, Windows x64 first) |
| Core     | Rust — settings, OmniRoute client, agent hosting |
| UI       | React 18 + TypeScript + Vite + zustand |
| Styling  | Hand-rolled CSS — warm cream / clay / serif (Claude-Desktop feel) |
| Backend  | OmniRoute at `http://127.0.0.1:20128/v1` (any OpenAI-compatible gateway) |

## What's in v0.1 (this repo)

- **App shell** — sidebar, Home / Code mode switcher, warm-light theme,
  settings screen, first-run wizard.
- **Chat mode** — conversations, markdown rendering, model picker, "served by"
  chip, incognito chats, empty-state hero, composer (Enter/Shift+Enter).
- **Model Hub** — one *Active Model* drives Chat **and** Code (G3); model list
  fetched from OmniRoute `/v1/models` with graceful fallback suggestions.
- **Code mode** — session list, new-session flow (folder picker, agent,
  model, permission mode), pane workspace (Chat / Terminal / Diff / Files /
  Preview), live `agent-line` streaming to the terminal pane.
- **Rust core** — JSON settings persistence, `send_chat` (OpenAI-compatible),
  `list_models` / `test_connection`, `run_agent_prompt` with **per-process
  env injection** (`ANTHROPIC_BASE_URL`/`AUTH_TOKEN`/`MODEL` for Claude Code;
  generated `OPENCODE_CONFIG` for OpenCode), process-tree kill on stop
  (`taskkill /T /F` on Windows).
- **Browser preview** — the UI runs in a plain browser with a mock IPC layer
  (`src/lib/mock.ts`) so you can develop without a Rust toolchain.

## Develop

```bash
npm install

# UI only (browser, mocked backend) — no Rust needed:
npm run dev

# Full app — requires Rust **≥ 1.90** (Tauri v2's MSRV) plus the Tauri v2
# prerequisites: https://v2.tauri.app/start/prerequisites/
npm run tauri dev

# Windows NSIS installer:
npm run tauri build
```

> **Note:** this workspace's sandbox has no Rust toolchain and blocks
> crates.io, so the Rust side is written to compile with `cargo` on your
> machine (`cargo check` inside `src-tauri/` is the first thing to run there).
>
> The Rust/IPC layer was instead verified against Tauri's own sources on
> GitHub — command-name casing (`RenamePolicy::Keep`), camelCase argument
> binding, struct-arg wrapping (`{ req: … }`), capability/ACL validation,
> and `tauri.conf.json` key schemas (see `git log` for the audit).

### Prerequisites on the target machine (Windows 10/11 x64)

- WebView2 (installer bootstraps it)
- Node.js — for Claude Code / OpenCode installs
- `npm install -g @anthropic-ai/claude-code` (and/or `opencode-ai`)
- OmniRoute running locally (`npx omniroute serve --headless` — verify flags,
  spike V10)

## Phase 0 spikes this scaffold maps to

| Spike | Where |
| ----- | ----- |
| V1/V2 env-only Claude Code auth | `src-tauri/src/commands/agent.rs` (`build_command`) |
| V4 OpenCode generated config | same file, `OPENCODE_CONFIG` branch **[VERIFY]** |
| V6/V7 structured I/O | `--output-format stream-json` parsing in `extract_text` (partial) |
| V8 PTY / terminal | not yet — current path is non-interactive `claude -p` |
| V10 OmniRoute headless sidecar | not yet — connect to an existing instance |
| V11 `/v1/models` + decision headers | `src-tauri/src/commands/models.rs` (headers: TODO) |

## Repository layout

```
docs/AI-Manager-Blueprint.md   # the blueprint
scripts/gen_icons.py           # regenerates src-tauri/icons (PNG + ICO)
src/                           # React UI
  lib/bridge.ts                # IPC boundary (Tauri ⇄ browser mock)
  lib/mock.ts                  # browser mock backend
  store/app-store.ts           # global state (Active Model, sessions, chat)
  components/                  # Sidebar, ChatView, CodeView, Settings, Wizard…
src-tauri/
  src/lib.rs                   # Tauri builder + command registration
  src/settings.rs              # JSON settings persistence (keychain in v0.2)
  src/state.rs                 # shared state (settings, running agents)
  src/commands/                # settings, models, chat, agent, system
  tauri.conf.json              # bundle config (NSIS targets, icons)
  capabilities/default.json    # v2 ACL for the main window
```

## Roadmap (from the blueprint)

1. **Phase 0** — run the spike checklist V1–V11 before building further.
2. **v0.2** — streaming chat (SSE → events), PTY terminal (portable-pty /
   xterm.js), diff/files panes, OS keychain for the API key, attachments.
3. **v1** — per the blueprint's scope tables: projects, artifacts, MCP,
   worktrees, side chat, notifications, shortcuts.

Non-goals (v1): cloud sync, accounts, computer use, forking the agents.

## License

See [LICENSE](LICENSE).

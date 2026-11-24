# AI Manager — Project Blueprint

| | |
|---|---|
| **Working title** | AI Manager (codename; rename freely) |
| **Version** | 0.1 (draft) |
| **Date** | 2026-11-24 |
| **Target** | Windows 10/11 x64 `.exe` (NSIS installer). macOS/Linux later, same codebase |
| **Stack** | Tauri v2 · Rust core · React + TypeScript UI |
| **Audience** | Personal use (single user, local-first) |
| **Research basis** | Public Claude/Claude Code docs, release notes, OmniRoute GitHub repo — all as of 2026-11-24 (see Appendix F) |

Items tagged **[VERIFY]** are technical facts I could not confirm from public docs. Each one is turned into a checkable item in the Phase 0 spike (Section 2.3). Do not build on them before they pass.

---

## 0. TL;DR

AI Manager is a native desktop app that looks and feels like Claude Desktop but runs on **any model** through **OmniRoute** (a local AI gateway/router). It has two modes:

- **Chat mode** — conversations, projects, artifacts, memory, attachments, connectors.
- **Code mode** — parallel coding sessions powered by **Claude Code** and **OpenCode**, with panes for chat, diff, terminal, files, and a preview browser.

**The signature feature — Model Hub:** the model you select in the app's model picker is automatically injected into Claude Code and OpenCode. No manual setup of env vars, config files, or API keys. Change the model once and Chat and Code follow.

**Definition of done for the MVP:**
1. Fresh install → first-run wizard → connect one provider → pick a model.
2. Chat answers using that model.
3. Open Code mode → pick a folder → Claude Code (or OpenCode) runs on the *same* model with zero config.
4. Switch the model in the picker → both modes follow (Code sessions hot-swap or restart, see 6.6).
5. Nothing in `~/.claude`, `~/.config/opencode` or the system environment was edited by hand.

---

## 1. Vision, goals, non-goals

### 1.1 Vision
One calm, Claude-Desktop-style workspace to talk to any model and to run coding agents on any model, with routing, fallback and quota handled underneath.

### 1.2 Goals
| # | Goal | Measure |
|---|---|---|
| G1 | Zero-config model injection into Claude Code and OpenCode | 0 manual steps after first-run wizard |
| G2 | UI parity in *feel* with Claude Desktop (layout, typography, warmth, shortcuts) | Side-by-side review passes your eye test |
| G3 | One model selection drives Chat and Code | Switch model → next message/session uses it |
| G4 | Local-first and private | No cloud account, no telemetry, keys in OS keychain |
| G5 | Fast and light | Cold start < 1.5 s to interactive UI (OmniRoute start excluded); idle RAM < 300 MB excluding agent processes |
| G6 | Resilient routing | Provider failure/quota exhaustion falls back automatically (OmniRoute combos) and the UI explains what happened |

### 1.3 Non-goals (v1)
- No cloud sync, accounts, team features, admin/enterprise controls, billing.
- No mobile apps, no phone "Dispatch", no Remote Control.
- No computer use (screen control), no browser-extension agent, no meetings/whiteboards/sheets.
- No re-implementation of Claude Code or OpenCode. We **host** them.
- No copying of Anthropic brand assets (logo, name, fonts). See 5.9.

### 1.4 Principles
1. **Host, don't fork.** Use Claude Code and OpenCode as external processes behind an adapter. Their updates become free upgrades.
2. **One source of truth for the model** (the *Active Model* state) — everything else derives from it.
3. **Per-process injection, never global edits.** Env vars and generated config files are scoped to the spawned process. The user's real config stays untouched.
4. **Degrade gracefully.** If structured integration breaks (CLI output format changes), fall back to a plain terminal session that always works.
5. **Local-first.** Everything on disk in SQLite + files; export is trivial.
6. **Respect provider terms.** Surface OmniRoute's terms-risk flags; don't hide them.

---

## 2. Assumptions, open questions, and the Phase 0 spike

### 2.1 Interpretations I made (correct me if wrong)
| ID | Your words | My interpretation |
|---|---|---|
| A1 | "default selected AI model **in browser**" | The model selected in this app's own model picker (the app UI is a webview, i.e., "browser"). If you instead meant the model chosen in the OmniRoute web dashboard (default combo), we also support reading it — see 4.1.6 |
| A2 | "Built-in Claude Code and OpenCode" | Built-in *integration*: the app detects, launches and configures them. Claude Code is proprietary, so the app helps you install it rather than bundling its binary. OpenCode is open source and may be bundled later |
| A3 | "Model providers and routers … omniroute" | OmniRoute is the default and primary backend. The design keeps a `ModelBackend` abstraction so other OpenAI-compatible routers/providers (LiteLLM, OpenRouter, Ollama, …) can be added |
| A4 | "Chat mode and code mode" | Two top-level modes mirroring Claude Desktop's **Home** (chat) and **Code** areas. The agentic non-code "tasks" side of Claude's Home is a later phase |
| A5 | "PC exe" | Windows is the first-class target. Windows-specific concerns (ConPTY, job objects, WebView2, Git for Windows, WSL) are designed in from day one |

### 2.2 Honest alternatives to test BEFORE writing code (1–2 hours)
1. **Official Claude Desktop with a gateway.** Claude's docs describe a third-party/gateway mode for Desktop that sends all requests to a provider you configure. If OmniRoute's Anthropic-compatible endpoint works there, you may already get most of this for free. Test it so you know exactly what your app adds. (Gateway mode targets specific providers and has limits such as no web/mobile sync — check current docs.)
2. **OmniRoute's own launchers.** OmniRoute documents `omniroute run` (launches Claude Code, OpenCode and others pre-configured) and `omniroute configure` (interactive provider+model picker). Try them. They are the fallback implementation of the injection feature and a reference for correct env/config values.

If both feel sufficient, you don't need this app. If you want the unified Claude-like UI, per-session control, a shared model picker, and the Code-mode workspace — build it.

### 2.3 Phase 0 spike checklist (prove before building)
| # | Verify | Pass criterion |
|---|---|---|
| V1 | Claude Code accepts `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` pointing at OmniRoute **with or without `/v1`** | A prompt round-trips; response is served by an OmniRoute-routed non-Anthropic model |
| V2 | Env-only auth skips Claude Code login/onboarding prompts | `claude` starts straight into a session with no sign-in screen |
| V3 | Tool calling works on at least 2 non-Anthropic models via OmniRoute (file edit + bash) | Agent can edit a file and run a command end-to-end |
| V4 | OpenCode accepts a generated config (`OPENCODE_CONFIG` or equivalent) with a custom OpenAI-compatible provider whose model id contains a slash (e.g. `auto/coding`) | Model resolves; a coding turn completes |
| V5 | Hot-swap: pin an OmniRoute API key to a model/combo (`forcedModel`) and change it while a CLI session is running | Next turn in the *same* process uses the new model |
| V6 | Claude Code structured I/O (`--output-format stream-json`, `--input-format stream-json`, partial messages, permission-prompt hook) provides enough events to render a rich UI | Text deltas, tool calls, tool results, permission requests all observable |
| V7 | OpenCode server mode (HTTP/SSE API) provides equivalent events | Same as V6 |
| V8 | `portable-pty` (ConPTY) hosts both CLIs with correct resize, colors, Ctrl-C, and process-tree kill on Windows | xterm.js session indistinguishable from Windows Terminal for basic use |
| V9 | Claude Code on native Windows: required shell/Git dependency | Documented in first-run wizard |
| V10 | OmniRoute runs headless as a child process (`serve --headless` or equivalent) with a configurable port and data dir; Node version requirement known | Starts/stops cleanly; no orphan processes after app exit |
| V11 | OmniRoute `/v1/models` filters (capability, context, tools) and `X-OmniRoute-Decision` response header are available as documented | Model picker can show tool-capable models only; chat footer can show which provider served the reply |

**Spike exit rule:** if V1–V3 fail for every model you care about, stop and rethink (Claude Code needs strong tool calling). If V5 fails, use the restart strategy (6.6, option C) — still acceptable.

---

## 3. Research findings

### 3.1 Claude Desktop — feature inventory as of 2026-11-24

**Shape of the app today.** Claude Desktop is one app (Windows, macOS, Linux in beta). Since the "new Claude" rollout (Sept 16, 2026) chat and Cowork share one conversation experience, and from Nov 10, 2026 an unset admin/home setting opens this merged **Unified Claude** by default. The sidebar shows **Home** (chats and tasks together) and **Code**; a **New** button starts a chat or a task from one composer. Older accounts may still show separate Chat/Cowork/Code tabs. A **Stable/Latest** update channel was added Nov 17, 2026. Testing in July 2026 suggested a mode switcher at the top of the sidebar and **Projects** surfaced above recents (pin/sort), which may or may not have shipped to you.

**Scope decision legend:** **v1** = in the first release · **v2** = planned later · **Out** = not planned.

#### 3.1.1 Chat / Home
| Feature in Claude Desktop | Notes | Our scope |
|---|---|---|
| Conversations with model picker | Switch model mid-conversation | **v1** |
| Adaptive/extended thinking and effort levels | Effort menu in Code; thinking shown optionally | **v1** (toggle + effort where backend supports) |
| Attachments: images, PDFs, files, drag-drop | | **v1** |
| Web search | Via tools/connectors | **v1** (via OmniRoute/MCP search tools) [VERIFY] |
| Projects (instructions + knowledge files) | Pin/sort in sidebar | **v1** |
| Artifacts (HTML/React/SVG/Markdown/Mermaid/PDF; editable in place) | Plus Design/Slides/Docs artifact types | **v1** basic types · Design/Slides/Docs **Out** |
| Draft editing in place (highlight → instruct) | Opens beside chat | **v2** |
| Interactive inline visuals (charts/diagrams) | | **v2** |
| Memory (editable topics, sensitive-topics toggle) | Cloud memory in Claude | **v2** (local, editable, opt-in) |
| Search past chats | | **v1** (full-text, local) |
| Incognito chat | | **v1** |
| Styles / custom instructions | | **v1** |
| Quick Entry (global hotkey mini-composer) | Desktop-only | **v1** |
| Voice mode / dictation | | **v2** |
| Research (multi-step deep research) | | **v2** |
| File creation (docx/xlsx/pptx/pdf) | | **v2** |
| Connectors / MCP, Desktop Extensions | MCP servers via GUI | **v1** MCP (JSON config + GUI) · extensions packaging **Out** |
| Reflect (monthly recap), break reminders/quiet hours | | **Out** |
| Cowork tasks, scheduled tasks, Dispatch, computer use, Claude in Chrome | Agentic work on folders/screens | **v2** (folder tasks via the Code engine) · rest **Out** |
| Meetings, Duet, Personal Finance, Whiteboards/Sheets/Data | New Oct–Nov 2026 | **Out** |

#### 3.1.2 Code (Claude Code in the desktop app)
Each conversation is a **session** with its own history and folder; the sidebar lists sessions and runs several in parallel. The row under the prompt box holds: environment, project folder, worktree toggle, permission mode, model picker (+ effort, usage ring).

| Feature | Details | Our scope |
|---|---|---|
| Parallel sessions, sidebar grouping by project, filter/sort, archive, auto-archive on PR merge | Archived tab via "View all" | **v1** parallel/group/archive · auto-archive **v2** |
| Environments: Local, SSH, WSL, Cloud | Saved environments with folders and env vars | **v1** Local · **v2** WSL, SSH · Cloud **Out** |
| Project folder picker, add folders mid-session, @mention files, drag-drop attachments | | **v1** |
| Git worktree per session | Stored under `.claude/worktrees/` by default; branch prefix; `.worktreeinclude` | **v1** |
| Permission modes: Manual, Accept edits, Plan, Auto, Bypass | Mode remembered per folder (Plan: session only) | **v1** Manual/Accept edits/Plan/Bypass · Auto **v2** (needs classifier-capable model) |
| Pane workspace: chat, diff, browser, terminal, files, plan, tasks, subagent — drag-and-drop layout, pop-out windows | | **v1** (core panes) |
| Diff view with line comments, submit-all-comments | Ctrl+Enter submits | **v1** |
| `/code-review` card with "Walk through in diff" and "Apply fixes" | | **v2** |
| PR monitoring via GitHub CLI: Auto-fix, Merge when ready | Needs `gh` | **v2** |
| Integrated terminal (shares Claude's environment), multiple tabs | Ctrl+` | **v1** |
| File editor pane (autosave, view-only in some envs), right-click path menu (attach, open in editor, show in Explorer, copy path) | | **v1** |
| Browser pane (tabbed, clean profile, dev-servers menu, keep cookies, element select) | Preview of running app; Claude can screenshot/click/verify | **v2** (basic preview in v1) |
| Auto-verify after edits; `.claude/launch.json` dev server config | | **v2** |
| Side chat (Ctrl+; or `/btw`) — context-aware question that doesn't pollute the session | Not persisted | **v1** |
| Cross-session awareness (list/read/message other sessions) | | **v2** |
| Suggested next prompt (Tab/→ to accept) | | **v2** |
| View modes: Normal, Thinking, Verbose (Ctrl+O) | | **v1** |
| Context window usage card and ring, `/compact`, `/context` | | **v1** |
| Skills (`/` menu, `+` menu), plugins browser, connectors | One "Customize" place | **v1** skills/MCP · plugins **v2** |
| Notifications when a session finishes or needs approval | | **v1** |
| Split view (two sessions side by side), open session in own window | | **v2** |
| Routines/scheduled tasks, Remote Control, Dispatch, iOS Simulator pane | | **Out** |
| Keyboard shortcuts (Windows: replace Cmd with Ctrl) | Full list in Appendix D | **v1** |

### 3.2 Claude Desktop — visual language (what "matching" means)
Sources agree on the personality and differ slightly on hex values. Treat all values as **approximate** and calibrate against a screenshot of your installed app (Section 5.6).

- **Warm cream canvas** instead of white (≈ `#FAF9F5`), near-black ink (≈ `#141413`), warm-toned neutrals (every gray has a yellow-brown undertone).
- **One accent**: clay/terracotta (reported as `#D97757` / `#C96442` / `#CC785C` depending on source).
- **Type**: a literary **serif** for headings and assistant prose (Anthropic Serif / Copernicus / Tiempos family — proprietary), a humanist **sans** for UI chrome (Anthropic Sans / Styrene), **mono** for code. We substitute open-licensed fonts (5.3).
- **Shape**: soft rounded corners (cards ≈ 16–24 px, fields ≈ 10 px), 8 px spacing base, generous whitespace, thin warm borders, almost no shadows.
- **Tone**: calm, spacious, no neon/glows/emoji; emphasis through typography rather than color.

### 3.3 OmniRoute — what it gives us (as of v3.8.5x)
OmniRoute is an MIT-licensed local AI gateway: one endpoint (`http://localhost:20128/v1`) in front of hundreds of providers (catalog counts change between releases: roughly 390+ providers, 150+ with free tiers, 1,400+ model IDs at last check), with Node-based server, optional dashboard and Electron wrapper.

| Capability | Why we care |
|---|---|
| OpenAI-, Claude-, Gemini- and Responses-compatible APIs at `/v1` | One backend serves both our chat client and Claude Code (Anthropic format) and OpenCode (OpenAI-compatible) |
| `auto`, `auto/coding`, `auto/fast`, `auto/cheap`, `auto/subscription`, `auto/thrifty`, … virtual combos | Great defaults in the model picker; `auto/coding` is the natural default for Code mode |
| 22 routing strategies, custom **combos**, quota-aware fallback, circuit breakers, key cooldown, model lockout | Resilience (Goal G6) |
| `/v1/models` with capability/context/kind filters; `POST /v1/models/query` shortlist | Picker can hide models that can't do tool calls |
| `X-OmniRoute-Decision` and `X-OmniRoute-*` cost/usage headers | "Served by …" chip, per-message cost/latency |
| Per-key routing control (`forcedModel`) via `/api/keys/{id}/access` | **Hot-swap** model for running CLI sessions (6.6) [VERIFY] |
| `serve --headless` (proxy only, no dashboard) | Lightweight sidecar mode |
| `omniroute run` (7 CLIs incl. Claude Code, OpenCode), `omniroute configure` (11 targets) | Reference/fallback for injection |
| Remote mode (scoped tokens), Docker, npm, Electron | Optional: point the app at OmniRoute running elsewhere |
| Token compression (RTK/Caveman), memory, guardrails, MCP server (110 tools), A2A | Optional power features surfaced in Settings, off by default |
| Free-tier budget dashboard (`/dashboard/free-tiers`) | Embed in the Providers screen |

**Caveats from the OmniRoute docs themselves:** `auto` needs at least one eligible connected route; some providers are flagged `tos: avoid` and excluded from automatic routing by default; free-tier numbers are estimates that move; the project releases very fast (pin versions).

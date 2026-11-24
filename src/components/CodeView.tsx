import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/app-store";
import type { AgentKind, CodeSession, PermissionMode } from "../lib/types";
import { bridge } from "../lib/bridge";
import { ModelPicker } from "./ModelPicker";
import { Markdown } from "./Markdown";
import {
  IconArrowUp,
  IconDiff,
  IconFile,
  IconFolder,
  IconGlobe,
  IconPlus,
  IconStop,
  IconTerminal,
} from "./Icon";

type Pane = "chat" | "terminal" | "diff" | "files" | "preview";

const PANE_META: Record<Pane, { label: string; icon: typeof IconTerminal }> = {
  chat: { label: "Chat", icon: IconTerminal },
  terminal: { label: "Terminal", icon: IconTerminal },
  diff: { label: "Diff", icon: IconDiff },
  files: { label: "Files", icon: IconFile },
  preview: { label: "Preview", icon: IconGlobe },
};

function NewSessionForm() {
  const { createSession, settings, models, showToast } = useApp();
  const [folder, setFolder] = useState("");
  const [agent, setAgent] = useState<AgentKind>("claude");
  const [model, setModel] = useState(settings.activeModel);
  const [permissionMode, setPermissionMode] =
    useState<PermissionMode>("acceptEdits");

  const browse = async () => {
    try {
      const picked = await bridge.pickFolder();
      if (picked) setFolder(picked);
    } catch (e) {
      showToast(String(e));
    }
  };

  const canCreate = folder.trim().length > 0;

  return (
    <div className="pane-body">
      <div className="new-session">
        <h2>New coding session</h2>
        <div className="field">
          <label>Project folder</label>
          <div className="field-row">
            <input
              value={folder}
              placeholder="C:\path\to\project"
              onChange={(e) => setFolder(e.target.value)}
            />
            <button className="btn btn-ghost" onClick={browse}>
              <IconFolder width={14} height={14} style={{ marginRight: 6 }} />
              Browse
            </button>
          </div>
          <span className="hint">
            The agent runs inside this folder. Nothing outside it is touched.
          </span>
        </div>

        <div className="field">
          <label>Agent</label>
          <div className="seg">
            <button
              className={agent === "claude" ? "active" : ""}
              onClick={() => setAgent("claude")}
            >
              Claude Code
            </button>
            <button
              className={agent === "opencode" ? "active" : ""}
              onClick={() => setAgent("opencode")}
            >
              OpenCode
            </button>
          </div>
          <span className="hint">
            Detected from PATH · configured per-process, never globally.
          </span>
        </div>

        <div className="field">
          <label>Model</label>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {[...new Set([settings.activeModel, ...models.map((m) => m.id)])].map(
              (id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ),
            )}
          </select>
          <span className="hint">
            Defaults to the Active Model — the Model Hub signature feature.
          </span>
        </div>

        <div className="field">
          <label>Permission mode</label>
          <div className="seg">
            {(
              [
                ["manual", "Manual"],
                ["acceptEdits", "Accept edits"],
                ["plan", "Plan"],
                ["bypass", "Bypass"],
              ] as [PermissionMode, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                className={permissionMode === v ? "active" : ""}
                onClick={() => setPermissionMode(v)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="hint">
            Remembered per folder in v0.2 · Auto mode needs a classifier model
            (v0.2).
          </span>
        </div>

        <div className="btn-row">
          <button
            className="btn btn-primary"
            disabled={!canCreate}
            onClick={() =>
              createSession({ folder: folder.trim(), agent, model, permissionMode })
            }
          >
            Create session
          </button>
        </div>
      </div>
    </div>
  );
}

function SessionChat({ session }: { session: CodeSession }) {
  const { runPrompt } = useApp();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.messages.length, session.busy]);

  const submit = () => {
    if (!text.trim() || session.busy) return;
    void runPrompt(session.id, text);
    setText("");
  };

  return (
    <div className="pane-body" style={{ display: "flex", flexDirection: "column" }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
        {session.messages.length === 0 ? (
          <div className="pane-empty">
            <h3>Session ready</h3>
            <p>
              Prompt the agent — it runs <b>{session.agent}</b> in{" "}
              <code>{session.folder}</code> on <b>{session.model}</b> with{" "}
              {session.permissionMode} permissions.
            </p>
            <span className="spike-tag">
              model injected per-process · no ~/.claude edits
            </span>
          </div>
        ) : (
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            {session.messages.map((m) => (
              <div key={m.id} className={`msg msg-${m.role} ${m.error ? "error" : ""}`}>
                <div className="msg-role">
                  {m.role === "user" ? "You" : session.agent}
                </div>
                <div className="msg-body">
                  {m.pending ? (
                    <span className="typing">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : m.role === "assistant" && !m.error ? (
                    <Markdown text={m.content} />
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ paddingTop: 12 }}>
        <div className="composer" style={{ maxWidth: 720, margin: "0 auto" }}>
          <textarea
            value={text}
            rows={1}
            placeholder={`Ask ${session.agent} to build, fix, or explain…`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            style={{ minHeight: 38 }}
          />
          <div className="composer-row">
            <span className="composer-hint">
              runs <code style={{ fontFamily: "var(--font-mono)" }}>claude -p</code>{" "}
              / <code style={{ fontFamily: "var(--font-mono)" }}>opencode run</code>{" "}
              · structured I/O in v0.2 (V6/V7)
            </span>
            {session.busy ? (
              <button
                className="send-btn"
                title="Stop"
                onClick={() => void useApp.getState().stopSession(session.id)}
                style={{ background: "var(--ink-soft)" }}
              >
                <IconStop width={13} height={13} />
              </button>
            ) : (
              <button
                className="send-btn"
                disabled={!text.trim()}
                onClick={submit}
                title="Run"
              >
                <IconArrowUp width={15} height={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TerminalPane({ session }: { session: CodeSession }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.output.length]);

  return (
    <div className="pane-body" ref={ref} style={{ padding: 14 }}>
      <div className="terminal">
        {session.output.length === 0 ? (
          <span className="t-dim">
            # terminal ready — output from {session.agent} appears here
          </span>
        ) : (
          session.output.map((line, i) => (
            <div
              key={i}
              className={
                line.startsWith("$")
                  ? "t-clay"
                  : line.startsWith("[done]") || line.startsWith("[ok]")
                    ? "t-ok"
                    : line.startsWith("[error]")
                      ? "t-clay"
                      : "t-dim"
              }
            >
              {line}
            </div>
          ))
        )}
        {session.busy && <div className="t-dim">▌ running…</div>}
      </div>
    </div>
  );
}

function PlaceholderPane({
  kind,
  title,
  body,
  spike,
}: {
  kind: Pane;
  title: string;
  body: string;
  spike: string;
}) {
  const Icon = PANE_META[kind].icon;
  return (
    <div className="pane-empty">
      <Icon width={26} height={26} />
      <h3>{title}</h3>
      <p>{body}</p>
      <span className="spike-tag">{spike}</span>
    </div>
  );
}

function Workspace({ session }: { session: CodeSession }) {
  const { updateSession, models } = useApp();
  const [pane, setPane] = useState<Pane>("chat");

  return (
    <>
      <div className="session-header">
        <b style={{ fontSize: 14 }}>{session.title}</b>
        <span className="chip mono" title={session.folder}>
          <IconFolder width={12} height={12} />
          {session.folder}
        </span>
        <span className="chip">{session.agent === "claude" ? "Claude Code" : "OpenCode"}</span>
        <span className="topbar-spacer" />
        <select
          className="pill-select"
          title="Permission mode (v1: Manual / Accept edits / Plan / Bypass)"
          value={session.permissionMode}
          onChange={(e) =>
            updateSession(session.id, {
              permissionMode: e.target.value as PermissionMode,
            })
          }
        >
          <option value="manual">Manual</option>
          <option value="acceptEdits">Accept edits</option>
          <option value="plan">Plan</option>
          <option value="bypass">Bypass</option>
        </select>
        <select
          className="pill-select"
          title="Session model — idle sessions follow the Active Model"
          value={session.model}
          onChange={(e) => updateSession(session.id, { model: e.target.value })}
        >
          {[
            ...new Set([
              session.model,
              useApp.getState().settings.activeModel,
              ...models.map((m) => m.id),
            ]),
          ].map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <span className={`status-dot ${session.status}`} style={{ width: 8, height: 8 }} />
        <ModelPicker />
      </div>

      <div className="pane-tabs">
        {(Object.keys(PANE_META) as Pane[]).map((p) => {
          const Icon = PANE_META[p].icon;
          return (
            <button
              key={p}
              className={`pane-tab ${pane === p ? "active" : ""}`}
              onClick={() => setPane(p)}
            >
              <Icon width={13} height={13} />
              {PANE_META[p].label}
            </button>
          );
        })}
      </div>

      {pane === "chat" && <SessionChat session={session} />}
      {pane === "terminal" && <TerminalPane session={session} />}
      {pane === "diff" && (
        <div className="pane-body">
          <PlaceholderPane
            kind="diff"
            title="Diff pane"
            body="File changes with inline comments land here once sessions run with structured tool events."
            spike="phase: V6 structured I/O · line comments v1"
          />
        </div>
      )}
      {pane === "files" && (
        <div className="pane-body">
          <PlaceholderPane
            kind="files"
            title="Files pane"
            body="Browse the project tree, open files read-only, right-click to attach or copy path."
            spike="phase: after PTY/host spike (V8)"
          />
        </div>
      )}
      {pane === "preview" && (
        <div className="pane-body">
          <PlaceholderPane
            kind="preview"
            title="Preview browser"
            body="Basic preview of the project's dev server. Element-select and screenshots come later."
            spike="v1 basic preview · v2 full browser pane"
          />
        </div>
      )}
    </>
  );
}

export function CodeView() {
  const { codeSessions, activeSessionId } = useApp();
  const session = codeSessions.find((s) => s.id === activeSessionId) ?? null;

  return (
    <>
      <header className="topbar">
        <span className="topbar-title">Code</span>
        <span className="badge-beta">parallel sessions</span>
        <span className="topbar-spacer" />
        <button
          className="btn-new-chat"
          style={{ padding: "6px 12px" }}
          onClick={() => {
            useApp.setState({ activeSessionId: null });
          }}
        >
          <IconPlus width={14} height={14} />
          New session
        </button>
        <ModelPicker />
      </header>

      <div className="code-layout">
        <div className="code-main" style={{ borderRight: "none" }}>
          {!session ? (
            <>
              <div className="pane-tabs">
                <span className="pane-tab active">New session</span>
              </div>
              <NewSessionForm />
            </>
          ) : (
            <Workspace session={session} />
          )}
        </div>
      </div>
    </>
  );
}

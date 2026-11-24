import { useApp } from "../store/app-store";
import {
  IconChat,
  IconCode,
  IconGear,
  IconPlus,
  IconShield,
  IconTrash,
} from "./Icon";

export function Sidebar() {
  const {
    view,
    setView,
    conversations,
    activeId,
    selectConversation,
    newConversation,
    deleteConversation,
    codeSessions,
    activeSessionId,
    selectSession,
    settings,
  } = useApp();

  const mode = view === "code" ? "code" : "chat";

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">L</span>
        LLM Manager
        <span className="badge-beta">VXE</span>
      </div>

      <button className="btn-new-chat" onClick={() => newConversation()}>
        <IconPlus width={15} height={15} />
        New chat
      </button>

      <div className="mode-tabs" role="tablist">
        <button
          className={`mode-tab ${mode === "chat" ? "active" : ""}`}
          onClick={() => {
            setView("chat");
            if (!activeId && conversations.length === 0) newConversation();
          }}
        >
          <IconChat width={14} height={14} />
          Home
        </button>
        <button
          className={`mode-tab ${mode === "code" ? "active" : ""}`}
          onClick={() => setView("code")}
        >
          <IconCode width={14} height={14} />
          Code
        </button>
      </div>

      <div className="sidebar-section">
        {view !== "code" && (
          <>
            <div className="sidebar-label">Recent</div>
            {conversations.length === 0 && (
              <div className="local-note">No chats yet</div>
            )}
            {conversations.map((c) => (
              <button
                key={c.id}
                className={`conv-row ${c.id === activeId ? "active" : ""}`}
                onClick={() => selectConversation(c.id)}
              >
                <IconChat width={14} height={14} style={{ opacity: 0.7 }} />
                <span className="row-title">
                  {c.incognito ? "🕶 " : ""}
                  {c.title}
                </span>
                <span
                  className="row-delete"
                  role="button"
                  title="Delete chat"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(c.id);
                  }}
                >
                  <IconTrash />
                </span>
              </button>
            ))}
          </>
        )}

        {view === "code" && (
          <>
            <div className="sidebar-label">Sessions</div>
            {codeSessions.length === 0 && (
              <div className="local-note">
                Parallel coding sessions live here — pick a folder to start.
              </div>
            )}
            {codeSessions.map((s) => (
              <button
                key={s.id}
                className={`session-row ${s.id === activeSessionId ? "active" : ""}`}
                onClick={() => selectSession(s.id)}
              >
                <span className={`status-dot ${s.status}`} />
                <span className="row-title">{s.title}</span>
                <span className="row-delete" title={s.agent}>
                  <IconCode width={13} height={13} />
                </span>
              </button>
            ))}
          </>
        )}
      </div>

      <div className="sidebar-footer">
        <button
          className="footer-btn"
          onClick={() => setView("settings")}
          style={view === "settings" ? { background: "var(--bg-active)" } : undefined}
        >
          <IconGear width={15} height={15} />
          Settings
        </button>
        <div className="local-note">
          <IconShield
            width={11}
            height={11}
            style={{ verticalAlign: "-1.5px", marginRight: 5 }}
          />
          Local-first · active model: <b>{settings.activeModel}</b>
        </div>
      </div>
    </aside>
  );
}

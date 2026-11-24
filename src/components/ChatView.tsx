import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/app-store";
import type { ChatMessage } from "../lib/types";
import { ModelPicker } from "./ModelPicker";
import { Markdown } from "./Markdown";
import { IconArrowUp, IconClip, IconPlus, IconStop } from "./Icon";

function MessageView({ m }: { m: ChatMessage }) {
  return (
    <div className={`msg msg-${m.role} ${m.error ? "error" : ""}`}>
      <div className="msg-role">{m.role === "user" ? "You" : "LLM Manager"}</div>
      <div className="msg-body">
        {m.pending ? (
          <span className="typing" aria-label="thinking">
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
      {!m.pending && m.role === "assistant" && m.model && (
        <div className="msg-meta">
          <span className="served-by">
            <span className="dot" />
            {m.error ? "error" : "served by"} {m.model}
          </span>
        </div>
      )}
    </div>
  );
}

export function ChatView() {
  const {
    conversations,
    activeId,
    settings,
    sendChat,
    newConversation,
    showToast,
  } = useApp();

  const conv = conversations.find((c) => c.id === activeId) ?? null;
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const busy = !!conv?.messages.some((m) => m.pending);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conv?.messages.length, activeId]);

  // auto-grow textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }, [text]);

  const submit = () => {
    if (busy || !text.trim()) return;
    void sendChat(text);
    setText("");
  };

  const empty = !conv || conv.messages.length === 0;

  return (
    <>
      <header className="topbar">
        <span className="topbar-title">
          {conv?.title ?? "New chat"}
          {conv?.incognito && (
            <span className="badge-beta" style={{ marginLeft: 8 }}>
              INCOGNITO
            </span>
          )}
        </span>
        <span className="topbar-spacer" />
        <button
          className="icon-btn"
          title="New incognito chat"
          onClick={() => newConversation(true)}
        >
          <IconPlus width={15} height={15} />
        </button>
        <ModelPicker />
      </header>

      <div className="chat-scroll" ref={scrollRef}>
        {empty ? (
          <div className="chat-hero">
            <h1>Where should we start?</h1>
            <p>
              Ask anything — it runs on the model you pick, through OmniRoute.
            </p>
          </div>
        ) : (
          <div className="chat-inner">
            {conv!.messages.map((m) => (
              <MessageView key={m.id} m={m} />
            ))}
          </div>
        )}
      </div>

      <div className={`composer-wrap ${empty ? "hero" : ""}`}>
        <div className="composer">
          <textarea
            ref={taRef}
            value={text}
            placeholder="Reply to LLM Manager…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
          />
          <div className="composer-row">
            <button
              className="icon-btn"
              title="Attachments — coming in v0.2 (blueprint: images, PDFs, drag-drop)"
              disabled
            >
              <IconClip width={15} height={15} />
            </button>
            <span className="composer-hint">
              Enter to send · Shift+Enter for a new line
            </span>
            {busy ? (
              <button
                className="send-btn"
                title="Stop"
                onClick={() => showToast("Stop arrives with streaming (Phase 0 V6)")}
                style={{ background: "var(--ink-soft)" }}
              >
                <IconStop width={13} height={13} />
              </button>
            ) : (
              <button
                className="send-btn"
                onClick={submit}
                disabled={!text.trim()}
                title="Send"
              >
                <IconArrowUp width={15} height={15} />
              </button>
            )}
          </div>
        </div>
        <div className="composer-foot">
          <span>
            Model: <b>{settings.activeModel}</b>
          </span>
          <span>·</span>
          <span>{settings.provider.baseUrl}</span>
          <span>·</span>
          <span>local-first, no telemetry</span>
        </div>
      </div>
    </>
  );
}

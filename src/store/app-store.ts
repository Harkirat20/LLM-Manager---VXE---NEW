import { create } from "zustand";
import { bridge, isTauri } from "../lib/bridge";
import {
  AppSettings,
  ChatMessage,
  CodeSession,
  Conversation,
  DEFAULT_SETTINGS,
  FALLBACK_MODELS,
  ModelInfo,
  PermissionMode,
  AgentKind,
  View,
} from "../lib/types";

const uid = () => crypto.randomUUID();

const now = () => Date.now();

function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "New chat";
  return t.length > 42 ? t.slice(0, 42) + "…" : t;
}

interface AppStore {
  view: View;
  settings: AppSettings;
  models: ModelInfo[];
  modelsError: string | null;
  conversations: Conversation[];
  activeId: string | null;
  codeSessions: CodeSession[];
  activeSessionId: string | null;
  bootstrapped: boolean;
  toast: string | null;
  listening: boolean;

  init: () => Promise<void>;
  setView: (v: View) => void;
  showToast: (msg: string) => void;

  newConversation: (incognito?: boolean) => void;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  sendChat: (text: string) => Promise<void>;

  setModel: (model: string) => Promise<void>;
  refreshModels: () => Promise<void>;
  saveSettings: (s: AppSettings) => Promise<void>;
  completeWizard: (s: AppSettings) => Promise<void>;

  createSession: (opts: {
    folder: string;
    agent: AgentKind;
    model: string;
    permissionMode: PermissionMode;
  }) => void;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  updateSession: (id: string, patch: Partial<CodeSession>) => void;
  runPrompt: (sessionId: string, text: string) => Promise<void>;
  appendOutput: (sessionId: string, line: string) => void;
  stopSession: (sessionId: string) => Promise<void>;
  finalizeAssistant: (
    convId: string,
    msgId: string,
    content: string,
    model?: string,
    error?: boolean,
  ) => void;
  patchSession: (id: string, fn: (s: CodeSession) => CodeSession) => void;
}

export const useApp = create<AppStore>((set, get) => ({
  view: "chat",
  settings: DEFAULT_SETTINGS,
  models: FALLBACK_MODELS,
  modelsError: null,
  conversations: [],
  activeId: null,
  codeSessions: [],
  activeSessionId: null,
  bootstrapped: false,
  toast: null,
  listening: false,

  async init() {
    try {
      const settings = await bridge.getSettings();
      set({ settings });
      await get().refreshModels();
    } catch (e) {
      get().showToast(friendly(e));
    }

    // Live agent events (terminal pane / status) — Tauri only.
    if (isTauri && !get().listening) {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        await listen<{ sessionId: string; line: string }>("agent-line", (ev) => {
          get().appendOutput(ev.payload.sessionId, ev.payload.line);
        });
        set({ listening: true });
      } catch {
        /* events unavailable — terminal pane stays request/response */
      }
    }

    set({ bootstrapped: true });
  },

  setView(view) {
    set({ view });
  },

  showToast(toast) {
    set({ toast });
    setTimeout(() => {
      if (get().toast === toast) set({ toast: null });
    }, 3600);
  },

  newConversation(incognito = false) {
    const conv: Conversation = {
      id: uid(),
      title: incognito ? "Incognito chat" : "New chat",
      createdAt: now(),
      messages: [],
      incognito,
    };
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeId: conv.id,
      view: "chat",
    }));
  },

  selectConversation(id) {
    set({ activeId: id, view: "chat" });
  },

  deleteConversation(id) {
    set((s) => {
      const conversations = s.conversations.filter((c) => c.id !== id);
      const activeId =
        s.activeId === id ? (conversations[0]?.id ?? null) : s.activeId;
      return { conversations, activeId };
    });
  },

  async sendChat(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    let { conversations, activeId, settings } = get();
    let conv = conversations.find((c) => c.id === activeId) ?? null;
    if (!conv) {
      conv = {
        id: uid(),
        title: titleFrom(trimmed),
        createdAt: now(),
        messages: [],
      };
      conversations = [conv, ...conversations];
    }

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: trimmed,
      createdAt: now(),
    };
    const pending: ChatMessage = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: now(),
      model: settings.activeModel,
      pending: true,
    };

    conv = {
      ...conv,
      title:
        conv.messages.length === 0 ? titleFrom(trimmed) : conv.title,
      messages: [...conv.messages, userMsg, pending],
    };
    const convId = conv.id;

    set({
      conversations: [
        conv,
        ...conversations.filter((c) => c.id !== convId),
      ],
      activeId: convId,
      view: "chat",
    });

    try {
      const content = await bridge.sendChat({
        model: settings.activeModel,
        baseUrl: settings.provider.baseUrl,
        apiKey: settings.provider.apiKey,
        messages: conv.messages
          .filter((m) => !m.pending && !m.error)
          .map((m) => ({ role: m.role, content: m.content })),
      });
      get().finalizeAssistant(convId, pending.id, content, settings.activeModel);
    } catch (e) {
      get().finalizeAssistant(convId, pending.id, friendly(e), undefined, true);
    }
  },

  finalizeAssistant(convId, msgId, content, model, error = false) {
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id !== convId
          ? c
          : {
              ...c,
              messages: c.messages.map((m) =>
                m.id !== msgId
                  ? m
                  : { ...m, content, model, pending: false, error },
              ),
            },
      ),
    }));
  },

  async setModel(model) {
    const settings = { ...get().settings, activeModel: model };
    set({
      settings,
      // Idle code sessions follow the Active Model (G3); running ones keep
      // their pinned model until restarted (blueprint 6.6 strategy).
      codeSessions: get().codeSessions.map((s) =>
        s.status === "running" ? s : { ...s, model },
      ),
    });
    try {
      await bridge.saveSettings(settings);
    } catch (e) {
      get().showToast(friendly(e));
    }
  },

  async refreshModels() {
    try {
      const models = await bridge.listModels();
      if (models.length) set({ models, modelsError: null });
      else set({ modelsError: "OmniRoute returned no models" });
    } catch (e) {
      set({ models: FALLBACK_MODELS, modelsError: friendly(e) });
    }
  },

  async saveSettings(s) {
    try {
      const saved = await bridge.saveSettings(s);
      set({ settings: saved });
      get().showToast("Settings saved");
      await get().refreshModels();
    } catch (e) {
      get().showToast(friendly(e));
    }
  },

  async completeWizard(s) {
    try {
      const saved = await bridge.saveSettings({ ...s, completedWizard: true });
      set({ settings: saved });
      await get().refreshModels();
    } catch (e) {
      get().showToast(friendly(e));
    }
  },

  createSession(opts) {
    const session: CodeSession = {
      id: uid(),
      title: opts.folder.split(/[\\/]/).filter(Boolean).pop() || "session",
      folder: opts.folder,
      agent: opts.agent,
      model: opts.model,
      permissionMode: opts.permissionMode,
      status: "idle",
      createdAt: now(),
      messages: [],
      output: [],
      busy: false,
    };
    set((s) => ({
      codeSessions: [session, ...s.codeSessions],
      activeSessionId: session.id,
      view: "code",
    }));
  },

  selectSession(id) {
    set({ activeSessionId: id, view: "code" });
  },

  deleteSession(id) {
    set((s) => {
      const codeSessions = s.codeSessions.filter((x) => x.id !== id);
      const activeSessionId =
        s.activeSessionId === id ? (codeSessions[0]?.id ?? null) : s.activeSessionId;
      return { codeSessions, activeSessionId };
    });
  },

  updateSession(id, patch) {
    set((s) => ({
      codeSessions: s.codeSessions.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  },

  async runPrompt(sessionId, text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const session = get().codeSessions.find((s) => s.id === sessionId);
    if (!session || session.busy) return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: trimmed,
      createdAt: now(),
    };
    const pending: ChatMessage = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: now(),
      model: session.model,
      pending: true,
    };

    get().patchSession(sessionId, (s) => ({
      ...s,
      busy: true,
      status: "running",
      messages: [...s.messages, userMsg, pending],
      output: [
        ...s.output,
        `$ ${trimmed}`,
        `[${s.agent}] model=${s.model} permission=${s.permissionMode}`,
      ],
    }));

    try {
      const reply = await bridge.runAgentPrompt(sessionId, trimmed, {
        agent: session.agent,
        folder: session.folder,
        model: session.model,
        permissionMode: session.permissionMode,
      });
      get().patchSession(sessionId, (s) => ({
        ...s,
        busy: false,
        status: "stopped",
        messages: s.messages.map((m) =>
          m.id === pending.id
            ? { ...m, content: reply, pending: false, model: session.model }
            : m,
        ),
        output: [...s.output, "[done]"],
      }));
    } catch (e) {
      get().patchSession(sessionId, (s) => ({
        ...s,
        busy: false,
        status: "error",
        messages: s.messages.map((m) =>
          m.id === pending.id
            ? { ...m, content: friendly(e), pending: false, error: true }
            : m,
        ),
        output: [...s.output, `[error] ${friendly(e)}`],
      }));
    }
  },

  patchSession(id, fn) {
    set((s) => ({
      codeSessions: s.codeSessions.map((x) => (x.id === id ? fn(x) : x)),
    }));
  },

  appendOutput(sessionId, line) {
    get().patchSession(sessionId, (s) => ({
      ...s,
      output: [...s.output, line],
    }));
  },

  async stopSession(sessionId) {
    try {
      await bridge.stopAgent(sessionId);
      get().patchSession(sessionId, (s) => ({
        ...s,
        busy: false,
        status: "stopped",
        output: [...s.output, "[stopped]"],
      }));
    } catch (e) {
      get().showToast(friendly(e));
    }
  },
}));

/** Tauri rejects with either a plain string or { message } depending on the error type. */
export function friendly(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as { message?: string; error?: string };
    if (e.message) return e.message;
    if (e.error) return e.error;
    try {
      return JSON.stringify(err);
    } catch {
      /* fallthrough */
    }
  }
  return String(err);
}

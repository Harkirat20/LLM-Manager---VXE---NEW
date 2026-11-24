// Shared domain types — mirrored by the Rust core (serde rename_all = "camelCase").

export type View = "chat" | "code" | "settings";
export type AgentKind = "claude" | "opencode";
export type PermissionMode = "manual" | "acceptEdits" | "plan" | "bypass";
export type SessionStatus = "idle" | "running" | "stopped" | "error";

export interface ProviderSettings {
  baseUrl: string;
  apiKey: string;
}

export interface AppSettings {
  provider: ProviderSettings;
  /** Single source of truth: the Active Model drives Chat and Code (blueprint G3). */
  activeModel: string;
  completedWizard: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  model?: string;
  pending?: boolean;
  error?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
  incognito?: boolean;
}

export interface ModelInfo {
  id: string;
  label?: string;
}

export interface ConnectionStatus {
  ok: boolean;
  latencyMs: number;
  message: string;
  modelCount: number;
}

export interface AgentSpec {
  agent: AgentKind;
  folder: string;
  model: string;
  permissionMode: PermissionMode;
}

export interface CodeSession {
  id: string;
  title: string;
  folder: string;
  agent: AgentKind;
  model: string;
  permissionMode: PermissionMode;
  status: SessionStatus;
  createdAt: number;
  messages: ChatMessage[];
  output: string[];
  busy: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  provider: { baseUrl: "http://127.0.0.1:20128", apiKey: "" },
  activeModel: "auto/coding",
  completedWizard: false,
};

/** Shown when /v1/models cannot be reached yet (fresh install, OmniRoute not running). */
export const FALLBACK_MODELS: ModelInfo[] = [
  { id: "auto" },
  { id: "auto/coding" },
  { id: "auto/fast" },
  { id: "auto/cheap" },
];

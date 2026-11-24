// Single IPC boundary: real Tauri commands when running inside the webview,
// mock backend otherwise (browser preview / Storybook-style UI work).

import { invoke } from "@tauri-apps/api/core";
import { mockInvoke } from "./mock";
import type {
  AppSettings,
  AgentSpec,
  ConnectionStatus,
  ModelInfo,
} from "./types";

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) return mockInvoke<T>(cmd, args);
  return invoke<T>(cmd, args);
}

// NOTE: Tauri command names are the exact Rust fn names (snake_case) — verified
// against tauri-macros (`RenamePolicy::Keep` + `stringify!(ident)`). Arguments
// are camelCase on the JS side and convert to snake_case automatically.
export const bridge = {
  getSettings: () => call<AppSettings>("get_settings"),
  saveSettings: (settings: AppSettings) =>
    call<AppSettings>("save_settings", { settings }),
  listModels: () => call<ModelInfo[]>("list_models"),
  testConnection: (baseUrl: string, apiKey: string) =>
    call<ConnectionStatus>("test_connection", { baseUrl, apiKey }),
  // `send_chat` takes ONE struct param (`req: ChatRequest`), so the payload
  // must be wrapped under the parameter name — Tauri binds args by key, it
  // does not flatten structs. (Verified: "missing required key req" otherwise.)
  sendChat: (payload: {
    model: string;
    baseUrl: string;
    apiKey: string;
    messages: { role: string; content: string }[];
  }) => call<string>("send_chat", { req: payload }),
  pickFolder: () => call<string | null>("pick_folder"),
  runAgentPrompt: (sessionId: string, prompt: string, spec: AgentSpec) =>
    call<string>("run_agent_prompt", { sessionId, prompt, spec }),
  stopAgent: (sessionId: string) => call<void>("stop_agent", { sessionId }),
};

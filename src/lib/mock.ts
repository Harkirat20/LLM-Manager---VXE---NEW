// Browser-side mock of the Tauri IPC surface, used for `vite dev` previews
// and UI work without a Rust toolchain. Mirrors src-tauri/src/commands/*.

import {
  AppSettings,
  AgentSpec,
  ConnectionStatus,
  DEFAULT_SETTINGS,
  FALLBACK_MODELS,
  ModelInfo,
} from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem("llm-manager.settings");
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore corrupt state */
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: AppSettings) {
  localStorage.setItem("llm-manager.settings", JSON.stringify(s));
}

const MOCK_MODELS: ModelInfo[] = [
  ...FALLBACK_MODELS,
  { id: "auto/subscription" },
  { id: "auto/thrifty" },
  { id: "anthropic/claude-sonnet-4.5" },
  { id: "openai/gpt-5.2" },
  { id: "google/gemini-3-pro" },
  { id: "deepseek/deepseek-v3.2" },
  { id: "qwen/qwen3-coder" },
];

let mockSessionCounter = 0;

export async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  await sleep(120 + Math.random() * 200);

  switch (cmd) {
    case "getSettings":
      return loadSettings() as T;

    case "saveSettings": {
      const s = args?.settings as AppSettings;
      saveSettings(s);
      return s as T;
    }

    case "listModels":
      return MOCK_MODELS as T;

    case "testConnection": {
      const baseUrl = (args?.baseUrl as string) ?? "";
      const status: ConnectionStatus = {
        ok: baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost"),
        latencyMs: Math.round(8 + Math.random() * 40),
        message: baseUrl.includes("20128")
          ? "OmniRoute reachable — 1,412 models listed"
          : "No server answered (mock mode: pretend check)",
        modelCount: 1412,
      };
      return status as T;
    }

    case "sendChat": {
      // Mirrors the real IPC shape: the payload is wrapped under `req`.
      const req = (args?.req ?? args) as {
        model?: string;
        messages?: { role: string; content: string }[];
      };
      const model = req.model ?? "auto";
      const prompt = String(
        (req.messages ?? []).filter((m) => m.role === "user").slice(-1)[0]
          ?.content ?? "",
      );
      await sleep(400 + Math.random() * 500);
      return mockReply(model, prompt) as T;
    }

    case "pickFolder":
      return "C:\\Users\\you\\Projects\\demo-app" as T;

    case "runAgentPrompt": {
      const spec = args?.spec as AgentSpec;
      const prompt = (args?.prompt as string) ?? "";
      mockSessionCounter += 1;
      await sleep(600);
      return mockAgentReply(spec, prompt) as T;
    }

    case "stopAgent":
      return undefined as T;

    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
}

function mockReply(model: string, prompt: string): string {
  const short = prompt.length > 60 ? prompt.slice(0, 60) + "…" : prompt;
  return [
    `**Mock reply** — this browser preview has no Rust core attached, so you're seeing a stand-in response routed as if it came through OmniRoute on \`${model}\`.`,
    "",
    `Your message: *${short || "(empty)"}*`,
    "",
    "Once you run the real app (`npm run tauri dev`) this box is filled by:",
    "",
    "1. the Rust `sendChat` command,",
    "2. which POSTs to OmniRoute's OpenAI-compatible `/v1/chat/completions`,",
    "3. using the **Active Model** from the Model Hub.",
    "",
    "```rust",
    "let reply = client.post(format!(\"{base}/v1/chat/completions\"))",
    "    .json(&json!({ \"model\": model, \"messages\": messages }))",
    "    .send().await?;",
    "```",
    "",
    "Try the **Model picker** in the header — switching it updates Chat *and* Code together.",
  ].join("\n");
}

function mockAgentReply(spec: AgentSpec, prompt: string): string {
  const flag = spec.permissionMode === "bypass" ? "--dangerously-skip-permissions" : `--permission-mode ${spec.permissionMode}`;
  return [
    `Ran on \`${spec.agent}\` · model \`${spec.model}\` · \`${spec.folder}\``,
    "",
    `Injected per-process environment (nothing global was touched):`,
    "",
    "```",
    `ANTHROPIC_BASE_URL=http://127.0.0.1:20128`,
    `ANTHROPIC_MODEL=${spec.model}`,
    `claude -p "<your prompt>" --output-format stream-json ${flag}`,
    "```",
    "",
    `Prompt was: **${prompt.slice(0, 120)}${prompt.length > 120 ? "…" : ""}**`,
    "",
    "This is the Model Hub signature feature working end-to-end — the same Active Model you picked in Chat now drives the coding agent.",
  ].join("\n");
}

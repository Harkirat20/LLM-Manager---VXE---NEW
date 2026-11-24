import { useState } from "react";
import { useApp } from "../store/app-store";
import { bridge } from "../lib/bridge";
import type { ConnectionStatus } from "../lib/types";
import { IconCheck, IconX } from "./Icon";

export function SettingsView() {
  const { settings, models, modelsError, saveSettings, refreshModels, setModel } =
    useApp();
  const [baseUrl, setBaseUrl] = useState(settings.provider.baseUrl);
  const [apiKey, setApiKey] = useState(settings.provider.apiKey);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [testing, setTesting] = useState(false);

  const dirty =
    baseUrl !== settings.provider.baseUrl || apiKey !== settings.provider.apiKey;

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      setStatus(await bridge.testConnection(baseUrl.trim(), apiKey));
    } catch (e) {
      setStatus({
        ok: false,
        latencyMs: 0,
        message: String(e),
        modelCount: 0,
      });
    } finally {
      setTesting(false);
    }
  };

  const save = () =>
    void saveSettings({
      ...settings,
      provider: { baseUrl: baseUrl.trim(), apiKey },
    });

  return (
    <>
      <header className="topbar">
        <span className="topbar-title">Settings</span>
      </header>

      <div className="settings-scroll">
        <div className="settings-inner">
          <h1>Settings</h1>
          <p className="settings-sub">
            Local-first: everything lives on this machine. No accounts, no
            telemetry.
          </p>

          <section className="settings-card">
            <h2>Provider · OmniRoute</h2>
            <p className="card-desc">
              OmniRoute is the local gateway in front of all providers
              (blueprint A3). Chat and both coding agents point here.
            </p>

            <div className="field" style={{ marginBottom: 14 }}>
              <label>Base URL</label>
              <input
                value={baseUrl}
                placeholder="http://127.0.0.1:20128"
                onChange={(e) => setBaseUrl(e.target.value)}
                spellCheck={false}
              />
              <span className="hint">
                Default OmniRoute port is 20128 · <code>/v1</code> is appended by
                the core.
              </span>
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label>API key</label>
              <input
                type="password"
                value={apiKey}
                placeholder="Optional for a local OmniRoute"
                onChange={(e) => setApiKey(e.target.value)}
                spellCheck={false}
              />
              <span className="hint">
                Stored in the OS keychain in v0.2 (blueprint G4) — currently in
                the local settings file.
              </span>
            </div>

            <div className="btn-row" style={{ justifyContent: "flex-start", alignItems: "center" }}>
              <button className="btn btn-ghost" onClick={test} disabled={testing}>
                {testing ? "Testing…" : "Test connection"}
              </button>
              <button className="btn btn-primary" onClick={save} disabled={!dirty}>
                Save
              </button>
              {status && (
                <span className={`conn-status ${status.ok ? "ok" : "bad"}`}>
                  {status.ok ? (
                    <IconCheck width={12} height={12} />
                  ) : (
                    <IconX width={12} height={12} />
                  )}
                  {status.ok
                    ? `${status.message} · ${status.latencyMs} ms`
                    : status.message}
                </span>
              )}
            </div>
          </section>

          <section className="settings-card">
            <h2>Model Hub</h2>
            <p className="card-desc">
              One Active Model drives Chat and Code. The picker in the header
              changes it anywhere.
            </p>

            <div className="field">
              <label>Active model</label>
              <select
                value={settings.activeModel}
                onChange={(e) => void setModel(e.target.value)}
              >
                {[
                  ...new Set([
                    settings.activeModel,
                    ...models.map((m) => m.id),
                  ]),
                ].map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
              {modelsError && (
                <span className="hint" style={{ color: "var(--warn)" }}>
                  Model list unavailable: {modelsError}
                </span>
              )}
            </div>

            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn btn-ghost" onClick={() => void refreshModels()}>
                Refresh model list
              </button>
            </div>
          </section>

          <section className="settings-card">
            <h2>Agents</h2>
            <p className="card-desc">
              Claude Code and OpenCode are hosted as external processes — never
              forked, never globally configured.
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--ink-soft)", fontSize: 13.3 }}>
              <li>
                <b>Claude Code</b> — injected via <code>ANTHROPIC_BASE_URL</code> +{" "}
                <code>ANTHROPIC_AUTH_TOKEN</code> per process (spike V1/V2)
              </li>
              <li>
                <b>OpenCode</b> — generated config through{" "}
                <code>OPENCODE_CONFIG</code> (spike V4)
              </li>
              <li>Hot-swap model mid-session via OmniRoute forcedModel (V5)</li>
            </ul>
          </section>

          <section className="settings-card">
            <h2>About</h2>
            <p className="card-desc" style={{ marginBottom: 0 }}>
              LLM Manager 0.1.0 (VXE) · Tauri v2 · Rust core · React UI.
              <br />
              Blueprint: <code>docs/AI-Manager-Blueprint.md</code> · warm-light
              theme only for now.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

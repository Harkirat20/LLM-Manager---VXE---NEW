import { useState } from "react";
import { useApp } from "../store/app-store";
import { bridge } from "../lib/bridge";
import type { ConnectionStatus } from "../lib/types";
import { IconCheck, IconLayers, IconShield, IconZap, IconX } from "./Icon";

const STEPS = ["Welcome", "Connect", "Pick a model", "Done"] as const;

export function Wizard() {
  const { settings, models, modelsError, completeWizard, refreshModels } = useApp();
  const [step, setStep] = useState(0);
  const [baseUrl, setBaseUrl] = useState(settings.provider.baseUrl);
  const [apiKey, setApiKey] = useState(settings.provider.apiKey);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [model, setModel] = useState(settings.activeModel);

  const finish = (patch: Partial<typeof settings> = {}) =>
    void completeWizard({
      ...settings,
      provider: { baseUrl: baseUrl.trim(), apiKey },
      activeModel: model,
      ...patch,
    });

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      setStatus(await bridge.testConnection(baseUrl.trim(), apiKey));
      if (!modelsError) void refreshModels();
    } catch (e) {
      setStatus({ ok: false, latencyMs: 0, message: String(e), modelCount: 0 });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="wizard-overlay">
      <div className="wizard">
        <div className="wizard-steps">
          {STEPS.map((_, i) => (
            <i key={i} className={i <= step ? "on" : ""} />
          ))}
        </div>

        {step === 0 && (
          <>
            <div className="wizard-logo">L</div>
            <h1>Welcome to LLM Manager</h1>
            <p className="lede">
              One calm workspace to talk to any model — and run coding agents on
              the same models.
            </p>
            <ul className="wizard-points">
              <li>
                <span className="pt-icon">
                  <IconLayers width={14} height={14} />
                </span>
                <span>
                  <b>Model Hub</b>
                  Pick a model once; Chat and Code both follow. No env vars, no
                  config files.
                </span>
              </li>
              <li>
                <span className="pt-icon">
                  <IconZap width={14} height={14} />
                </span>
                <span>
                  <b>OmniRoute underneath</b>
                  One local gateway, hundreds of providers, automatic fallback.
                </span>
              </li>
              <li>
                <span className="pt-icon">
                  <IconShield width={14} height={14} />
                </span>
                <span>
                  <b>Local-first &amp; private</b>
                  No cloud account, no telemetry — everything stays on disk.
                </span>
              </li>
            </ul>
            <div className="wizard-actions">
              <span />
              <button className="btn btn-primary" onClick={() => setStep(1)}>
                Get started
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1>Connect your provider</h1>
            <p className="lede">
              Point the app at OmniRoute (or any OpenAI-compatible gateway).
            </p>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Base URL</label>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                spellCheck={false}
                placeholder="http://127.0.0.1:20128"
              />
            </div>
            <div className="field">
              <label>API key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                spellCheck={false}
                placeholder="Optional when OmniRoute runs locally"
              />
              <span className="hint">
                You can skip this and configure it later in Settings.
              </span>
            </div>

            <div className="btn-row" style={{ marginTop: 16, justifyContent: "flex-start", alignItems: "center" }}>
              <button className="btn btn-ghost" onClick={test} disabled={testing}>
                {testing ? "Testing…" : "Test connection"}
              </button>
              {status && (
                <span className={`conn-status ${status.ok ? "ok" : "bad"}`}>
                  {status.ok ? (
                    <IconCheck width={12} height={12} />
                  ) : (
                    <IconX width={12} height={12} />
                  )}
                  {status.message}
                </span>
              )}
            </div>

            <div className="wizard-actions">
              <button className="btn btn-ghost" onClick={() => setStep(0)}>
                Back
              </button>
              <button className="btn btn-primary" onClick={() => { void refreshModels(); setStep(2); }}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1>Pick your Active Model</h1>
            <p className="lede">
              This one selection drives Chat and Code. Change it any time from
              the header.
            </p>
            {modelsError && (
              <div className="model-menu-warn" style={{ marginBottom: 10 }}>
                Can't reach OmniRoute for the live list ({modelsError}). Pick a
                suggestion or type your own — you can fix the URL in Settings.
              </div>
            )}
            <div className="model-grid">
              {models.slice(0, 20).map((m) => (
                <button
                  key={m.id}
                  className={m.id === model ? "selected" : ""}
                  onClick={() => setModel(m.id)}
                  title={m.id}
                >
                  {m.id}
                </button>
              ))}
            </div>
            <div className="field">
              <label>…or type a model id</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                spellCheck={false}
                placeholder="auto/coding"
              />
              <span className="hint">
                Virtual combos like <code>auto/coding</code> route across
                providers with fallback.
              </span>
            </div>
            <div className="wizard-actions">
              <button className="btn btn-ghost" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                className="btn btn-primary"
                disabled={!model.trim()}
                onClick={() => setStep(3)}
              >
                Continue
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="wizard-logo">
              <IconCheck width={22} height={22} />
            </div>
            <h1>You're set</h1>
            <p className="lede">
              Active model <b>{model}</b> → connected to{" "}
              <b>{baseUrl || "OmniRoute"}</b>.
            </p>
            <ul className="wizard-points">
              <li>
                <span className="pt-icon">
                  <IconZap width={14} height={14} />
                </span>
                <span>
                  <b>Chat</b> answers on that model right away.
                </span>
              </li>
              <li>
                <span className="pt-icon">
                  <IconLayers width={14} height={14} />
                </span>
                <span>
                  <b>Code</b> launches Claude Code / OpenCode on the same model
                  with zero setup.
                </span>
              </li>
            </ul>
            <div className="wizard-actions">
              <button className="btn btn-ghost" onClick={() => setStep(2)}>
                Back
              </button>
              <button className="btn btn-primary" onClick={() => finish()}>
                Open LLM Manager
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

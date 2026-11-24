import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/app-store";
import { IconCheck, IconChevron } from "./Icon";

/** The Model Hub control — one selection drives Chat and Code (G3). */
export function ModelPicker() {
  const { settings, models, modelsError, setModel } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Make sure the current model is present even if the list came from cache.
  const seen = new Set(models.map((m) => m.id));
  const list = seen.has(settings.activeModel)
    ? models
    : [{ id: settings.activeModel }, ...models];

  return (
    <div className="model-anchor" ref={ref}>
      <button
        className="model-pill"
        onClick={() => setOpen((v) => !v)}
        title="Active model — drives Chat and Code"
      >
        <span className="dot" />
        <span className="model-name">{settings.activeModel}</span>
        <IconChevron width={13} height={13} />
      </button>

      {open && (
        <div className="model-menu">
          <div className="model-menu-head">Active model · Model Hub</div>
          {modelsError && (
            <div className="model-menu-warn">
              {modelsError} — showing built-in suggestions. Start OmniRoute or
              fix the URL in Settings.
            </div>
          )}
          {list.map((m) => (
            <button
              key={m.id}
              className={`model-option ${m.id === settings.activeModel ? "selected" : ""}`}
              onClick={() => {
                setModel(m.id);
                setOpen(false);
              }}
            >
              {m.label ?? m.id}
              {m.id === settings.activeModel && (
                <span className="check">
                  <IconCheck width={13} height={13} />
                </span>
              )}
            </button>
          ))}
          <div className="model-menu-foot">
            Injected into Claude Code &amp; OpenCode automatically — no env vars
            to set.
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect } from "react";
import { useApp } from "./store/app-store";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { CodeView } from "./components/CodeView";
import { SettingsView } from "./components/SettingsView";
import { Wizard } from "./components/Wizard";

export default function App() {
  const { view, settings, bootstrapped, toast, init } = useApp();

  useEffect(() => {
    void init();
  }, [init]);

  if (!bootstrapped) {
    return (
      <div className="app" style={{ alignItems: "center", justifyContent: "center" }}>
        <div className="sidebar-brand" style={{ padding: 0 }}>
          <span className="brand-mark">L</span>
          LLM Manager
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {!settings.completedWizard && <Wizard />}
      <Sidebar />
      <main className="app-main">
        {view === "chat" && <ChatView />}
        {view === "code" && <CodeView />}
        {view === "settings" && <SettingsView />}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

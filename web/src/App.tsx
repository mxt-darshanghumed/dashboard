import { Routes, Route } from "react-router-dom";
import { ClipboardCheck, Settings as SettingsIcon } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { Dashboard } from "@/pages/Dashboard";
import { EngineDetail } from "@/pages/EngineDetail";
import { SessionChat } from "@/pages/SessionChat";
import { PRsTab } from "@/pages/PRsTab";
import { JiraTab } from "@/pages/JiraTab";
import { JiraDetail } from "@/pages/JiraDetail";
import { Placeholder } from "@/pages/Placeholder";

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/engine/:engineId" element={<EngineDetail />} />
          <Route path="/engine/:engineId/session/:sessionId" element={<SessionChat />} />
          <Route path="/prs" element={<PRsTab />} />
          <Route path="/jira" element={<JiraTab />} />
          <Route path="/jira/:key" element={<JiraDetail />} />
          <Route
            path="/worklog"
            element={
              <Placeholder
                icon={ClipboardCheck}
                title="Worklog"
                description="One-click 6h worklog fill across your active MXTS tickets. Mirrors your existing worklog skill."
                upcoming={[
                  "Show today's plan: ticket → hours split",
                  "Skip-on-leave detection via Slack status",
                  "One-click submit (all tickets in active sprint, assigned to you)",
                  "Schedule: auto-run at 5pm IST on weekdays",
                ]}
              />
            }
          />
          <Route
            path="/settings"
            element={
              <Placeholder
                icon={SettingsIcon}
                title="Settings"
                description="App-level config: auth status, MCP server credentials, default model."
                upcoming={[
                  "Show current auth source (Claude Code session vs API key)",
                  "Quick test: send a no-op prompt to confirm everything works",
                  "Default model selector (Opus / Sonnet / Haiku)",
                  "MCP credentials manager",
                ]}
              />
            }
          />
        </Routes>
      </main>
    </div>
  );
}

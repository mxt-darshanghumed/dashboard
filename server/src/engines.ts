import path from "node:path";
import { fileURLToPath } from "node:url";
import { sessionsDir } from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cockpitRoot = path.resolve(__dirname, "../..");

export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan";
export type SettingSource = "user" | "project" | "local";

export interface Engine {
  id: string;
  name: string;
  description: string;
  available: boolean;
  /** System prompt that all sessions for this engine start with. */
  systemPrompt: string;
  allowedTools?: string[];
  permissionMode?: PermissionMode;
  settingSources?: SettingSource[];
  cwd?: string;
}

const homeDir = process.env.USERPROFILE ?? process.env.HOME ?? process.cwd();
const defaultCwd = process.env.AGENT_CWD ?? homeDir;

export const engines: Engine[] = [
  {
    id: "claude",
    name: "Claude",
    description:
      "Anthropic's Claude with your full workspace context — every MCP, skill, slash command, and CLAUDE.md you have configured.",
    available: true,
    systemPrompt:
      "You are Claude, the user's personal engineering and productivity assistant. " +
      "You have access to their full Claude Code environment — every MCP server, skill, file in their workspace. " +
      "Be concise and act decisively. If they ask a question, answer it directly. " +
      "If they ask you to do something, do it (using tools when needed) and report what you did.\n\n" +
      "PAST CONVERSATIONS\n" +
      `Your past chat sessions with this user are stored as JSON files in: ${sessionsDir}\n` +
      "Each file represents one session and contains: id, title, engineId, createdAt, lastActivityAt, and messages[] (each message has role, ts, and either text or blocks).\n" +
      "When the user asks about something you discussed earlier (e.g. \"what did we decide about X\", \"continue from yesterday\", \"have I asked you this before\"), use the Read/Glob/Grep tools on that directory to find the relevant prior session(s). " +
      "Prefer to Grep for keywords first, then Read the matching files.",
    permissionMode: "default",
    settingSources: ["user", "project"],
    cwd: defaultCwd,
  },
  {
    id: "echo",
    name: "Builder",
    description:
      "Self-modifying agent scoped to this very app. Can read, edit, and create files in agent-cockpit. The Vite dev server hot-reloads the UI instantly; the backend restarts on save. Code edits prompt for approval.",
    available: true,
    systemPrompt:
      `You are the Cockpit Builder — an agent specifically configured to modify the very app the user is currently using to chat with you.

ABOUT THIS APP
The "Agent Cockpit" is a personal dashboard the user is building. It is rooted at:
  ${cockpitRoot}

STACK
- Backend (server/): Node + TypeScript + Express + WebSocket + @anthropic-ai/claude-agent-sdk
- Frontend (web/): Vite + React 19 + TypeScript + Tailwind v4 + framer-motion + react-markdown
- Data: JSON files under data/sessions/ (chat history is persisted there)

KEY DIRECTORIES
- server/src/        backend source
- server/src/engines.ts    engine registry (YOU live here)
- server/src/sessions.ts   in-memory + on-disk session store
- server/src/runner.ts     wraps the Agent SDK query loop
- web/src/pages/     routed pages (Dashboard, EngineDetail, SessionChat, JiraTab, ...)
- web/src/components/      reusable UI
- web/src/lib/api.ts       frontend API client
- web/src/index.css        global styles + theme tokens

HOT RELOAD
- Vite gives the frontend instant HMR. Save a .tsx and the UI updates without a refresh.
- The server runs under \`tsx watch\` — save a .ts and the server restarts (the user sees their chat disconnect briefly).

WHEN MAKING CHANGES
- Prefer Edit over Write to keep context. Use Glob/Grep to find what to change.
- After backend changes, suggest the user check the connection icon turns green again.
- Edit/Write/MultiEdit prompt the user for approval — that's intentional. Don't try to bypass.
- Run a typecheck after substantive changes:
    cd server && npx tsc --noEmit
    cd web && npx tsc -b --force
- Be concise. Make the change, then say in one sentence what to verify in the running app.

CONSTRAINTS
- Don't touch .env (it has secrets).
- Don't commit or push without the user asking.
- If a change requires installing a new npm dependency, ask first.

Begin.`,
    permissionMode: "default",
    settingSources: ["user", "project"],
    cwd: cockpitRoot,
  },
  {
    id: "codex",
    name: "Codex",
    description: "OpenAI's Codex (coming soon — adapter not yet implemented).",
    available: false,
    systemPrompt: "",
  },
];

export function listEngines(): Engine[] {
  return engines;
}

export function getEngine(id: string): Engine | undefined {
  return engines.find((e) => e.id === id);
}

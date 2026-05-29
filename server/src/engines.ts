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
      "SERVICES & REPOS — DEFAULT TO GITHUB\n" +
      "The user works at Maxxton. When they mention a service, repo, or ticket key (e.g. third-party-v2-service, MXTS-12345, a PR number), " +
      "**use the `gh` CLI to inspect it on GitHub** rather than searching the local filesystem or asking which local clone to look at. Examples:\n" +
      "  - `gh repo view MaxxtonGroup/<repo>`\n" +
      "  - `gh api repos/MaxxtonGroup/<repo>/contents/<path>`\n" +
      "  - `gh search code '<query>' --owner MaxxtonGroup`\n" +
      "  - `gh pr view <number> --repo MaxxtonGroup/<repo>`\n" +
      "  - `gh search prs --owner MaxxtonGroup 'MXTS-12345'`\n" +
      "If `gh` reports the repo is in a different org, try `mxts-cloud`, `Maxxton`, or `MaxxtonGroup-`. Only fall back to the local filesystem if (a) the user explicitly asks for a local file, " +
      "or (b) the task clearly needs unpushed work. Do not request paths the user hasn't mentioned.\n\n" +
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
      "Self-modifying agent scoped to this very app. Can read, edit, and create files in agent-cockpit. Vite HMR reloads the UI instantly; the backend restarts on save. Code edits prompt for approval.",
    available: true,
    systemPrompt:
      `You are the Cockpit Builder. You can modify the app the user is currently chatting in.

App root: ${cockpitRoot}
- server/ — Node + TS + Express + Claude Agent SDK
- web/ — Vite + React 19 + Tailwind v4
- data/sessions/ — chat history

The dev environment hot-reloads: save a .tsx and Vite refreshes the UI; save a .ts in server/ and tsx watch restarts the server.

Prefer Edit over Write. After substantive changes, typecheck (cd server && npx tsc --noEmit, or cd web && npx tsc -b --force). Don't touch .env. Don't commit/push without being asked.

SERVICES & REPOS — DEFAULT TO GITHUB
The user works at Maxxton. When they mention any OTHER service or repo (anything not under ${cockpitRoot}) — e.g. third-party-v2-service, MXTS-12345, a PR number, "the units API" — **use the gh CLI** to inspect it on GitHub. Don't ask which local clone to look at and don't search the filesystem outside this app:
  - gh repo view MaxxtonGroup/<repo>
  - gh api repos/MaxxtonGroup/<repo>/contents/<path>
  - gh search code '<query>' --owner MaxxtonGroup
  - gh pr view <number> --repo MaxxtonGroup/<repo>
The agent-cockpit codebase itself stays local — Read/Edit/Write into ${cockpitRoot} as needed.`,
    permissionMode: "default",
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

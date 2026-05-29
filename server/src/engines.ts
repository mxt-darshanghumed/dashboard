import { sessionsDir } from "./storage.js";

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
    name: "Echo",
    description: "Sanity-check chat. No tools, no memory — just a friendly assistant for testing the pipe.",
    available: true,
    systemPrompt:
      "You are a friendly assistant in a personal productivity dashboard. Reply in 1-2 sentences. Be warm but concise.",
    allowedTools: [],
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

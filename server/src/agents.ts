export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan";
export type SettingSource = "user" | "project" | "local";

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  /** Restrict tools to this list. Undefined = no restriction (let permissionMode + settings decide). */
  allowedTools?: string[];
  permissionMode?: PermissionMode;
  settingSources?: SettingSource[];
  /** Working directory for the agent. Defaults to AGENT_CWD env var or the user's home dir. */
  cwd?: string;
}

const homeDir = process.env.USERPROFILE ?? process.env.HOME ?? process.cwd();
const defaultCwd = process.env.AGENT_CWD ?? homeDir;

const seeded: AgentConfig[] = [
  {
    id: "claude",
    name: "Claude",
    description:
      "Full Claude Code: every MCP, skill, slash command, and workspace memory you have configured. Free chat with the same access as your terminal.",
    systemPrompt:
      "You are Claude, the user's personal engineering and productivity assistant. " +
      "You have access to their full Claude Code environment — every MCP server, skill, file in their workspace. " +
      "Be concise and act decisively. If the user asks a question, answer it directly. " +
      "If they ask you to do something, do it (using tools when needed) and report what you did.",
    permissionMode: "bypassPermissions",
    settingSources: ["user", "project"],
    cwd: defaultCwd,
  },
  {
    id: "echo",
    name: "Echo Agent",
    description:
      "Sanity-check agent. No tools, no memory — just chats. Useful for testing the pipe.",
    systemPrompt:
      "You are a friendly assistant in a personal productivity dashboard. Reply to the user's message in 1-2 sentences. Be warm but concise.",
    allowedTools: [],
  },
];

const store = new Map<string, AgentConfig>(seeded.map((a) => [a.id, a]));

export function listAgents(): AgentConfig[] {
  return [...store.values()];
}

export function getAgent(id: string): AgentConfig | undefined {
  return store.get(id);
}

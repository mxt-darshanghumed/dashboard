export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  allowedTools: string[];
}

const seeded: AgentConfig[] = [
  {
    id: "echo",
    name: "Echo Agent",
    description: "Sanity-check agent. Echoes your message back in a friendly tone — proves the pipe works end-to-end.",
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

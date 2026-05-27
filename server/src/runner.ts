import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentConfig } from "./agents.js";

export type RunEvent =
  | { type: "started"; agentId: string }
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "tool_result"; output: unknown }
  | { type: "done"; result?: string }
  | { type: "error"; error: string };

interface RunArgs {
  agent: AgentConfig;
  userPrompt: string;
  onEvent: (evt: RunEvent) => void;
}

export async function runAgent({ agent, userPrompt, onEvent }: RunArgs): Promise<void> {
  onEvent({ type: "started", agentId: agent.id });

  for await (const message of query({
    prompt: userPrompt,
    options: {
      systemPrompt: agent.systemPrompt,
      allowedTools: agent.allowedTools,
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          onEvent({ type: "text", text: block.text });
        } else if (block.type === "tool_use") {
          onEvent({ type: "tool_use", name: block.name, input: block.input });
        }
      }
    } else if (message.type === "user") {
      for (const block of message.message.content) {
        if (typeof block !== "string" && block.type === "tool_result") {
          onEvent({ type: "tool_result", output: block.content });
        }
      }
    } else if (message.type === "result") {
      onEvent({ type: "done", result: "result" in message ? (message.result as string) : undefined });
    }
  }
}

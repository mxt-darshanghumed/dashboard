import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Engine } from "./engines.js";

export type RunEvent =
  | { type: "started"; engineId: string; sessionId?: string }
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: unknown; id?: string }
  | { type: "tool_result"; output: unknown }
  | { type: "permission_request"; id: string; toolName: string; input: unknown }
  | { type: "done"; result?: string; sessionId?: string }
  | { type: "error"; error: string };

export type PermissionDecision =
  | { behavior: "allow"; updatedInput?: Record<string, unknown> }
  | { behavior: "deny"; message: string };

interface RunArgs {
  engine: Engine;
  userPrompt: string;
  resumeSessionId?: string;
  onEvent: (evt: RunEvent) => void;
  /** Called whenever the agent wants a tool that isn't pre-approved. */
  canUseTool?: (toolName: string, input: Record<string, unknown>) => Promise<PermissionDecision>;
}

// Only ask the user for tools that change code on disk.
// Everything else (reads, searches, bash, MCP calls, agent spawning) auto-allows.
const REQUIRES_PERMISSION = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

export async function runAgent({
  engine,
  userPrompt,
  resumeSessionId,
  onEvent,
  canUseTool,
}: RunArgs): Promise<string | undefined> {
  onEvent({ type: "started", engineId: engine.id, sessionId: resumeSessionId });

  let capturedSessionId: string | undefined = resumeSessionId;

  const wrappedCanUseTool = canUseTool
    ? async (toolName: string, input: Record<string, unknown>) => {
        if (!REQUIRES_PERMISSION.has(toolName)) {
          return { behavior: "allow" as const, updatedInput: input };
        }
        const result = await canUseTool(toolName, input);
        if (result.behavior === "allow") {
          return { behavior: "allow" as const, updatedInput: result.updatedInput ?? input };
        }
        return result;
      }
    : undefined;

  try {
    for await (const message of query({
      prompt: userPrompt,
      options: {
        systemPrompt: engine.systemPrompt,
        ...(engine.allowedTools !== undefined ? { allowedTools: engine.allowedTools } : {}),
        ...(engine.permissionMode ? { permissionMode: engine.permissionMode } : {}),
        ...(engine.settingSources ? { settingSources: engine.settingSources } : {}),
        ...(engine.cwd ? { cwd: engine.cwd } : {}),
        ...(resumeSessionId ? { resume: resumeSessionId } : {}),
        ...(wrappedCanUseTool ? { canUseTool: wrappedCanUseTool } : {}),
      },
    })) {
      if (message.type === "system" && message.subtype === "init") {
        const sid = (message as { session_id?: string }).session_id;
        if (sid) capturedSessionId = sid;
      } else if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "text") {
            onEvent({ type: "text", text: block.text });
          } else if (block.type === "tool_use") {
            onEvent({ type: "tool_use", name: block.name, input: block.input, id: block.id });
          }
        }
      } else if (message.type === "user") {
        for (const block of message.message.content) {
          if (typeof block !== "string" && block.type === "tool_result") {
            onEvent({ type: "tool_result", output: block.content });
          }
        }
      } else if (message.type === "result") {
        onEvent({
          type: "done",
          result: "result" in message ? (message.result as string) : undefined,
          sessionId: capturedSessionId,
        });
      }
    }
  } catch (err) {
    onEvent({
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return capturedSessionId;
}

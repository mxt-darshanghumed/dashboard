import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
const ENV_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
const envResult = loadEnv({ path: ENV_PATH });
console.log(`[env] loading ${ENV_PATH}`);
console.log(`[env] dotenv result: ${envResult.error ? "ERROR: " + envResult.error.message : "OK"}`);
console.log(
  `[env] JIRA_SITE=${process.env.JIRA_SITE ?? "(unset)"}, JIRA_EMAIL=${process.env.JIRA_EMAIL ?? "(unset)"}, JIRA_AUTH_TYPE=${process.env.JIRA_AUTH_TYPE ?? "(unset)"}, JIRA_API_TOKEN.length=${process.env.JIRA_API_TOKEN?.length ?? 0}`
);
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { runAgent, type PermissionDecision } from "./runner.js";
import { listEngines, getEngine } from "./engines.js";
import {
  createSession,
  listSessionsForEngine,
  getSession,
  getSessionSummary,
  deleteSession,
  touchSession,
  renameSession,
  appendUserMessage,
  appendAssistantMessage,
  clearSessionMessages,
  initSessionStore,
  type AssistantBlock,
  type Message,
} from "./sessions.js";
import { listMyOpenPRs, searchPRsForTicketKey } from "./github.js";
import type { PullRequestItem } from "./github.js";
import { listMyActiveJiraIssues, getJiraIssue } from "./jira.js";
import { analyzeTicketProgress, findLinkedPRs } from "./progress.js";
import { findLocalWorkForTicket } from "./localGit.js";
import { tokens as countTokensOffline, compress, isOllamaAvailable, getOllamaConfig } from "./compressor.js";

const PORT = Number(process.env.PORT ?? 3001);
const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.post("/api/tokens/count", (req, res) => {
  const text = req.body?.text;
  if (typeof text !== "string") return res.status(400).json({ error: "text required" });
  res.json({ tokens: countTokensOffline(text), approximate: true });
});

app.post("/api/compress", async (req, res) => {
  const text = req.body?.text;
  const mode = req.body?.mode === "smart" ? "smart" : "rules";
  if (typeof text !== "string") return res.status(400).json({ error: "text required" });
  try {
    const result = await compress(text, mode);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/compress/status", async (_req, res) => {
  const { url, model } = getOllamaConfig();
  const available = await isOllamaAvailable();
  res.json({ ollama: { available, url, model } });
});

app.get("/api/engines", (_req, res) => {
  res.json({ items: listEngines() });
});

app.get("/api/engines/:engineId", (req, res) => {
  const engine = getEngine(req.params.engineId);
  if (!engine) return res.status(404).json({ error: "not found" });
  res.json(engine);
});

app.get("/api/engines/:engineId/sessions", (req, res) => {
  const engine = getEngine(req.params.engineId);
  if (!engine) return res.status(404).json({ error: "engine not found" });
  res.json({ items: listSessionsForEngine(engine.id) });
});

app.post("/api/engines/:engineId/sessions", (req, res) => {
  const engine = getEngine(req.params.engineId);
  if (!engine) return res.status(404).json({ error: "engine not found" });
  if (!engine.available) return res.status(400).json({ error: "engine not available" });
  const title = (req.body && typeof req.body.title === "string" ? req.body.title : undefined) ?? "New chat";
  const session = createSession(engine.id, title);
  res.json({ session: getSessionSummary(session.id) });
});

app.get("/api/sessions/:id", (req, res) => {
  const s = getSessionSummary(req.params.id);
  if (!s) return res.status(404).json({ error: "session not found" });
  res.json({ session: s });
});

app.patch("/api/sessions/:id", (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title : undefined;
  if (!title) return res.status(400).json({ error: "title required" });
  const updated = renameSession(req.params.id, title);
  if (!updated) return res.status(404).json({ error: "session not found" });
  res.json({ session: updated });
});

app.get("/api/sessions/:id/messages", (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: "session not found" });
  res.json({ messages: s.messages });
});

app.delete("/api/sessions/:id", (req, res) => {
  deleteSession(req.params.id);
  res.json({ ok: true });
});

app.get("/api/prs", async (_req, res) => {
  const result = await listMyOpenPRs();
  if (result.ok) {
    res.json({ items: result.items });
  } else {
    res.status(result.error.kind === "unknown" ? 500 : 400).json({ error: result.error });
  }
});

app.get("/api/jira/issues", async (_req, res) => {
  const result = await listMyActiveJiraIssues();
  if (result.ok) {
    res.json({ items: result.items });
  } else {
    res.status(result.error.kind === "unknown" ? 500 : 400).json({ error: result.error });
  }
});

app.get("/api/jira/issues/:key", async (req, res) => {
  const result = await getJiraIssue(req.params.key);
  if (result.ok) {
    res.json({ issue: result.issue });
  } else {
    const status =
      result.error.kind === "not_found"
        ? 404
        : result.error.kind === "unknown"
        ? 500
        : 400;
    res.status(status).json({ error: result.error });
  }
});

app.get("/api/jira/progress/:key", async (req, res) => {
  const ticketKey = req.params.key;
  const forceRefresh = req.query.refresh === "1";

  const issueResult = await getJiraIssue(ticketKey);
  if (!issueResult.ok) {
    return res.status(400).json({ error: issueResult.error });
  }

  const [cachedPRs, targetedPRs, localWork] = await Promise.all([
    listMyOpenPRs(),
    searchPRsForTicketKey(ticketKey),
    findLocalWorkForTicket(ticketKey),
  ]);

  const fromCached = cachedPRs.ok ? findLinkedPRs(cachedPRs.items, ticketKey) : [];
  const fromTargeted = targetedPRs.ok ? findLinkedPRs(targetedPRs.items, ticketKey) : [];

  const byUrl = new Map<string, PullRequestItem>();
  for (const pr of [...fromCached, ...fromTargeted]) byUrl.set(pr.url, pr);
  const linked = [...byUrl.values()];

  console.log(
    `[progress] ${ticketKey}: cached=${fromCached.length} targeted=${fromTargeted.length} merged=${linked.length} localWork=${localWork.length}`
  );

  const analysis = await analyzeTicketProgress(
    ticketKey,
    issueResult.issue,
    linked,
    localWork,
    { forceRefresh }
  );
  if (analysis.ok) {
    res.json({ progress: analysis.result, linkedPrCount: linked.length });
  } else {
    res.status(500).json({ error: analysis.error });
  }
});

const httpServer = createServer(app);

const wss = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (req, socket, head) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const match = /^\/ws\/session\/([\w-]+)$/.exec(url.pathname);
    if (!match) {
      socket.destroy();
      return;
    }
    const sessionId = match[1];
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, sessionId);
    });
  } catch {
    socket.destroy();
  }
});

wss.on("connection", (ws, sessionId: string) => {
  const session = getSession(sessionId);
  if (!session) {
    ws.send(JSON.stringify({ type: "error", error: `session ${sessionId} not found` }));
    ws.close(1008, "session not found");
    return;
  }
  const engine = getEngine(session.engineId);
  if (!engine || !engine.available) {
    ws.send(JSON.stringify({ type: "error", error: "engine unavailable" }));
    ws.close(1008, "engine unavailable");
    return;
  }

  session.ws = ws;
  const pendingPermissions = new Map<
    string,
    { resolve: (d: PermissionDecision) => void; toolName: string; input: unknown }
  >();
  // Buffer of in-flight assistant blocks (so we can persist a complete turn on "done")
  let currentAssistantBlocks: AssistantBlock[] = [];

  ws.send(JSON.stringify({ type: "session_open", sessionId }));
  ws.send(JSON.stringify({ type: "history", messages: session.messages }));

  ws.on("close", () => {
    if (session.ws === ws) session.ws = undefined;
    pendingPermissions.forEach(({ resolve }) =>
      resolve({ behavior: "deny", message: "client disconnected" })
    );
    pendingPermissions.clear();
  });

  ws.on("message", async (raw) => {
    let msg: {
      type: string;
      prompt?: string;
      id?: string;
      behavior?: "allow" | "deny";
      reason?: string;
      replyTo?: { id?: unknown; preview?: unknown };
    };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: "error", error: "invalid json" }));
      return;
    }

    if (msg.type === "reset") {
      clearSessionMessages(session.id);
      ws.send(JSON.stringify({ type: "reset_ack" }));
      return;
    }

    if (msg.type === "permission_response" && msg.id) {
      const entry = pendingPermissions.get(msg.id);
      if (entry) {
        pendingPermissions.delete(msg.id);
        // Persist the outcome into the current assistant block list
        currentAssistantBlocks.push({
          type: "permission_request",
          id: msg.id,
          toolName: entry.toolName,
          input: entry.input,
          status: msg.behavior === "allow" ? "allowed" : "denied",
        });
        if (msg.behavior === "allow") {
          entry.resolve({ behavior: "allow" });
        } else {
          entry.resolve({ behavior: "deny", message: msg.reason ?? "denied by user" });
        }
      }
      return;
    }

    if (msg.type !== "run") {
      ws.send(JSON.stringify({ type: "error", error: "expected { type: 'run', prompt }" }));
      return;
    }
    if (session.busy) {
      ws.send(JSON.stringify({ type: "error", error: "session is still responding to the previous message" }));
      return;
    }

    session.busy = true;
    const userText = msg.prompt ?? "";
    const replyTo =
      msg.replyTo && typeof msg.replyTo.id === "string" && typeof msg.replyTo.preview === "string"
        ? { id: msg.replyTo.id, preview: msg.replyTo.preview }
        : undefined;
    const userMessage = appendUserMessage(session.id, userText, replyTo);
    if (userMessage && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "user_recorded", message: userMessage }));
    }

    currentAssistantBlocks = [];

    // Build a prompt that includes any quoted message inline so the agent has the context
    const composedPrompt = replyTo
      ? `[Replying to an earlier message: "${replyTo.preview.slice(0, 300)}"]\n\n${userText}`
      : userText;

    try {
      const finalSessionId = await runAgent({
        engine,
        userPrompt: composedPrompt,
        resumeSessionId: session.agentSessionId,
        onEvent: (evt) => {
          // Accumulate blocks for persistence; permission outcomes are recorded
          // in the message handler when the client responds.
          if (evt.type === "text") {
            const last = currentAssistantBlocks[currentAssistantBlocks.length - 1];
            if (last?.type === "text") last.text += evt.text;
            else currentAssistantBlocks.push({ type: "text", text: evt.text });
          } else if (evt.type === "tool_use") {
            currentAssistantBlocks.push({
              type: "tool_use",
              name: evt.name,
              input: evt.input,
              id: evt.id,
            });
          } else if (evt.type === "tool_result") {
            currentAssistantBlocks.push({ type: "tool_result", output: evt.output });
          } else if (evt.type === "error") {
            currentAssistantBlocks.push({ type: "error", text: evt.error });
          }
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(evt));
        },
        canUseTool: async (toolName: string, input: Record<string, unknown>) => {
          const reqId = Math.random().toString(36).slice(2);
          return new Promise<PermissionDecision>((resolve) => {
            pendingPermissions.set(reqId, { resolve, toolName, input });
            if (ws.readyState === ws.OPEN) {
              ws.send(
                JSON.stringify({ type: "permission_request", id: reqId, toolName, input })
              );
            } else {
              pendingPermissions.delete(reqId);
              resolve({ behavior: "deny", message: "client not connected" });
            }
          });
        },
      });
      if (finalSessionId) session.agentSessionId = finalSessionId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      currentAssistantBlocks.push({ type: "error", text: message });
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "error", error: message }));
      }
    } finally {
      // Persist whatever the assistant produced as a complete turn
      if (currentAssistantBlocks.length > 0) {
        const m = appendAssistantMessage(session.id, currentAssistantBlocks);
        if (m && ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: "assistant_recorded", message: m }));
        }
      }
      currentAssistantBlocks = [];
      session.busy = false;
      touchSession(session.id);
    }
  });
});

initSessionStore()
  .catch((err) => console.log(`[sessions] init failed: ${err}`))
  .finally(() => {
    httpServer.listen(PORT, () => {
      console.log(`[server] listening on http://localhost:${PORT}`);
    });
  });

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
} from "./sessions.js";
import { listMyOpenPRs, searchPRsForTicketKey } from "./github.js";
import type { PullRequestItem } from "./github.js";
import { listMyActiveJiraIssues, getJiraIssue } from "./jira.js";
import { analyzeTicketProgress, findLinkedPRs } from "./progress.js";
import { findLocalWorkForTicket } from "./localGit.js";

const PORT = Number(process.env.PORT ?? 3001);
const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
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
  const pendingPermissions = new Map<string, (decision: PermissionDecision) => void>();

  ws.send(JSON.stringify({ type: "session_open", sessionId }));

  ws.on("close", () => {
    if (session.ws === ws) session.ws = undefined;
    pendingPermissions.forEach((resolve) =>
      resolve({ behavior: "deny", message: "client disconnected" })
    );
    pendingPermissions.clear();
  });

  ws.on("message", async (raw) => {
    let msg: { type: string; prompt?: string; id?: string; behavior?: "allow" | "deny"; reason?: string };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: "error", error: "invalid json" }));
      return;
    }

    if (msg.type === "reset") {
      session.agentSessionId = undefined;
      ws.send(JSON.stringify({ type: "reset_ack" }));
      return;
    }

    if (msg.type === "permission_response" && msg.id) {
      const resolve = pendingPermissions.get(msg.id);
      if (resolve) {
        pendingPermissions.delete(msg.id);
        if (msg.behavior === "allow") {
          resolve({ behavior: "allow" });
        } else {
          resolve({ behavior: "deny", message: msg.reason ?? "denied by user" });
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
    touchSession(session.id);
    if (!session.firstUserMessage && msg.prompt) {
      session.firstUserMessage = msg.prompt.slice(0, 200);
      if (session.title === "New chat") session.title = msg.prompt.slice(0, 60);
    }

    try {
      const finalSessionId = await runAgent({
        engine,
        userPrompt: msg.prompt ?? "",
        resumeSessionId: session.agentSessionId,
        onEvent: (evt) => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(evt));
        },
        canUseTool: async (toolName: string, input: Record<string, unknown>) => {
          const reqId = Math.random().toString(36).slice(2);
          return new Promise<PermissionDecision>((resolve) => {
            pendingPermissions.set(reqId, resolve);
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
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "error", error: message }));
      }
    } finally {
      session.busy = false;
      touchSession(session.id);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});

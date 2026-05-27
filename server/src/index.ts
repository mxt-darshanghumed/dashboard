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
import { runAgent } from "./runner.js";
import { listAgents, getAgent } from "./agents.js";
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

app.get("/api/agents", (_req, res) => {
  res.json(listAgents());
});

app.get("/api/agents/:id", (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "not found" });
  res.json(agent);
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

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (ws) => {
  ws.on("message", async (raw) => {
    let msg: { type: string; agentId?: string; prompt?: string };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: "error", error: "invalid json" }));
      return;
    }

    if (msg.type !== "run" || !msg.agentId) {
      ws.send(JSON.stringify({ type: "error", error: "expected { type: 'run', agentId, prompt? }" }));
      return;
    }

    const agent = getAgent(msg.agentId);
    if (!agent) {
      ws.send(JSON.stringify({ type: "error", error: `agent ${msg.agentId} not found` }));
      return;
    }

    try {
      await runAgent({
        agent,
        userPrompt: msg.prompt ?? "",
        onEvent: (evt) => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(evt));
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "error", error: message }));
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});

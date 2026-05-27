import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { JiraIssueDetail } from "./jira.js";
import type { PullRequestItem } from "./github.js";
import type { LocalWorkInfo } from "./localGit.js";

const execFileP = promisify(execFile);

export interface ProgressResult {
  codeProgress: number;
  processProgress: number;
  percent: number;
  summary: string;
  codeReasoning: string;
  processReasoning: string;
  signals: string[];
  analyzedAt: string;
}

export interface ProgressError {
  kind: "agent_failed" | "parse" | "unknown";
  message: string;
}

interface CacheEntry {
  result: ProgressResult;
  storedAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<
  string,
  Promise<{ ok: true; result: ProgressResult } | { ok: false; error: ProgressError }>
>();

const MAX_CONCURRENT = 3;
let activeCount = 0;
const waitQueue: Array<() => void> = [];

async function withSemaphore<T>(fn: () => Promise<T>): Promise<T> {
  if (activeCount >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waitQueue.push(resolve));
  }
  activeCount++;
  try {
    return await fn();
  } finally {
    activeCount--;
    const next = waitQueue.shift();
    if (next) next();
  }
}

export function clearProgressCache(key?: string) {
  if (key) cache.delete(key);
  else cache.clear();
}

const TICKET_KEY_RE = /[A-Z][A-Z0-9]+-+\d+/g;
function extractKeys(text: string): string[] {
  return (text.match(TICKET_KEY_RE) ?? []).map((m) => m.replace(/-+/g, "-"));
}
export function findLinkedPRs(prs: PullRequestItem[], ticketKey: string): PullRequestItem[] {
  return prs.filter(
    (pr) =>
      extractKeys(pr.title).includes(ticketKey) ||
      extractKeys(pr.headRefName).includes(ticketKey)
  );
}

interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

async function fetchPRFiles(repo: string, number: number): Promise<PRFile[]> {
  try {
    const { stdout } = await execFileP(
      "gh",
      ["api", `repos/${repo}/pulls/${number}/files?per_page=50`],
      { maxBuffer: 16 * 1024 * 1024, windowsHide: true }
    );
    const files = JSON.parse(stdout) as PRFile[];
    console.log(`[progress] fetched ${files.length} files for ${repo}#${number}`);
    return files;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[progress] FAILED to fetch files for ${repo}#${number}: ${msg.slice(0, 200)}`);
    return [];
  }
}

const MAX_FILES_IN_PROMPT = 15;
const MAX_PATCH_LINES = 30;
const MAX_PATCH_CHARS = 1500;

function summarizeFiles(files: PRFile[]): string {
  if (files.length === 0) return "  (no files / could not fetch diff)";
  const head = files.slice(0, MAX_FILES_IN_PROMPT);
  const lines: string[] = [];
  for (const f of head) {
    lines.push(`  - ${f.filename}  (${f.status}, +${f.additions} -${f.deletions})`);
    if (f.patch) {
      const truncated = f.patch.split("\n").slice(0, MAX_PATCH_LINES).join("\n").slice(0, MAX_PATCH_CHARS);
      const indented = truncated
        .split("\n")
        .map((l) => "      " + l)
        .join("\n");
      lines.push(indented);
    }
  }
  if (files.length > MAX_FILES_IN_PROMPT) {
    lines.push(`  ... and ${files.length - MAX_FILES_IN_PROMPT} more files`);
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT = `You analyze software ticket progress. Your score has TWO parts:

CODE PROGRESS (max 75 points) — THE HEAVY SIGNAL

You have THREE possible sources of code evidence. Use ALL that are present:
1. PR diff content (most authoritative)
2. Local committed changes (committed to a local branch, may not be pushed yet)
3. Local uncommitted changes (working tree changes on the user's machine)

PRIMARY rubric (apply to any visible code source):
- 0: no code changes anywhere
- 5-20: setup, scaffolding, renames — barely touches ticket scope
- 25-45: partial implementation, only some of the described work is in code
- 50-65: most ticket scope is implemented in code
- 65-75: code appears to fully implement the ticket's described work

CRITICAL: Local uncommitted changes COUNT. If the user has work-in-progress diffs on their machine that match the ticket scope, score the code based on that work — they just haven't committed yet. Do NOT score 0 because no PR exists if local diffs show real work.

If PR diff fetch failed (no patches shown) but PR exists, infer from PR metadata + ticket status, cap at 65.

If NO code evidence anywhere (no PR, no local branch, no diffs at all): codeProgress = 0.

PROCESS PROGRESS (max 25 points) — DETERMINISTIC GATES
Add up strictly:
- Any code committed (PR exists OR local branch has commits ahead of base): +3
- PR exists AND not draft: +5
- CI passing on latest commit (status=success): +5
- At least 1 approval AND 0 changes-requested: +5
- 0 unresolved review threads: +3
- PR merged: +4
If no PR exists, max process is +3 (the local-commits credit).

Output ONLY this compact JSON (no markdown, no prose):
{"codeProgress":<0-75>,"processProgress":<0-25>,"summary":"<one short sentence>","codeReasoning":"<2-3 sentences. Mention the source(s) used: PR diff, local commits, or local uncommitted work. Reference specific files when possible.>","processReasoning":"<which gates passed/failed>","signals":["<short evidence>","<short evidence>"]}

Be specific. Reference actual file names from the diffs.`;

function buildPrompt(
  issue: JiraIssueDetail,
  prs: PullRequestItem[],
  files: Map<number, PRFile[]>,
  localWork: LocalWorkInfo[]
): string {
  const desc = (issue.description ?? "").slice(0, 1200);
  const recentComments = issue.comments
    .slice(-3)
    .map(
      (c) =>
        `  - ${c.author?.displayName ?? "anon"}: ${(c.bodyHtml || "")
          .replace(/<[^>]+>/g, "")
          .slice(0, 200)}`
    )
    .join("\n");

  const prSummaries =
    prs.length === 0
      ? "(no linked PRs)"
      : prs
          .map((pr, i) => {
            const f = files.get(pr.number) ?? [];
            return `${i + 1}. ${pr.repo}#${pr.number} "${pr.title}"
   state=${pr.state}${pr.isDraft ? " draft" : ""} ci=${pr.ci}
   branch=${pr.headRefName} → ${pr.baseRefName}
   approvers=${pr.approvers.length} changes_requested=${pr.changesRequestedBy.length} pending=${pr.pendingReviewers.length}
   unresolved_threads=${pr.unresolvedThreads}
   ${pr.mergedAt ? "merged_at=" + pr.mergedAt : ""}
   diff:
${summarizeFiles(f)}`;
          })
          .join("\n\n");

  const localSection =
    localWork.length === 0
      ? "(no local branch matching this ticket key found across discovered repos)"
      : localWork
          .map((w) => {
            return `Repo: ${w.repoName}
Branch: ${w.branch} (${w.commitsAhead} commits ahead of ${w.baseBranch})${w.isCurrentBranch ? " — currently checked out, uncommitted work visible" : ""}

Committed diff stat (vs ${w.baseBranch}):
${w.committedDiffStat || "  (no committed changes ahead of base)"}

Committed diff (first 5000 chars):
${w.committedDiff || "  (empty)"}
${
  w.isCurrentBranch
    ? `
Uncommitted (working-tree) status:
${w.uncommittedStatus || "  (clean working tree)"}

Uncommitted diff (first 5000 chars):
${w.uncommittedDiff || "  (no uncommitted changes)"}`
    : ""
}`;
          })
          .join("\n\n");

  return `Ticket
  key: ${issue.key}
  status: ${issue.statusName}
  type: ${issue.issueType}
  priority: ${issue.priority}
  summary: ${issue.summary}
  description (first 1200 chars):
${desc || "  (empty)"}
  total comments: ${issue.comments.length}${recentComments ? "\n  recent comments:\n" + recentComments : ""}

Linked PRs:
${prSummaries}

Local Work (from disk):
${localSection}`;
}

function extractJson(text: string): string {
  let s = text.trim();
  if (s.startsWith("```")) s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = s.indexOf("{");
  if (start < 0) return s;
  return s.slice(start).trim();
}

export async function analyzeTicketProgress(
  ticketKey: string,
  issue: JiraIssueDetail,
  prs: PullRequestItem[],
  localWork: LocalWorkInfo[],
  options: { forceRefresh?: boolean } = {}
): Promise<{ ok: true; result: ProgressResult } | { ok: false; error: ProgressError }> {
  const now = Date.now();
  if (!options.forceRefresh) {
    const cached = cache.get(ticketKey);
    if (cached && now - cached.storedAt < CACHE_TTL_MS) {
      return { ok: true, result: cached.result };
    }
  }

  const existing = inflight.get(ticketKey);
  if (existing) return existing;

  const promise = withSemaphore(async () => {
    const files = new Map<number, PRFile[]>();
    await Promise.all(
      prs.map(async (pr) => {
        const f = await fetchPRFiles(pr.repo, pr.number);
        files.set(pr.number, f);
      })
    );

    let text = "";
    try {
      for await (const message of query({
        prompt: buildPrompt(issue, prs, files, localWork),
        options: {
          systemPrompt: SYSTEM_PROMPT,
          permissionMode: "bypassPermissions",
          allowedTools: [],
        },
      })) {
        if (message.type === "assistant") {
          for (const block of message.message.content) {
            if (block.type === "text") text += block.text;
          }
        }
      }
    } catch (err) {
      return {
        ok: false as const,
        error: {
          kind: "agent_failed" as const,
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(text));
    } catch {
      return {
        ok: false as const,
        error: {
          kind: "parse" as const,
          message: `Could not parse agent response. First 300 chars: ${text.slice(0, 300)}`,
        },
      };
    }
    if (!parsed || typeof parsed !== "object") {
      return { ok: false as const, error: { kind: "parse" as const, message: "Agent returned non-object" } };
    }
    const o = parsed as Record<string, unknown>;
    const codeProgress = Math.max(0, Math.min(75, Math.round(Number(o.codeProgress) || 0)));
    const processProgress = Math.max(0, Math.min(25, Math.round(Number(o.processProgress) || 0)));
    const result: ProgressResult = {
      codeProgress,
      processProgress,
      percent: codeProgress + processProgress,
      summary: String(o.summary ?? "").slice(0, 240),
      codeReasoning: String(o.codeReasoning ?? "").slice(0, 600),
      processReasoning: String(o.processReasoning ?? "").slice(0, 400),
      signals: Array.isArray(o.signals)
        ? o.signals.slice(0, 6).map((s) => String(s).slice(0, 200))
        : [],
      analyzedAt: new Date().toISOString(),
    };
    cache.set(ticketKey, { result, storedAt: Date.now() });
    return { ok: true as const, result };
  });

  inflight.set(ticketKey, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(ticketKey);
  }
}

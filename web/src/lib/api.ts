export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  allowedTools: string[];
}

export async function fetchAgents(): Promise<AgentConfig[]> {
  const r = await fetch("/api/agents");
  if (!r.ok) throw new Error(`fetchAgents: ${r.status}`);
  return r.json();
}

export async function fetchAgent(id: string): Promise<AgentConfig> {
  const r = await fetch(`/api/agents/${id}`);
  if (!r.ok) throw new Error(`fetchAgent: ${r.status}`);
  return r.json();
}

export type RunEvent =
  | { type: "started"; agentId: string }
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "tool_result"; output: unknown }
  | { type: "done"; result?: string }
  | { type: "error"; error: string };

export type CiStatus = "success" | "failure" | "pending" | "none";
export type ReviewStatus = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | "NONE";

export interface Reviewer {
  login: string;
  avatarUrl: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING";
}

export type PrState = "OPEN" | "MERGED" | "CLOSED";

export interface PullRequestItem {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  baseRefName: string;
  repo: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  state: PrState;
  isDraft: boolean;
  ci: CiStatus;
  review: ReviewStatus;
  labels: { name: string; color: string }[];
  author: { login: string; avatarUrl: string } | null;
  unresolvedThreads: number;
  approvers: Reviewer[];
  changesRequestedBy: Reviewer[];
  pendingReviewers: { login: string; avatarUrl: string }[];
}

export interface PrError {
  kind: "gh_not_found" | "gh_not_authenticated" | "unknown";
  message: string;
}

export class ApiError extends Error {
  payload: { kind: string; message: string };
  constructor(payload: { kind: string; message: string }) {
    super(payload.message);
    this.payload = payload;
  }
}

export async function fetchPRs(): Promise<{ items: PullRequestItem[] }> {
  const r = await fetch("/api/prs");
  const body = await r.json();
  if (!r.ok) throw new ApiError(body.error);
  return body;
}

export type JiraStatusCategory = "new" | "indeterminate" | "done" | "unknown";
export type JiraPriority = "Highest" | "High" | "Medium" | "Low" | "Lowest" | "Unknown";

export interface JiraIssueItem {
  key: string;
  url: string;
  summary: string;
  statusName: string;
  statusCategory: JiraStatusCategory;
  priority: JiraPriority;
  issueType: string;
  issueTypeIconUrl: string;
  projectKey: string;
  updated: string;
}

export async function fetchJiraIssues(): Promise<{ items: JiraIssueItem[] }> {
  const r = await fetch("/api/jira/issues");
  const body = await r.json();
  if (!r.ok) throw new ApiError(body.error);
  return body;
}

export interface JiraComment {
  id: string;
  author: { displayName: string; avatarUrl: string } | null;
  created: string;
  updated: string;
  bodyHtml: string;
}

export interface JiraIssueDetail extends JiraIssueItem {
  description: string | null;
  descriptionHtml: string | null;
  assignee: { displayName: string; avatarUrl: string } | null;
  reporter: { displayName: string; avatarUrl: string } | null;
  labels: string[];
  created: string;
  comments: JiraComment[];
}

export async function fetchJiraIssue(key: string): Promise<{ issue: JiraIssueDetail }> {
  const r = await fetch(`/api/jira/issues/${encodeURIComponent(key)}`);
  const body = await r.json();
  if (!r.ok) throw new ApiError(body.error);
  return body;
}

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

export async function fetchTicketProgress(
  key: string,
  options: { refresh?: boolean } = {}
): Promise<{ progress: ProgressResult; linkedPrCount: number }> {
  const url = `/api/jira/progress/${encodeURIComponent(key)}${options.refresh ? "?refresh=1" : ""}`;
  const r = await fetch(url);
  const body = await r.json();
  if (!r.ok) throw new ApiError(body.error);
  return body;
}

export function openRunSocket(onEvent: (evt: RunEvent) => void): WebSocket {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
  ws.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data));
    } catch {
      onEvent({ type: "error", error: "bad message" });
    }
  };
  ws.onerror = () => onEvent({ type: "error", error: "socket error" });
  return ws;
}

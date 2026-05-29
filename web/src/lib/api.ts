export interface Engine {
  id: string;
  name: string;
  description: string;
  available: boolean;
}

export interface SessionSummary {
  id: string;
  engineId: string;
  title: string;
  createdAt: string;
  lastActivityAt: string;
  busy: boolean;
  firstUserMessage?: string;
  connected: boolean;
  messageCount: number;
}

export type StoredAssistantBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: unknown; id?: string }
  | { type: "tool_result"; output: unknown }
  | { type: "permission_request"; id: string; toolName: string; input: unknown; status: "allowed" | "denied" }
  | { type: "error"; text: string };

export interface StoredMessage {
  id: string;
  ts: string;
  role: "user" | "assistant";
  text?: string;
  replyTo?: { id: string; preview: string };
  blocks?: StoredAssistantBlock[];
}

export async function fetchEngines(): Promise<Engine[]> {
  const r = await fetch("/api/engines");
  if (!r.ok) throw new Error(`fetchEngines: ${r.status}`);
  const body = (await r.json()) as { items: Engine[] };
  return body.items;
}

export async function fetchEngine(id: string): Promise<Engine> {
  const r = await fetch(`/api/engines/${id}`);
  if (!r.ok) throw new Error(`fetchEngine: ${r.status}`);
  return r.json();
}

export async function fetchSessions(engineId: string): Promise<SessionSummary[]> {
  const r = await fetch(`/api/engines/${engineId}/sessions`);
  if (!r.ok) throw new Error(`fetchSessions: ${r.status}`);
  const body = (await r.json()) as { items: SessionSummary[] };
  return body.items;
}

export async function createSession(engineId: string, title?: string): Promise<SessionSummary> {
  const r = await fetch(`/api/engines/${engineId}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!r.ok) throw new Error(`createSession: ${r.status}`);
  const body = (await r.json()) as { session: SessionSummary };
  return body.session;
}

export async function deleteSession(id: string): Promise<void> {
  const r = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`deleteSession: ${r.status}`);
}

export async function renameSession(id: string, title: string): Promise<SessionSummary> {
  const r = await fetch(`/api/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!r.ok) throw new Error(`renameSession: ${r.status}`);
  const body = (await r.json()) as { session: SessionSummary };
  return body.session;
}

export async function fetchSessionMessages(id: string): Promise<StoredMessage[]> {
  const r = await fetch(`/api/sessions/${id}/messages`);
  if (!r.ok) throw new Error(`fetchSessionMessages: ${r.status}`);
  const body = (await r.json()) as { messages: StoredMessage[] };
  return body.messages;
}

export type RunEvent =
  | { type: "session_open"; sessionId: string }
  | { type: "history"; messages: StoredMessage[] }
  | { type: "started"; engineId: string; sessionId?: string }
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: unknown; id?: string }
  | { type: "tool_result"; output: unknown }
  | { type: "permission_request"; id: string; toolName: string; input: unknown }
  | { type: "user_recorded"; message: StoredMessage }
  | { type: "assistant_recorded"; message: StoredMessage }
  | { type: "done"; result?: string; sessionId?: string }
  | { type: "error"; error: string }
  | { type: "reset_ack" };

export function openSessionSocket(
  sessionId: string,
  onEvent: (evt: RunEvent) => void
): WebSocket {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${window.location.host}/ws/session/${sessionId}`);
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


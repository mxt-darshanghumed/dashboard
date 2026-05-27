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

export interface JiraError {
  kind: "missing_config" | "unauthorized" | "forbidden" | "network" | "not_found" | "unknown";
  message: string;
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

interface JiraApiIssue {
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
      statusCategory: { key: string };
    };
    priority?: { name: string } | null;
    issuetype?: { name: string; iconUrl: string } | null;
    project: { key: string };
    updated: string;
  };
}

const STATUS_CATEGORY_MAP: Record<string, JiraStatusCategory> = {
  new: "new",
  indeterminate: "indeterminate",
  done: "done",
};

const PRIORITY_VALUES: JiraPriority[] = ["Highest", "High", "Medium", "Low", "Lowest"];

function normalizePriority(name: string | undefined): JiraPriority {
  if (!name) return "Unknown";
  const found = PRIORITY_VALUES.find((p) => p.toLowerCase() === name.toLowerCase());
  return found ?? "Unknown";
}

let cachedCloudId: { site: string; id: string } | null = null;

async function resolveCloudId(site: string, token: string): Promise<string | null> {
  if (cachedCloudId && cachedCloudId.site === site) return cachedCloudId.id;

  try {
    const r = await fetch(`https://${site}/_edge/tenant_info`);
    if (r.ok) {
      const data = (await r.json()) as { cloudId?: string };
      if (data.cloudId) {
        cachedCloudId = { site, id: data.cloudId };
        return data.cloudId;
      }
    }
  } catch {
    /* fall through */
  }

  try {
    const r = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (r.ok) {
      const list = (await r.json()) as { id: string; url: string }[];
      const match = list.find((x) => x.url === `https://${site}`) ?? list[0];
      if (match) {
        cachedCloudId = { site, id: match.id };
        return match.id;
      }
    }
  } catch {
    /* fall through */
  }

  return null;
}

interface JiraAuth {
  site: string;
  authHeader: string;
  apiBase: string;
}

async function buildAuth(): Promise<
  { ok: true; auth: JiraAuth } | { ok: false; error: JiraError }
> {
  const site = process.env.JIRA_SITE;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const authType = (process.env.JIRA_AUTH_TYPE ?? "basic").toLowerCase();

  if (!site || !token || (authType === "basic" && !email)) {
    return {
      ok: false,
      error: {
        kind: "missing_config",
        message:
          "Add JIRA_SITE, JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_AUTH_TYPE to .env. Get a token at id.atlassian.com/manage-profile/security/api-tokens",
      },
    };
  }

  let apiBase: string;
  if (authType === "bearer") {
    const cloudId = process.env.JIRA_CLOUD_ID ?? (await resolveCloudId(site, token));
    if (!cloudId) {
      return {
        ok: false,
        error: {
          kind: "forbidden",
          message: `Couldn't discover Atlassian cloudId. Open https://${site}/_edge/tenant_info in your browser and add JIRA_CLOUD_ID=... to .env.`,
        },
      };
    }
    apiBase = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3`;
  } else {
    apiBase = `https://${site}/rest/api/3`;
  }

  const authHeader =
    authType === "bearer"
      ? `Bearer ${token}`
      : `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;

  return { ok: true, auth: { site, authHeader, apiBase } };
}

function handleHttpError(response: Response, body: string): JiraError {
  if (response.status === 401)
    return {
      kind: "unauthorized",
      message: "Atlassian rejected the credentials. Check JIRA_EMAIL and JIRA_API_TOKEN.",
    };
  if (response.status === 403)
    return { kind: "forbidden", message: `Atlassian returned 403. Body: ${body.slice(0, 400)}` };
  if (response.status === 404) return { kind: "not_found", message: "Issue not found." };
  return { kind: "unknown", message: `Atlassian responded ${response.status}: ${body.slice(0, 400)}` };
}

export async function listMyActiveJiraIssues(): Promise<
  { ok: true; items: JiraIssueItem[] } | { ok: false; error: JiraError }
> {
  const authResult = await buildAuth();
  if (!authResult.ok) return authResult;
  const { auth } = authResult;

  const jql =
    process.env.JIRA_JQL ??
    "assignee = currentUser() AND sprint in openSprints() ORDER BY rank ASC";

  console.log(`[jira] POST ${auth.apiBase}/search/jql with JQL: ${jql}`);

  let response: Response;
  try {
    response = await fetch(`${auth.apiBase}/search/jql`, {
      method: "POST",
      headers: {
        Authorization: auth.authHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jql,
        fields: ["summary", "status", "priority", "issuetype", "project", "updated"],
        maxResults: 100,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      error: { kind: "network", message: err instanceof Error ? err.message : String(err) },
    };
  }

  if (!response.ok) {
    const errBody = await response.text();
    console.log(`[jira] error response ${response.status}: ${errBody.slice(0, 400)}`);
    return { ok: false, error: handleHttpError(response, errBody) };
  }

  const rawText = await response.text();
  let body: { issues?: JiraApiIssue[]; nextPageToken?: string };
  try {
    body = JSON.parse(rawText);
  } catch {
    console.log(`[jira] unparseable response (first 500): ${rawText.slice(0, 500)}`);
    return { ok: false, error: { kind: "unknown", message: "Non-JSON response from Atlassian" } };
  }

  console.log(
    `[jira] response: ${body.issues?.length ?? 0} issues returned${body.nextPageToken ? " (more pages exist)" : ""}`
  );
  if ((body.issues?.length ?? 0) > 0) {
    const first = body.issues![0];
    console.log(`[jira] first issue: ${first.key} — ${first.fields?.summary?.slice(0, 80)}`);
  }

  const items: JiraIssueItem[] = (body.issues ?? []).map((i) => {
    const categoryKey = i.fields.status.statusCategory.key.toLowerCase();
    return {
      key: i.key,
      url: `https://${auth.site}/browse/${i.key}`,
      summary: i.fields.summary,
      statusName: i.fields.status.name,
      statusCategory: STATUS_CATEGORY_MAP[categoryKey] ?? "unknown",
      priority: normalizePriority(i.fields.priority?.name),
      issueType: i.fields.issuetype?.name ?? "Task",
      issueTypeIconUrl: i.fields.issuetype?.iconUrl ?? "",
      projectKey: i.fields.project.key,
      updated: i.fields.updated,
    };
  });

  return { ok: true, items };
}

interface JiraApiUser {
  displayName: string;
  avatarUrls?: { "48x48"?: string; "24x24"?: string };
}

interface JiraApiIssueDetail extends JiraApiIssue {
  renderedFields?: { description?: string };
  fields: JiraApiIssue["fields"] & {
    description?: unknown;
    assignee?: JiraApiUser | null;
    reporter?: JiraApiUser | null;
    labels?: string[];
    created: string;
  };
}

interface JiraApiComment {
  id: string;
  author?: JiraApiUser | null;
  body?: unknown;
  renderedBody?: string;
  created: string;
  updated: string;
}

function mapUser(u: JiraApiUser | null | undefined): { displayName: string; avatarUrl: string } | null {
  if (!u) return null;
  return {
    displayName: u.displayName,
    avatarUrl: u.avatarUrls?.["48x48"] ?? u.avatarUrls?.["24x24"] ?? "",
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function postProcessAtlassianHtml(html: string | null | undefined): string | null {
  if (!html) return html ?? null;
  let out = html;

  out = out.replace(/<p>\s*\{\{\s*([\s\S]*?)\s*\}\}\s*<\/p>/g, (_, content) => {
    const stripped = String(content)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (stripped.includes("\n")) {
      return `<pre><code>${escapeHtml(stripped)}</code></pre>`;
    }
    return `<p><code>${escapeHtml(stripped)}</code></p>`;
  });

  out = out.replace(/\{\{([^{}\n]+?)\}\}/g, (_, c) => `<code>${escapeHtml(String(c).trim())}</code>`);

  return out;
}

function adfToText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === "text" && typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) {
    return n.content.map(adfToText).join(n.type === "paragraph" ? "\n" : "");
  }
  return "";
}

export async function getJiraIssue(
  key: string
): Promise<{ ok: true; issue: JiraIssueDetail } | { ok: false; error: JiraError }> {
  const authResult = await buildAuth();
  if (!authResult.ok) return authResult;
  const { auth } = authResult;

  let issueRes: Response;
  let commentsRes: Response;
  try {
    [issueRes, commentsRes] = await Promise.all([
      fetch(`${auth.apiBase}/issue/${encodeURIComponent(key)}?expand=renderedFields`, {
        headers: { Authorization: auth.authHeader, Accept: "application/json" },
      }),
      fetch(`${auth.apiBase}/issue/${encodeURIComponent(key)}/comment?expand=renderedBody&orderBy=created`, {
        headers: { Authorization: auth.authHeader, Accept: "application/json" },
      }),
    ]);
  } catch (err) {
    return {
      ok: false,
      error: { kind: "network", message: err instanceof Error ? err.message : String(err) },
    };
  }

  if (!issueRes.ok) {
    return { ok: false, error: handleHttpError(issueRes, await issueRes.text()) };
  }

  const issueData = (await issueRes.json()) as JiraApiIssueDetail;
  const categoryKey = issueData.fields.status.statusCategory.key.toLowerCase();

  let comments: JiraComment[] = [];
  if (commentsRes.ok) {
    const cBody = (await commentsRes.json()) as { comments?: JiraApiComment[] };
    comments = (cBody.comments ?? []).map((c) => ({
      id: c.id,
      author: mapUser(c.author),
      created: c.created,
      updated: c.updated,
      bodyHtml:
        postProcessAtlassianHtml(c.renderedBody) ?? `<p>${escapeHtml(adfToText(c.body))}</p>`,
    }));
  }

  const description = adfToText(issueData.fields.description) || null;
  const descriptionHtml = postProcessAtlassianHtml(issueData.renderedFields?.description);

  const issue: JiraIssueDetail = {
    key: issueData.key,
    url: `https://${auth.site}/browse/${issueData.key}`,
    summary: issueData.fields.summary,
    statusName: issueData.fields.status.name,
    statusCategory: STATUS_CATEGORY_MAP[categoryKey] ?? "unknown",
    priority: normalizePriority(issueData.fields.priority?.name),
    issueType: issueData.fields.issuetype?.name ?? "Task",
    issueTypeIconUrl: issueData.fields.issuetype?.iconUrl ?? "",
    projectKey: issueData.fields.project.key,
    updated: issueData.fields.updated,
    description,
    descriptionHtml,
    assignee: mapUser(issueData.fields.assignee),
    reporter: mapUser(issueData.fields.reporter),
    labels: issueData.fields.labels ?? [],
    created: issueData.fields.created,
    comments,
  };

  return { ok: true, issue };
}

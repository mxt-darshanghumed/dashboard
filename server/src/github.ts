import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const ORG = "MaxxtonGroup";

const PR_QUERY = `
query($q: String!) {
  search(query: $q, type: ISSUE, first: 30) {
    nodes {
      ... on PullRequest {
        number
        title
        url
        headRefName
        baseRefName
        createdAt
        updatedAt
        mergedAt
        closedAt
        isDraft
        state
        reviewDecision
        repository { nameWithOwner }
        author { login avatarUrl }
        labels(first: 5) { nodes { name color } }
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup { state }
            }
          }
        }
        reviewThreads(first: 30) {
          nodes { isResolved }
        }
        latestReviews(first: 5) {
          nodes {
            state
            author { login avatarUrl }
          }
        }
        reviewRequests(first: 5) {
          nodes {
            requestedReviewer {
              __typename
              ... on User { login avatarUrl }
            }
          }
        }
      }
    }
  }
}`.trim();

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

interface GhSearchNode {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  baseRefName: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  isDraft: boolean;
  state: string;
  reviewDecision: string | null;
  repository: { nameWithOwner: string };
  author: { login: string; avatarUrl: string } | null;
  labels: { nodes: { name: string; color: string }[] };
  commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] };
  reviewThreads: { nodes: { isResolved: boolean }[] };
  latestReviews: {
    nodes: { state: string; author: { login: string; avatarUrl: string } | null }[];
  };
  reviewRequests: {
    nodes: {
      requestedReviewer:
        | { __typename: "User"; login: string; avatarUrl: string }
        | { __typename: string }
        | null;
    }[];
  };
}

function mapCi(rollup: string | undefined): CiStatus {
  switch (rollup) {
    case "SUCCESS":
      return "success";
    case "FAILURE":
    case "ERROR":
      return "failure";
    case "PENDING":
    case "EXPECTED":
      return "pending";
    default:
      return "none";
  }
}

function mapReview(decision: string | null): ReviewStatus {
  if (decision === "APPROVED") return "APPROVED";
  if (decision === "CHANGES_REQUESTED") return "CHANGES_REQUESTED";
  if (decision === "REVIEW_REQUIRED") return "REVIEW_REQUIRED";
  return "NONE";
}

export interface PRListError {
  kind: "gh_not_found" | "gh_not_authenticated" | "unknown";
  message: string;
}

async function searchPRsByQuery(
  searchQuery: string
): Promise<{ ok: true; items: PullRequestItem[] } | { ok: false; error: PRListError }> {
  try {
    const { stdout } = await execFileP(
      "gh",
      ["api", "graphql", "-f", `query=${PR_QUERY}`, "-f", `q=${searchQuery}`],
      { maxBuffer: 16 * 1024 * 1024, windowsHide: true }
    );

    const parsed = JSON.parse(stdout) as { data: { search: { nodes: GhSearchNode[] } } };
    const nodes = parsed.data?.search?.nodes ?? [];

    const items: PullRequestItem[] = nodes
      .filter((n) => n && typeof n.number === "number")
      .map((n) => {
        const unresolvedThreads = (n.reviewThreads?.nodes ?? []).filter((t) => !t.isResolved).length;

        const latestByLogin = new Map<string, Reviewer>();
        for (const r of n.latestReviews?.nodes ?? []) {
          if (!r.author || (r.state !== "APPROVED" && r.state !== "CHANGES_REQUESTED" && r.state !== "COMMENTED")) continue;
          latestByLogin.set(r.author.login, {
            login: r.author.login,
            avatarUrl: r.author.avatarUrl,
            state: r.state as Reviewer["state"],
          });
        }
        const approvers = [...latestByLogin.values()].filter((r) => r.state === "APPROVED");
        const changesRequestedBy = [...latestByLogin.values()].filter((r) => r.state === "CHANGES_REQUESTED");

        const pendingReviewers: { login: string; avatarUrl: string }[] = [];
        for (const req of n.reviewRequests?.nodes ?? []) {
          const r = req.requestedReviewer;
          if (r && r.__typename === "User" && "login" in r && "avatarUrl" in r) {
            pendingReviewers.push({ login: r.login, avatarUrl: r.avatarUrl });
          }
        }

        const state: PrState =
          n.state === "MERGED" ? "MERGED" : n.state === "CLOSED" ? "CLOSED" : "OPEN";
        return {
          number: n.number,
          title: n.title,
          url: n.url,
          headRefName: n.headRefName,
          baseRefName: n.baseRefName,
          repo: n.repository.nameWithOwner,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
          mergedAt: n.mergedAt,
          closedAt: n.closedAt,
          state,
          isDraft: n.isDraft,
          ci: mapCi(n.commits.nodes[0]?.commit?.statusCheckRollup?.state),
          review: mapReview(n.reviewDecision),
          labels: n.labels.nodes.map((l) => ({ name: l.name, color: l.color })),
          author: n.author,
          unresolvedThreads,
          approvers,
          changesRequestedBy,
          pendingReviewers,
        };
      })
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

    return { ok: true, items };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    if (e.code === "ENOENT") {
      return {
        ok: false,
        error: {
          kind: "gh_not_found",
          message:
            "`gh` CLI not found on PATH. Install with `winget install GitHub.cli` and authenticate with `gh auth login`.",
        },
      };
    }
    const stderr = (e.stderr ?? e.message ?? "").toString();
    if (/not logged in|authentication/i.test(stderr)) {
      return {
        ok: false,
        error: {
          kind: "gh_not_authenticated",
          message: "`gh` is installed but not authenticated. Run `gh auth login` in a terminal.",
        },
      };
    }
    return {
      ok: false,
      error: {
        kind: "unknown",
        message: stderr || (err instanceof Error ? err.message : String(err)),
      },
    };
  }
}

export function listMyOpenPRs() {
  return searchPRsByQuery(`org:${ORG} is:pr author:@me archived:false sort:updated-desc`);
}

export function searchPRsForTicketKey(ticketKey: string) {
  return searchPRsByQuery(`org:${ORG} is:pr ${ticketKey} archived:false`);
}

import {
  GitPullRequest,
  GitMerge,
  GitBranch,
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  MessageSquare,
  ArrowUpRight,
} from "lucide-react";
import type { PullRequestItem, CiStatus, Reviewer } from "@/lib/api";
import { cn } from "@/lib/utils";

const TICKET_KEY_RE = /[A-Z][A-Z0-9]+-+\d+/g;

export function extractKeys(text: string): string[] {
  const matches = text.match(TICKET_KEY_RE) ?? [];
  return matches.map((m) => m.replace(/-+/g, "-"));
}

export function buildPrIndex(prs: PullRequestItem[]): Map<string, PullRequestItem[]> {
  const index = new Map<string, PullRequestItem[]>();
  for (const pr of prs) {
    const keys = new Set([...extractKeys(pr.title), ...extractKeys(pr.headRefName)]);
    for (const key of keys) {
      const list = index.get(key) ?? [];
      list.push(pr);
      index.set(key, list);
    }
  }
  const rank = (s: PullRequestItem["state"]) => (s === "OPEN" ? 0 : s === "MERGED" ? 1 : 2);
  for (const list of index.values()) {
    list.sort((a, b) => {
      const r = rank(a.state) - rank(b.state);
      if (r !== 0) return r;
      return a.updatedAt < b.updatedAt ? 1 : -1;
    });
  }
  return index;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  return `${mo}mo ago`;
}

export function PrCard({ pr }: { pr: PullRequestItem }) {
  const isMerged = pr.state === "MERGED";
  const isClosed = pr.state === "CLOSED";
  const isOpen = pr.state === "OPEN";

  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noreferrer"
      className="block px-4 py-3 hover:bg-[var(--color-bg-elevated)] transition-colors group border-b border-[var(--color-border-subtle)] last:border-b-0"
    >
      <div className="flex items-start gap-3">
        {isMerged ? (
          <GitMerge className="w-3.5 h-3.5 mt-1 shrink-0" style={{ color: "oklch(0.65 0.18 305)" }} />
        ) : isClosed ? (
          <XCircle className="w-3.5 h-3.5 mt-1 shrink-0 text-[var(--color-fg-dim)]" />
        ) : (
          <GitPullRequest
            className={cn(
              "w-3.5 h-3.5 mt-1 shrink-0",
              pr.isDraft ? "text-[var(--color-fg-dim)]" : "text-[var(--color-success)]"
            )}
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="text-xs font-mono text-[var(--color-fg-muted)] flex items-center gap-2 flex-wrap">
            <span>
              {pr.repo}
              <span className="text-[var(--color-fg-dim)]">#{pr.number}</span>
            </span>
            {isMerged && (
              <span
                className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] font-medium px-1.5 py-0.5 rounded-full border"
                style={{
                  color: "oklch(0.7 0.16 305)",
                  borderColor: "color-mix(in oklch, oklch(0.65 0.18 305) 40%, transparent)",
                  background: "color-mix(in oklch, oklch(0.65 0.18 305) 10%, transparent)",
                }}
              >
                Merged
              </span>
            )}
            {isClosed && (
              <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] font-medium px-1.5 py-0.5 rounded-full border border-[var(--color-border-subtle)] text-[var(--color-fg-dim)]">
                Closed
              </span>
            )}
            {pr.isDraft && isOpen && (
              <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)] border border-[var(--color-border-subtle)] rounded-full px-1.5 py-0.5">
                Draft
              </span>
            )}
          </div>

          {isMerged && (
            <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[11px] text-[var(--color-fg-muted)]">
              <span className="inline-flex items-center gap-1 font-mono">
                <GitBranch className="w-3 h-3 text-[var(--color-fg-dim)]" />
                merged to <span className="text-[var(--color-fg)]">{pr.baseRefName}</span>
                {pr.mergedAt && <span className="text-[var(--color-fg-dim)]">· {timeAgo(pr.mergedAt)}</span>}
              </span>
              {pr.approvers.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-[var(--color-success)]" />
                  <AvatarStack users={pr.approvers} tone="approved" />
                </div>
              )}
            </div>
          )}

          {isClosed && (
            <div className="mt-1.5 text-[11px] text-[var(--color-fg-dim)] font-mono">
              closed without merging
              {pr.closedAt && ` · ${timeAgo(pr.closedAt)}`}
            </div>
          )}

          {isOpen && (
            <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[11px]">
              <span className="inline-flex items-center gap-1 text-[var(--color-fg-muted)] font-mono">
                <GitBranch className="w-3 h-3 text-[var(--color-fg-dim)]" />
                <span className="text-[var(--color-fg-dim)]">→</span>
                <span className="text-[var(--color-fg)]">{pr.baseRefName}</span>
              </span>
              <CiBadge ci={pr.ci} />

              {pr.approvers.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-[var(--color-success)]" />
                  <AvatarStack users={pr.approvers} tone="approved" />
                  <span className="text-[var(--color-fg-muted)] font-mono">approved</span>
                </div>
              )}

              {pr.changesRequestedBy.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <XCircle className="w-3 h-3 text-[var(--color-danger)]" />
                  <AvatarStack users={pr.changesRequestedBy} tone="changes" />
                  <span className="text-[var(--color-fg-muted)] font-mono">changes</span>
                </div>
              )}

              {pr.approvers.length === 0 &&
                pr.changesRequestedBy.length === 0 &&
                pr.pendingReviewers.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 text-[var(--color-fg-dim)]" />
                    <AvatarStack users={pr.pendingReviewers} tone="pending" />
                    <span className="text-[var(--color-fg-dim)] font-mono">waiting</span>
                  </div>
                )}

              {pr.unresolvedThreads > 0 && (
                <span className="inline-flex items-center gap-1 text-[var(--color-accent)] font-mono">
                  <MessageSquare className="w-3 h-3" />
                  {pr.unresolvedThreads} unresolved
                </span>
              )}
            </div>
          )}
        </div>

        <ArrowUpRight className="w-3.5 h-3.5 mt-1 text-[var(--color-fg-dim)] group-hover:text-[var(--color-fg)] transition-colors shrink-0" />
      </div>
    </a>
  );
}

function CiBadge({ ci }: { ci: CiStatus }) {
  const map = {
    success: { Icon: CheckCircle2, color: "var(--color-success)", label: "CI passing" },
    failure: { Icon: XCircle, color: "var(--color-danger)", label: "CI failing" },
    pending: { Icon: Loader2, color: "var(--color-warning)", label: "CI running" },
    none: { Icon: Circle, color: "var(--color-fg-dim)", label: "no checks" },
  } as const;
  const { Icon, color, label } = map[ci];
  return (
    <span className="inline-flex items-center gap-1.5 font-mono" style={{ color }}>
      <Icon className={cn("w-3 h-3", ci === "pending" && "animate-spin")} />
      <span className="text-[11px] uppercase tracking-[0.14em]">{label}</span>
    </span>
  );
}

function AvatarStack({
  users,
  tone,
}: {
  users: Reviewer[] | { login: string; avatarUrl: string }[];
  tone: "approved" | "changes" | "pending";
}) {
  if (users.length === 0) return null;
  const ringColor = {
    approved: "var(--color-success)",
    changes: "var(--color-danger)",
    pending: "var(--color-fg-dim)",
  }[tone];
  return (
    <div className="flex -space-x-1">
      {users.slice(0, 3).map((u) => (
        <img
          key={u.login}
          src={u.avatarUrl}
          alt={u.login}
          title={u.login}
          className="w-4 h-4 rounded-full ring-1 ring-[var(--color-bg)] border"
          style={{ borderColor: ringColor }}
        />
      ))}
      {users.length > 3 && (
        <div
          className="w-4 h-4 rounded-full ring-1 ring-[var(--color-bg)] bg-[var(--color-bg-elevated)] border flex items-center justify-center text-[8px] font-mono"
          style={{ borderColor: ringColor }}
        >
          +{users.length - 3}
        </div>
      )}
    </div>
  );
}

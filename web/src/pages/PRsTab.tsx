import { useQuery } from "@tanstack/react-query";
import {
  GitPullRequest,
  CheckCircle2,
  XCircle,
  Loader2,
  Circle,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  MessageSquare,
} from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchPRs, type PullRequestItem, type CiStatus, type Reviewer, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { cn } from "@/lib/utils";

export function PRsTab() {
  const { data, error, isFetching, isLoading, refetch } = useQuery({
    queryKey: queryKeys.prs,
    queryFn: fetchPRs,
  });

  const items = data?.items?.filter((p) => p.state === "OPEN");
  const apiError = error instanceof ApiError ? error.payload : null;

  const failing = items?.filter((p) => p.ci === "failure").length ?? 0;
  const pending = items?.filter((p) => p.ci === "pending").length ?? 0;
  const drafts = items?.filter((p) => p.isDraft).length ?? 0;
  const unresolved = items?.reduce((sum, p) => sum + p.unresolvedThreads, 0) ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-fg-dim)] font-medium mb-2">
            Pull Requests
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Your open PRs</h1>
          <p className="mt-2 text-[var(--color-fg-muted)]">
            Authored by you, across <span className="text-[var(--color-fg)] font-medium">MaxxtonGroup</span>.
          </p>
        </div>
        <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {items && items.length > 0 && (
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Stat label="Total" value={items.length} tone="default" />
          {failing > 0 && <Stat label="Failing CI" value={failing} tone="danger" />}
          {pending > 0 && <Stat label="CI running" value={pending} tone="warning" />}
          {unresolved > 0 && <Stat label="Unresolved comments" value={unresolved} tone="accent" />}
          {drafts > 0 && <Stat label="Draft" value={drafts} tone="muted" />}
        </div>
      )}

      {apiError && (
        <Card className="mb-6 border-[color-mix(in_oklch,var(--color-danger)_40%,transparent)]">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[var(--color-danger)] shrink-0 mt-0.5" />
            <div>
              <CardTitle className="text-[var(--color-danger)]">
                {apiError.kind === "gh_not_authenticated"
                  ? "GitHub CLI not authenticated"
                  : apiError.kind === "gh_not_found"
                  ? "GitHub CLI not installed"
                  : "Couldn't fetch PRs"}
              </CardTitle>
              <CardDescription className="mt-1">{apiError.message}</CardDescription>
            </div>
          </div>
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-[var(--color-fg-muted)] text-sm">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Asking GitHub…
        </div>
      )}

      {items && items.length === 0 && !apiError && (
        <Card>
          <CardTitle>No open PRs</CardTitle>
          <CardDescription className="mt-1">
            Nothing authored by you is currently open. Either you're caught up, or… time to ship.
          </CardDescription>
        </Card>
      )}

      {items && items.length > 0 && (
        <div className="card-surface divide-y divide-[var(--color-border-subtle)] overflow-hidden">
          {items.map((pr) => (
            <PrRow key={pr.url} pr={pr} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "danger" | "warning" | "muted" | "accent";
}) {
  const toneClass = {
    default: "text-[var(--color-fg)] border-[var(--color-border)]",
    danger:
      "text-[var(--color-danger)] border-[color-mix(in_oklch,var(--color-danger)_45%,transparent)] bg-[color-mix(in_oklch,var(--color-danger)_8%,transparent)]",
    warning:
      "text-[var(--color-warning)] border-[color-mix(in_oklch,var(--color-warning)_45%,transparent)] bg-[color-mix(in_oklch,var(--color-warning)_8%,transparent)]",
    accent:
      "text-[var(--color-accent)] border-[color-mix(in_oklch,var(--color-accent)_45%,transparent)] bg-[color-mix(in_oklch,var(--color-accent)_8%,transparent)]",
    muted: "text-[var(--color-fg-dim)] border-[var(--color-border-subtle)]",
  }[tone];
  return (
    <div className={cn("inline-flex items-center gap-2 px-3 h-7 rounded-full border text-xs", toneClass)}>
      <span className="text-[11px] uppercase tracking-[0.14em]">{label}</span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  );
}

function CiIcon({ ci }: { ci: CiStatus }) {
  const map = {
    success: { Icon: CheckCircle2, color: "var(--color-success)", label: "passing" },
    failure: { Icon: XCircle, color: "var(--color-danger)", label: "failing" },
    pending: { Icon: Loader2, color: "var(--color-warning)", label: "running" },
    none: { Icon: Circle, color: "var(--color-fg-dim)", label: "no checks" },
  } as const;
  const { Icon, color, label } = map[ci];
  return (
    <span title={`CI: ${label}`} className="inline-flex items-center" style={{ color }}>
      <Icon className={cn("w-4 h-4", ci === "pending" && "animate-spin")} />
    </span>
  );
}

function AvatarStack({ users, tone }: { users: Reviewer[] | { login: string; avatarUrl: string }[]; tone: "approved" | "changes" | "pending" }) {
  if (users.length === 0) return null;
  const ringColor = {
    approved: "var(--color-success)",
    changes: "var(--color-danger)",
    pending: "var(--color-fg-dim)",
  }[tone];
  return (
    <div className="flex -space-x-1.5">
      {users.slice(0, 3).map((u) => (
        <img
          key={u.login}
          src={u.avatarUrl}
          alt={u.login}
          title={u.login}
          className="w-5 h-5 rounded-full ring-2 ring-[var(--color-bg)] border"
          style={{ borderColor: ringColor }}
        />
      ))}
      {users.length > 3 && (
        <div
          className="w-5 h-5 rounded-full ring-2 ring-[var(--color-bg)] bg-[var(--color-bg-elevated)] border flex items-center justify-center text-[9px] font-mono"
          style={{ borderColor: ringColor }}
        >
          +{users.length - 3}
        </div>
      )}
    </div>
  );
}

function PrRow({ pr }: { pr: PullRequestItem }) {
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noreferrer"
      className="group block px-5 py-4 hover:bg-[var(--color-bg-elevated)] transition-colors"
    >
      <div className="flex items-start gap-4">
        <GitPullRequest
          className={cn(
            "w-4 h-4 mt-1 shrink-0",
            pr.isDraft ? "text-[var(--color-fg-dim)]" : "text-[var(--color-success)]"
          )}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-medium text-[var(--color-fg)] truncate">{pr.title}</span>
            {pr.isDraft && (
              <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)] border border-[var(--color-border-subtle)] rounded-full px-2 py-0.5">
                Draft
              </span>
            )}
          </div>

          <div className="mt-1.5 flex items-center gap-3 text-xs text-[var(--color-fg-muted)] font-mono flex-wrap">
            <span>
              {pr.repo}
              <span className="text-[var(--color-fg-dim)]">#{pr.number}</span>
            </span>
            <span className="text-[var(--color-fg-dim)]">·</span>
            <span>updated {timeAgo(pr.updatedAt)}</span>
            {pr.unresolvedThreads > 0 && (
              <>
                <span className="text-[var(--color-fg-dim)]">·</span>
                <span
                  className="inline-flex items-center gap-1 text-[var(--color-accent)]"
                  title={`${pr.unresolvedThreads} unresolved review threads`}
                >
                  <MessageSquare className="w-3 h-3" />
                  {pr.unresolvedThreads} unresolved
                </span>
              </>
            )}
          </div>

          <div className="mt-2.5 flex items-center gap-3 flex-wrap">
            {pr.approvers.length > 0 && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-[var(--color-success)]" />
                <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)]">approved by</span>
                <AvatarStack users={pr.approvers} tone="approved" />
                <span className="text-xs text-[var(--color-fg-muted)]">
                  {pr.approvers.slice(0, 2).map((a) => a.login).join(", ")}
                  {pr.approvers.length > 2 && ` +${pr.approvers.length - 2}`}
                </span>
              </div>
            )}
            {pr.changesRequestedBy.length > 0 && (
              <div className="flex items-center gap-1.5">
                <XCircle className="w-3 h-3 text-[var(--color-danger)]" />
                <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)]">changes</span>
                <AvatarStack users={pr.changesRequestedBy} tone="changes" />
              </div>
            )}
            {pr.pendingReviewers.length > 0 && pr.approvers.length === 0 && (
              <div className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 text-[var(--color-fg-dim)]" />
                <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)]">waiting on</span>
                <AvatarStack users={pr.pendingReviewers} tone="pending" />
              </div>
            )}
            {pr.labels.map((l) => (
              <span
                key={l.name}
                className="text-[11px] font-medium px-2 py-0.5 rounded-full border"
                style={{
                  color: `#${l.color}`,
                  borderColor: `color-mix(in oklch, #${l.color} 40%, transparent)`,
                  background: `color-mix(in oklch, #${l.color} 10%, transparent)`,
                }}
              >
                {l.name}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-center">
          <CiIcon ci={pr.ci} />
          <ExternalLink className="w-4 h-4 text-[var(--color-fg-dim)] group-hover:text-[var(--color-fg)] transition-colors" />
        </div>
      </div>
    </a>
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  return `${mo}mo ago`;
}

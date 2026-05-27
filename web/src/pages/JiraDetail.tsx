import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  Ticket,
  AlertCircle,
  Loader2,
  ChevronUp,
  ChevronsUp,
  Minus,
  ChevronDown,
  ChevronsDown,
  MessageSquare,
  GitPullRequest,
  Calendar,
  Tag,
} from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  fetchJiraIssue,
  fetchPRs,
  ApiError,
  type JiraStatusCategory,
  type JiraPriority,
  type JiraComment,
} from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { cn } from "@/lib/utils";
import { PrCard, buildPrIndex } from "@/components/PrCard";
import { Lightbox } from "@/components/Lightbox";
import { statusPillStyle } from "@/lib/statusColors";

function pickFullResUrl(img: HTMLImageElement): string {
  const anchor = img.closest("a");
  const href = anchor?.getAttribute("href");
  if (href && /^https?:/i.test(href)) return href;
  const srcset = img.getAttribute("srcset");
  if (srcset) {
    const last = srcset.split(",").pop()?.trim().split(/\s+/)[0];
    if (last) return last;
  }
  return img.src;
}

export function JiraDetail() {
  const { key } = useParams();
  const issueQuery = useQuery({
    queryKey: ["jira", "issue", key],
    queryFn: () => fetchJiraIssue(key!),
    enabled: !!key,
    staleTime: 60_000,
  });
  const prQuery = useQuery({ queryKey: queryKeys.prs, queryFn: fetchPRs });

  const apiError = issueQuery.error instanceof ApiError ? issueQuery.error.payload : null;
  const issue = issueQuery.data?.issue;
  const prIndex = useMemo(() => buildPrIndex(prQuery.data?.items ?? []), [prQuery.data]);
  const linkedPRs = key ? prIndex.get(key) ?? [] : [];

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  function onContentClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    const img = target.closest("img");
    if (img instanceof HTMLImageElement) {
      e.preventDefault();
      e.stopPropagation();
      setLightboxSrc(pickFullResUrl(img));
    }
  }

  if (issueQuery.isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-10 py-10 flex items-center justify-center text-sm text-[var(--color-fg-muted)]">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading {key}…
      </div>
    );
  }

  if (apiError) {
    return (
      <div className="max-w-3xl mx-auto px-8 py-10">
        <BackLink />
        <Card className="border-[color-mix(in_oklch,var(--color-danger)_40%,transparent)] mt-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[var(--color-danger)] shrink-0 mt-0.5" />
            <div>
              <CardTitle className="text-[var(--color-danger)]">Couldn't load {key}</CardTitle>
              <CardDescription className="mt-1">{apiError.message}</CardDescription>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (!issue) return null;

  return (
    <div className="max-w-6xl mx-auto px-10 py-10">
      <BackLink />

      <section className="mt-6 mb-8">
        <div className="flex items-center gap-2 mb-3 text-xs">
          {issue.issueTypeIconUrl ? (
            <img src={issue.issueTypeIconUrl} alt={issue.issueType} className="w-4 h-4" />
          ) : (
            <Ticket className="w-4 h-4 text-[var(--color-fg-dim)]" />
          )}
          <span className="text-[var(--color-fg-dim)] font-mono">{issue.issueType}</span>
          <span className="text-[var(--color-fg-dim)]">·</span>
          <span className="font-mono text-[var(--color-fg)]">{issue.key}</span>
          <a
            href={issue.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-[var(--color-fg-dim)] hover:text-[var(--color-accent)] transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in Jira
          </a>
        </div>

        <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-balance">
          {issue.summary}
        </h1>

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <StatusPill name={issue.statusName} category={issue.statusCategory} />
          <PriorityChip priority={issue.priority} />
          {issue.labels.length > 0 && (
            <div className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)]">
              <Tag className="w-3 h-3 text-[var(--color-fg-dim)]" />
              {issue.labels.map((l) => (
                <span
                  key={l}
                  className="text-[11px] uppercase tracking-[0.14em] font-medium px-1.5 py-0.5 rounded border border-[var(--color-border-subtle)]"
                >
                  {l}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center gap-5 flex-wrap text-xs text-[var(--color-fg-muted)]">
          <PersonInline label="Assignee" person={issue.assignee} />
          <PersonInline label="Reporter" person={issue.reporter} />
          <div className="inline-flex items-center gap-1.5">
            <Calendar className="w-3 h-3 text-[var(--color-fg-dim)]" />
            <span className="text-[var(--color-fg-dim)]">Created</span>
            <span className="font-mono">{formatDate(issue.created)}</span>
          </div>
          <div className="inline-flex items-center gap-1.5">
            <Calendar className="w-3 h-3 text-[var(--color-fg-dim)]" />
            <span className="text-[var(--color-fg-dim)]">Updated</span>
            <span className="font-mono">{formatDate(issue.updated)}</span>
          </div>
        </div>
      </section>

      <CollapsibleLinkedPRs prs={linkedPRs} />



      <section className="mb-8">
        <SectionHeading title="Description" />
        <Card>
          {issue.descriptionHtml ? (
            <div
              className="adf-content"
              onClick={onContentClick}
              dangerouslySetInnerHTML={{ __html: issue.descriptionHtml }}
            />
          ) : issue.description ? (
            <div className="adf-content whitespace-pre-wrap">{issue.description}</div>
          ) : (
            <div className="text-sm text-[var(--color-fg-dim)] italic">No description.</div>
          )}
        </Card>
      </section>

      <section>
        <SectionHeading icon={MessageSquare} title="Comments" count={issue.comments.length} />
        {issue.comments.length === 0 ? (
          <Card>
            <div className="text-sm text-[var(--color-fg-dim)] italic">No comments yet.</div>
          </Card>
        ) : (
          <div className="space-y-3">
            {issue.comments.map((c) => (
              <CommentBlock key={c.id} comment={c} onImageClick={onContentClick} />
            ))}
          </div>
        )}
      </section>

      <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </div>
  );
}

function CollapsibleLinkedPRs({ prs }: { prs: import("@/lib/api").PullRequestItem[] }) {
  const [open, setOpen] = useState(false);
  const count = prs.length;
  const hasPrs = count > 0;

  return (
    <section className="mb-8">
      <button
        type="button"
        onClick={() => hasPrs && setOpen((v) => !v)}
        disabled={!hasPrs}
        aria-expanded={open}
        className={cn(
          "w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] text-left transition-colors",
          hasPrs && "hover:border-[var(--color-fg-dim)] hover:bg-[var(--color-bg-hover)] cursor-pointer",
          !hasPrs && "cursor-default opacity-80"
        )}
      >
        <GitPullRequest className="w-4 h-4 text-[var(--color-fg-muted)]" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
          Linked PRs
        </span>
        {hasPrs ? (
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[11px] font-mono text-[var(--color-fg)]">
            {count}
          </span>
        ) : (
          <span className="text-[11px] text-[var(--color-fg-dim)] italic">No PR linked yet</span>
        )}
        {hasPrs && (
          <ChevronDown
            className={cn(
              "ml-auto w-4 h-4 text-[var(--color-fg-dim)] transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        )}
      </button>

      {hasPrs && open && (
        <div className="mt-2 card-surface overflow-hidden">
          {prs.map((pr) => (
            <PrCard key={pr.url} pr={pr} />
          ))}
        </div>
      )}
    </section>
  );
}

function BackLink() {
  return (
    <Link
      to="/jira"
      className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
    >
      <ArrowLeft className="w-3.5 h-3.5" /> Back to sprint board
    </Link>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  count,
}: {
  icon?: typeof MessageSquare;
  title: string;
  count?: number;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {Icon && <Icon className="w-4 h-4 text-[var(--color-fg-muted)]" />}
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
        {title}
      </h2>
      {typeof count === "number" && count > 0 && (
        <span className="text-[11px] font-mono text-[var(--color-fg-dim)] tabular-nums">
          {count}
        </span>
      )}
    </div>
  );
}

function PersonInline({
  label,
  person,
}: {
  label: string;
  person: { displayName: string; avatarUrl: string } | null;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-[var(--color-fg-dim)]">{label}</span>
      {person ? (
        <div className="inline-flex items-center gap-1.5">
          {person.avatarUrl && (
            <img src={person.avatarUrl} alt="" className="w-4 h-4 rounded-full" />
          )}
          <span className="text-[var(--color-fg)]">{person.displayName}</span>
        </div>
      ) : (
        <span className="italic text-[var(--color-fg-dim)]">Unassigned</span>
      )}
    </div>
  );
}

function CommentBlock({
  comment,
  onImageClick,
}: {
  comment: JiraComment;
  onImageClick: (e: React.MouseEvent) => void;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2.5 mb-3">
        {comment.author?.avatarUrl ? (
          <img
            src={comment.author.avatarUrl}
            alt={comment.author.displayName}
            className="w-7 h-7 rounded-full"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-[var(--color-bg-elevated)]" />
        )}
        <div className="text-sm flex-1 min-w-0">
          <span className="font-medium text-[var(--color-fg)]">
            {comment.author?.displayName ?? "Unknown"}
          </span>
          <span className="ml-2 text-xs text-[var(--color-fg-dim)] font-mono">
            {formatDate(comment.created)}
            {comment.updated !== comment.created && (
              <span className="ml-1.5 italic">· edited {formatDate(comment.updated)}</span>
            )}
          </span>
        </div>
      </div>
      <div
        className="adf-content"
        onClick={onImageClick}
        dangerouslySetInnerHTML={{ __html: comment.bodyHtml }}
      />
    </Card>
  );
}

function StatusPill({
  name,
  category,
}: {
  name: string;
  category: JiraStatusCategory;
}) {
  return (
    <span
      style={statusPillStyle(name, category)}
      className="text-[11px] uppercase tracking-[0.14em] font-medium px-2.5 py-1 rounded-full border"
    >
      {name}
    </span>
  );
}

function PriorityChip({ priority }: { priority: JiraPriority }) {
  const map: Record<JiraPriority, { Icon: typeof ChevronUp; color: string }> = {
    Highest: { Icon: ChevronsUp, color: "var(--color-danger)" },
    High: { Icon: ChevronUp, color: "var(--color-danger)" },
    Medium: { Icon: Minus, color: "var(--color-warning)" },
    Low: { Icon: ChevronDown, color: "var(--color-fg-dim)" },
    Lowest: { Icon: ChevronsDown, color: "var(--color-fg-dim)" },
    Unknown: { Icon: Minus, color: "var(--color-fg-dim)" },
  };
  const { Icon, color } = map[priority];
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] font-medium px-2 py-1 rounded-full border border-[var(--color-border-subtle)]"
      style={{ color }}
    >
      <Icon className="w-3 h-3" />
      {priority}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400_000);
  if (days < 1) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " today";
  }
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

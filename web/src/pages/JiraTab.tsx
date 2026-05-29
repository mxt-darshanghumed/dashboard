import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { LayoutGroup, motion } from "framer-motion";
import {
  Ticket,
  ArrowUpRight,
  AlertCircle,
  RefreshCw,
  Loader2,
  ChevronUp,
  ChevronsUp,
  Minus,
  ChevronDown,
  ChevronsDown,
  GitPullRequest,
  Search,
  X,
  ChevronRight,
  Filter,
} from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  fetchJiraIssues,
  fetchPRs,
  searchJiraIssues,
  ApiError,
  type JiraIssueItem,
  type JiraPriority,
  type JiraStatusCategory,
  type PullRequestItem,
} from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { cn } from "@/lib/utils";
import { PrCard, buildPrIndex } from "@/components/PrCard";
import { TicketNote } from "@/components/TicketNote";
import { ProgressSection } from "@/components/ProgressSection";
import {
  statusCardBackground,
  statusPillStyle,
  statusChipActiveStyle,
} from "@/lib/statusColors";

type PrFilter = "all" | "with" | "without" | "failing";

export function JiraTab() {
  const jiraQuery = useQuery({ queryKey: queryKeys.jira, queryFn: fetchJiraIssues });
  const prQuery = useQuery({ queryKey: queryKeys.prs, queryFn: fetchPRs });

  const items = jiraQuery.data?.items;
  const prs = prQuery.data?.items ?? [];
  const apiError = jiraQuery.error instanceof ApiError ? jiraQuery.error.payload : null;
  const isFetching = jiraQuery.isFetching || prQuery.isFetching;
  const isLoading = jiraQuery.isLoading;

  const prIndex = useMemo(() => buildPrIndex(prs), [prs]);

  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [prFilter, setPrFilter] = useState<PrFilter>("all");

  // The same search also queries Jira globally so the user can find tickets
  // outside their sprint (e.g. assigned to colleagues).
  const [globalResults, setGlobalResults] = useState<JiraIssueItem[] | null>(null);
  const [globalSearching, setGlobalSearching] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    if (!search.trim()) {
      setGlobalResults(null);
      setGlobalError(null);
      return;
    }
    let cancelled = false;
    setGlobalSearching(true);
    setGlobalError(null);
    const handle = setTimeout(async () => {
      try {
        const r = await searchJiraIssues(search);
        if (!cancelled) setGlobalResults(r.items);
      } catch (err) {
        if (!cancelled) {
          setGlobalError(err instanceof ApiError ? err.payload.message : (err as Error).message);
          setGlobalResults([]);
        }
      } finally {
        if (!cancelled) setGlobalSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [search]);

  // Sprint ticket keys so we can dedupe global results
  const sprintKeys = useMemo(
    () => new Set((items ?? []).map((i) => i.key)),
    [items]
  );
  const globalOnlyResults = useMemo(
    () => (globalResults ?? []).filter((r) => !sprintKeys.has(r.key)),
    [globalResults, sprintKeys]
  );

  const allStatuses = useMemo(() => {
    const m = new Map<string, { name: string; category: JiraStatusCategory; count: number }>();
    for (const i of items ?? []) {
      const existing = m.get(i.statusName);
      if (existing) existing.count += 1;
      else m.set(i.statusName, { name: i.statusName, category: i.statusCategory, count: 1 });
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [items]);

  const hasChipFilters = statusFilters.size > 0 || prFilter !== "all";

  const filtered = useMemo(() => {
    let afterSearch = items ?? [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      afterSearch = afterSearch.filter(
        (i) => i.key.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q)
      );
    }

    const matchesChips = (i: JiraIssueItem) => {
      if (statusFilters.size > 0 && !statusFilters.has(i.statusName)) return false;
      if (prFilter !== "all") {
        const linked = prIndex.get(i.key) ?? [];
        if (prFilter === "with" && linked.length === 0) return false;
        if (prFilter === "without" && linked.length > 0) return false;
        if (prFilter === "failing" && !linked.some((pr) => pr.ci === "failure")) return false;
      }
      return true;
    };

    if (!hasChipFilters) {
      return { matching: afterSearch, demoted: [] as JiraIssueItem[] };
    }
    return {
      matching: afterSearch.filter(matchesChips),
      demoted: afterSearch.filter((i) => !matchesChips(i)),
    };
  }, [items, search, statusFilters, prFilter, prIndex, hasChipFilters]);

  const [showDemoted, setShowDemoted] = useState(true);
  const totalShown = filtered.matching.length + filtered.demoted.length;

  function toggleStatus(name: string) {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function clearFilters() {
    setSearch("");
    setStatusFilters(new Set());
    setPrFilter("all");
  }

  const hasActiveFilters = search.trim().length > 0 || statusFilters.size > 0 || prFilter !== "all";

  async function refreshBoth() {
    await Promise.all([jiraQuery.refetch(), prQuery.refetch()]);
  }

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-fg-dim)] font-medium mb-2">
            Sprint Board
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Current sprint</h1>
          <p className="mt-2 text-[var(--color-fg-muted)]">
            Tickets assigned to you in the active sprint, with linked PRs.
          </p>
        </div>
        <Button variant="secondary" onClick={refreshBoth} disabled={isFetching}>
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {apiError && (
        <Card className="mb-6 border-[color-mix(in_oklch,var(--color-danger)_40%,transparent)]">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[var(--color-danger)] shrink-0 mt-0.5" />
            <div>
              <CardTitle className="text-[var(--color-danger)]">
                Couldn't fetch Jira issues
              </CardTitle>
              <CardDescription className="mt-1">{apiError.message}</CardDescription>
            </div>
          </div>
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-[var(--color-fg-muted)] text-sm">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Asking Jira…
        </div>
      )}

      {items && items.length > 0 && (
        <>
          <div className="mb-3 flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-fg-dim)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sprint + any ticket (MXTS-12345 or text)…"
                className="w-full h-9 pl-9 pr-12 bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] rounded-[var(--radius-md)] text-sm placeholder:text-[var(--color-fg-dim)] focus:outline-none focus:border-[var(--color-fg-dim)] transition-colors"
              />
              {globalSearching && (
                <Loader2 className="absolute right-9 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-[var(--color-fg-dim)]" />
              )}
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-hover)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="text-xs text-[var(--color-fg-dim)] font-mono">
              {hasChipFilters
                ? `${filtered.matching.length} matching · ${items.length} total`
                : `${totalShown} / ${items.length}`}
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>

          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)] font-medium mr-1">
              Status
            </span>
            {allStatuses.map((s) => (
              <FilterChip
                key={s.name}
                active={statusFilters.has(s.name)}
                onClick={() => toggleStatus(s.name)}
                tone={statusTone(s.category)}
                activeStyle={statusChipActiveStyle(s.name, s.category)}
              >
                {s.name}
                <span className="ml-1.5 font-mono opacity-60">{s.count}</span>
              </FilterChip>
            ))}
          </div>

          <div className="mb-6 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)] font-medium mr-1">
              PR
            </span>
            <FilterChip active={prFilter === "all"} onClick={() => setPrFilter("all")}>
              All
            </FilterChip>
            <FilterChip
              active={prFilter === "with"}
              onClick={() => setPrFilter(prFilter === "with" ? "all" : "with")}
              tone="success"
            >
              <GitPullRequest className="w-3 h-3" />
              Has PR
            </FilterChip>
            <FilterChip
              active={prFilter === "without"}
              onClick={() => setPrFilter(prFilter === "without" ? "all" : "without")}
              tone="muted"
            >
              No PR
            </FilterChip>
            <FilterChip
              active={prFilter === "failing"}
              onClick={() => setPrFilter(prFilter === "failing" ? "all" : "failing")}
              tone="danger"
            >
              Failing CI
            </FilterChip>
          </div>
        </>
      )}

      {items && items.length === 0 && !apiError && (
        <Card>
          <CardTitle>No active sprint tickets</CardTitle>
          <CardDescription className="mt-1">
            Either there's no open sprint or none are assigned to you. Set <code>JIRA_JQL=...</code> in <code>.env</code> to override.
          </CardDescription>
        </Card>
      )}

      {items && items.length > 0 && totalShown === 0 && (
        <Card>
          <CardDescription>No tickets match — try widening the search.</CardDescription>
        </Card>
      )}

      {hasChipFilters && filtered.matching.length === 0 && filtered.demoted.length > 0 && (
        <Card className="mb-4">
          <CardDescription>
            No tickets match your current filters. Showing {filtered.demoted.length} sorted below.
          </CardDescription>
        </Card>
      )}

      {(filtered.matching.length > 0 || filtered.demoted.length > 0) && (
        <LayoutGroup>
          <div className="columns-1 lg:columns-2 gap-3">
            {filtered.matching.map((issue) => (
              <AnimatedTile key={issue.key} issueKey={issue.key}>
                <TicketCard issue={issue} linkedPRs={prIndex.get(issue.key) ?? []} />
              </AnimatedTile>
            ))}

            {hasChipFilters && filtered.demoted.length > 0 && (
              <motion.div
                layout
                key="__demoted-divider__"
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                style={{ columnSpan: "all", WebkitColumnSpan: "all" } as React.CSSProperties}
                className="break-inside-avoid"
              >
                <DemotedDivider
                  count={filtered.demoted.length}
                  open={showDemoted}
                  onToggle={() => setShowDemoted((v) => !v)}
                />
              </motion.div>
            )}

            {hasChipFilters &&
              showDemoted &&
              filtered.demoted.map((issue) => (
                <AnimatedTile key={issue.key} issueKey={issue.key} dimmed>
                  <TicketCard issue={issue} linkedPRs={prIndex.get(issue.key) ?? []} />
                </AnimatedTile>
              ))}
          </div>
        </LayoutGroup>
      )}

      {globalOnlyResults.length > 0 && (
        <section className="mt-10">
          <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)] font-medium mb-3 flex items-center gap-2">
            <Search className="w-3 h-3" />
            <span>From Jira · outside your sprint</span>
            <span className="font-mono normal-case tracking-normal">{globalOnlyResults.length}</span>
          </div>
          <div className="card-surface divide-y divide-[var(--color-border-subtle)] overflow-hidden">
            {globalOnlyResults.map((issue) => (
              <SearchResultRow key={issue.key} issue={issue} />
            ))}
          </div>
        </section>
      )}

      {globalError && search.trim() && (
        <div className="mt-6 px-3 py-2 rounded-[var(--radius-md)] border border-[color-mix(in_oklch,var(--color-danger)_35%,transparent)] bg-[color-mix(in_oklch,var(--color-danger)_8%,transparent)] text-xs text-[var(--color-danger)]">
          Global search failed: {globalError}
        </div>
      )}
    </div>
  );
}

function SearchResultRow({ issue }: { issue: JiraIssueItem }) {
  return (
    <Link
      to={`/jira/${issue.key}`}
      className="block px-4 py-2.5 hover:bg-[var(--color-bg-elevated)] transition-colors group"
    >
      <div className="flex items-start gap-3">
        {issue.issueTypeIconUrl ? (
          <img src={issue.issueTypeIconUrl} alt="" className="w-4 h-4 mt-0.5 shrink-0" />
        ) : (
          <Ticket className="w-4 h-4 mt-0.5 shrink-0 text-[var(--color-fg-dim)]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-[11px] text-[var(--color-fg-dim)]">{issue.key}</span>
            <span className="text-sm text-[var(--color-fg)] truncate">{issue.summary}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] flex-wrap">
            <StatusPill name={issue.statusName} category={issue.statusCategory} />
            {issue.assignee ? (
              <span className="inline-flex items-center gap-1 text-[var(--color-fg-muted)]">
                {issue.assignee.avatarUrl && (
                  <img src={issue.assignee.avatarUrl} alt="" className="w-3.5 h-3.5 rounded-full" />
                )}
                <span>{issue.assignee.displayName}</span>
              </span>
            ) : (
              <span className="text-[var(--color-fg-dim)] italic">unassigned</span>
            )}
            <span className="text-[var(--color-fg-dim)] font-mono">· {searchTimeAgo(issue.updated)}</span>
          </div>
        </div>
        <ArrowUpRight className="w-3.5 h-3.5 mt-1 text-[var(--color-fg-dim)] group-hover:text-[var(--color-fg)] transition-colors shrink-0" />
      </div>
    </Link>
  );
}

function searchTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.round(d / 30)}mo ago`;
}

function AnimatedTile({
  issueKey,
  dimmed,
  children,
}: {
  issueKey: string;
  dimmed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      layout
      layoutId={`ticket-${issueKey}`}
      initial={false}
      animate={{ opacity: dimmed ? 0.55 : 1 }}
      transition={{
        layout: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.25, ease: "easeOut" },
      }}
      className="mb-3 break-inside-avoid"
    >
      {children}
    </motion.div>
  );
}

function DemotedDivider({
  count,
  open,
  onToggle,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="my-6 w-full flex items-center gap-3 group cursor-pointer"
      aria-expanded={open}
    >
      <div className="h-px flex-1 bg-[var(--color-border-subtle)] group-hover:bg-[var(--color-border)] transition-colors" />
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] group-hover:border-[var(--color-fg-dim)] transition-colors">
        <Filter className="w-3 h-3 text-[var(--color-fg-dim)]" />
        <span className="text-[11px] uppercase tracking-[0.14em] font-medium text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg)] transition-colors">
          Outside filters
        </span>
        <span className="text-[11px] font-mono font-semibold text-[var(--color-fg-dim)]">
          {count}
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-[var(--color-fg-dim)] group-hover:text-[var(--color-fg-muted)] transition-transform duration-200",
            !open && "-rotate-90"
          )}
        />
      </div>
      <div className="h-px flex-1 bg-[var(--color-border-subtle)] group-hover:bg-[var(--color-border)] transition-colors" />
    </button>
  );
}

function statusTone(category: JiraStatusCategory): FilterTone {
  if (category === "indeterminate") return "accent";
  if (category === "done") return "success";
  return "muted";
}

type FilterTone = "default" | "accent" | "success" | "danger" | "muted";

function FilterChip({
  active,
  onClick,
  children,
  tone = "default",
  activeStyle,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: FilterTone;
  activeStyle?: React.CSSProperties;
}) {
  const baseStatic = "border-[var(--color-border-subtle)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-elevated)]";
  const activeMap: Record<FilterTone, string> = {
    default: "border-[var(--color-fg-dim)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)]",
    accent:
      "border-[color-mix(in_oklch,var(--color-accent)_50%,transparent)] bg-[color-mix(in_oklch,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]",
    success:
      "border-[color-mix(in_oklch,var(--color-success)_50%,transparent)] bg-[color-mix(in_oklch,var(--color-success)_12%,transparent)] text-[var(--color-success)]",
    danger:
      "border-[color-mix(in_oklch,var(--color-danger)_50%,transparent)] bg-[color-mix(in_oklch,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]",
    muted: "border-[var(--color-fg-dim)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)]",
  };
  const useInline = active && activeStyle;
  return (
    <button
      type="button"
      onClick={onClick}
      style={useInline ? activeStyle : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11px] font-medium transition-colors cursor-pointer",
        useInline ? "" : active ? activeMap[tone] : baseStatic
      )}
    >
      {children}
    </button>
  );
}

function TicketCard({ issue, linkedPRs }: { issue: JiraIssueItem; linkedPRs: PullRequestItem[] }) {
  const [showClosed, setShowClosed] = useState(false);
  const visiblePRs = linkedPRs.filter((p) => p.state !== "CLOSED");
  const closedPRs = linkedPRs.filter((p) => p.state === "CLOSED");
  const prsToRender = showClosed ? [...visiblePRs, ...closedPRs] : visiblePRs;

  return (
    <div
      className="card-surface overflow-hidden hover:border-[var(--color-fg-dim)] transition-colors"
      style={{ background: statusCardBackground(issue.statusName, issue.statusCategory) }}
    >
      <TicketNote ticketKey={issue.key} />
      <Link
        to={`/jira/${issue.key}`}
        className="group block px-4 py-3.5 hover:bg-[color-mix(in_oklch,var(--color-fg)_5%,transparent)] transition-colors"
      >
        <div className="flex items-start gap-3">
          {issue.issueTypeIconUrl ? (
            <img
              src={issue.issueTypeIconUrl}
              alt={issue.issueType}
              title={issue.issueType}
              className="w-4 h-4 mt-1 shrink-0"
            />
          ) : (
            <Ticket className="w-4 h-4 mt-1 shrink-0 text-[var(--color-fg-dim)]" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[11px] text-[var(--color-fg-dim)]">{issue.key}</span>
              <span className="font-medium text-[var(--color-fg)] truncate text-sm">
                {issue.summary}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-2 text-xs text-[var(--color-fg-muted)] flex-wrap">
              <StatusPill name={issue.statusName} category={issue.statusCategory} />
              <span className="inline-flex items-center gap-1 text-[var(--color-fg-dim)] font-mono">
                <PriorityIcon priority={issue.priority} />
                <span className="text-[11px] uppercase tracking-[0.14em]">{issue.priority}</span>
              </span>
            </div>
          </div>

          <ArrowUpRight className="w-4 h-4 mt-1 text-[var(--color-fg-dim)] group-hover:text-[var(--color-fg)] transition-colors shrink-0" />
        </div>
      </Link>

      <ProgressSection
        ticketKey={issue.key}
        statusName={issue.statusName}
        statusCategory={issue.statusCategory}
      />

      <div className="bg-[color-mix(in_oklch,var(--color-bg)_60%,transparent)]">
        {linkedPRs.length === 0 ? (
          <div className="px-4 py-3 flex items-center gap-2 text-xs text-[var(--color-fg-dim)]">
            <GitPullRequest className="w-3.5 h-3.5" />
            <span>No PR linked yet</span>
          </div>
        ) : (
          <>
            {prsToRender.length === 0 && (
              <div className="px-4 py-3 flex items-center gap-2 text-xs text-[var(--color-fg-dim)]">
                <GitPullRequest className="w-3.5 h-3.5" />
                <span>Only closed PRs — none active</span>
              </div>
            )}
            {prsToRender.map((pr) => (
              <PrCard key={pr.url} pr={pr} />
            ))}
            {closedPRs.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowClosed((v) => !v);
                }}
                className="w-full px-4 py-2 flex items-center justify-center gap-1.5 text-[11px] font-medium text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-elevated)] transition-colors border-t border-[var(--color-border-subtle)]"
              >
                <ChevronRight
                  className={cn(
                    "w-3 h-3 transition-transform duration-150",
                    showClosed && "rotate-90"
                  )}
                />
                {showClosed
                  ? `Hide ${closedPRs.length} closed`
                  : `Show ${closedPRs.length} closed`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PriorityIcon({ priority }: { priority: JiraPriority }) {
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
    <span title={`Priority: ${priority}`} className="inline-flex items-center" style={{ color }}>
      <Icon className="w-3.5 h-3.5" />
    </span>
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
      className="text-[11px] uppercase tracking-[0.14em] font-medium px-2 py-0.5 rounded-full border"
    >
      {name}
    </span>
  );
}

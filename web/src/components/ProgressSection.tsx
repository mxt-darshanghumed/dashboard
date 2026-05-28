import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Loader2, RefreshCw, ChevronDown, AlertCircle } from "lucide-react";
import { fetchTicketProgress, ApiError } from "@/lib/api";
import { statusHue } from "@/lib/statusColors";
import type { JiraStatusCategory } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  ticketKey: string;
  statusName: string;
  statusCategory: JiraStatusCategory;
}

export function ProgressSection({ ticketKey, statusName, statusCategory }: Props) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const query = useQuery({
    queryKey: ["progress", ticketKey],
    queryFn: () => fetchTicketProgress(ticketKey),
    enabled: false,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const data = query.data?.progress;
  const apiError = query.error instanceof ApiError ? query.error.payload : null;
  const errorMessage = apiError?.message ?? (query.error ? String(query.error) : null);
  const hue = statusHue(statusName, statusCategory);

  async function analyze(forceRefresh = false) {
    if (forceRefresh) {
      await qc.fetchQuery({
        queryKey: ["progress", ticketKey],
        queryFn: () => fetchTicketProgress(ticketKey, { refresh: true }),
        staleTime: 0,
      });
    } else {
      await query.refetch();
    }
  }

  // No data yet — show the Analyze button (full width)
  if (!data && !query.isFetching && !errorMessage) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          analyze();
        }}
        className="w-full px-4 py-2.5 text-left flex items-center gap-2 text-[11px] font-medium text-[var(--color-fg-dim)] hover:text-[var(--color-accent)] hover:bg-[color-mix(in_oklch,var(--color-accent)_5%,transparent)] border-t border-[var(--color-border-subtle)] transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Check progress with Claude
      </button>
    );
  }

  // Loading, first run
  if (query.isFetching && !data) {
    return (
      <div className="px-4 py-2.5 flex items-center gap-2 text-[11px] text-[var(--color-fg-muted)] border-t border-[var(--color-border-subtle)]">
        <Sparkles className="w-3.5 h-3.5 text-[var(--color-accent)]" />
        <span>Analyzing progress…</span>
        <Loader2 className="w-3 h-3 animate-spin ml-auto text-[var(--color-fg-dim)]" />
      </div>
    );
  }

  // Error state
  if (errorMessage && !data) {
    return (
      <div className="px-4 py-2.5 flex items-start gap-2 text-[11px] border-t border-[var(--color-border-subtle)]">
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--color-danger)]" />
        <div className="flex-1 min-w-0">
          <span className="text-[var(--color-danger)] block">{errorMessage}</span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              analyze();
            }}
            className="mt-1 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="border-t border-[var(--color-border-subtle)]">
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setExpanded((v) => !v);
          }
        }}
        className="w-full px-4 pt-2.5 pb-2 text-left hover:bg-[color-mix(in_oklch,var(--color-fg)_4%,transparent)] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="w-3 h-3" style={{ color: `oklch(0.86 0.15 ${hue})` }} />
          <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[var(--color-fg-muted)]">
            Progress
          </span>
          <span
            className="text-[11px] font-mono font-semibold ml-auto"
            style={{ color: `oklch(0.92 0.14 ${hue})` }}
          >
            {data.percent}%
          </span>
          <button
            type="button"
            title="Re-analyze"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              analyze(true);
            }}
            disabled={query.isFetching}
            className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded text-[var(--color-fg-dim)] hover:text-[var(--color-accent)] hover:bg-[color-mix(in_oklch,var(--color-accent)_10%,transparent)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3 h-3", query.isFetching && "animate-spin")} />
          </button>
          <ChevronDown
            className={cn(
              "w-3 h-3 text-[var(--color-fg-dim)] transition-transform duration-200",
              expanded && "rotate-180"
            )}
          />
        </div>

        <div className="relative h-1.5 rounded-full bg-[var(--color-bg)] overflow-hidden border border-[var(--color-border-subtle)]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${data.percent}%` }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full"
            style={{
              background: `linear-gradient(90deg, oklch(0.6 0.15 ${hue}), oklch(0.78 0.18 ${hue}))`,
              boxShadow: `0 0 12px -2px oklch(0.7 0.18 ${hue} / 0.5)`,
            }}
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-1.5">
              <div className="text-[12px] text-[var(--color-fg)] mb-3 leading-snug">
                {data.summary}
              </div>

              <ReasoningBlock label="Code" hue={hue} text={data.codeReasoning} />
              <ReasoningBlock label="Process" hue={hue} text={data.processReasoning} />

              {data.signals.length > 0 && (
                <ul className="space-y-1 mt-3 mb-2">
                  {data.signals.map((s, i) => (
                    <li
                      key={i}
                      className="text-[11px] text-[var(--color-fg-muted)] flex items-start gap-1.5"
                    >
                      <span
                        className="mt-1.5 w-1 h-1 rounded-full shrink-0"
                        style={{ background: `oklch(0.7 0.16 ${hue})` }}
                      />
                      {s}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-fg-dim)] font-mono">
                <span>analyzed {timeAgo(data.analyzedAt)}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReasoningBlock({ label, hue, text }: { label: string; hue: number; text: string }) {
  if (!text) return null;
  return (
    <div className="mb-2">
      <div
        className="text-[9px] uppercase tracking-[0.16em] font-semibold mb-1"
        style={{ color: `oklch(0.86 0.15 ${hue})` }}
      >
        {label}
      </div>
      <div className="text-[11px] text-[var(--color-fg-muted)] leading-snug">{text}</div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

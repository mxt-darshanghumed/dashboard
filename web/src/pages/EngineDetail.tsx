import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Bot,
  MessageSquare,
  Trash2,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  fetchEngine,
  fetchSessions,
  createSession,
  deleteSession,
  type Engine,
  type SessionSummary,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export function EngineDetail() {
  const { engineId } = useParams();
  const navigate = useNavigate();
  const [engine, setEngine] = useState<Engine | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!engineId) return;
    try {
      const [e, s] = await Promise.all([fetchEngine(engineId), fetchSessions(engineId)]);
      setEngine(e);
      setSessions(s);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [engineId]);

  async function startNew() {
    if (!engineId) return;
    setCreating(true);
    try {
      const s = await createSession(engineId);
      navigate(`/engine/${engineId}/session/${s.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    await deleteSession(id);
    refresh();
  }

  if (!engine) {
    return (
      <div className="max-w-5xl mx-auto px-8 py-10 text-[var(--color-fg-muted)]">
        {error ?? "Loading…"}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] mb-5"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to engines
      </Link>

      <div className="flex items-end justify-between mb-8 gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5 text-[var(--color-accent)]" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">{engine.name}</h1>
          </div>
          <p className="text-[var(--color-fg-muted)] max-w-2xl">{engine.description}</p>
        </div>
        <Button onClick={startNew} disabled={creating || !engine.available}>
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          New session
        </Button>
      </div>

      {error && (
        <Card className="mb-4 border-[color-mix(in_oklch,var(--color-danger)_40%,transparent)]">
          <CardDescription className="text-[var(--color-danger)]">{error}</CardDescription>
        </Card>
      )}

      <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)] font-medium mb-3">
        Sessions {sessions.length > 0 && <span className="font-mono ml-1">{sessions.length}</span>}
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardTitle>No sessions yet</CardTitle>
          <CardDescription className="mt-1">
            Click <span className="font-medium">New session</span> to start chatting with {engine.name}.
          </CardDescription>
        </Card>
      ) : (
        <div className="card-surface divide-y divide-[var(--color-border-subtle)] overflow-hidden">
          {sessions.map((s) => (
            <SessionRow key={s.id} engineId={engine.id} session={s} onDelete={() => remove(s.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionRow({
  engineId,
  session,
  onDelete,
}: {
  engineId: string;
  session: SessionSummary;
  onDelete: () => void;
}) {
  return (
    <Link
      to={`/engine/${engineId}/session/${session.id}`}
      className="group block px-4 py-3 hover:bg-[var(--color-bg-elevated)] transition-colors"
    >
      <div className="flex items-start gap-3">
        <MessageSquare className="w-4 h-4 mt-1 shrink-0 text-[var(--color-fg-muted)]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-[var(--color-fg)] truncate text-sm">
              {session.title || "Untitled"}
            </span>
            {session.busy && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] font-medium text-[var(--color-accent)] border border-[color-mix(in_oklch,var(--color-accent)_40%,transparent)] bg-[color-mix(in_oklch,var(--color-accent)_8%,transparent)] rounded-full px-1.5 py-0.5">
                <Loader2 className="w-2.5 h-2.5 animate-spin" /> running
              </span>
            )}
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] font-medium font-mono",
                session.connected ? "text-[var(--color-success)]" : "text-[var(--color-fg-dim)]"
              )}
            >
              {session.connected ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
              {session.connected ? "live" : "idle"}
            </span>
          </div>
          {session.firstUserMessage && (
            <div className="mt-1 text-xs text-[var(--color-fg-muted)] line-clamp-1">
              {session.firstUserMessage}
            </div>
          )}
          <div className="mt-1.5 text-[11px] text-[var(--color-fg-dim)] font-mono">
            updated {timeAgo(session.lastActivityAt)}
          </div>
        </div>
        <button
          type="button"
          title="Delete session"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--color-fg-dim)] hover:text-[var(--color-danger)] p-1 rounded"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </Link>
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

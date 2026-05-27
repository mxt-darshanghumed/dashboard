import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Bot, Play, Loader2, Send, AlertCircle, Wrench, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchAgent, openRunSocket, type AgentConfig, type RunEvent } from "@/lib/api";

interface RunLog {
  events: RunEvent[];
  status: "idle" | "running" | "done" | "error";
}

export function AgentDetail() {
  const { id } = useParams();
  const [agent, setAgent] = useState<AgentConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [run, setRun] = useState<RunLog>({ events: [], status: "idle" });
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchAgent(id)
      .then(setAgent)
      .catch((e) => setLoadError(e.message));
    return () => wsRef.current?.close();
  }, [id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [run.events.length]);

  function startRun() {
    if (!id) return;
    setRun({ events: [], status: "running" });
    const ws = openRunSocket((evt) => {
      setRun((prev) => {
        const events = [...prev.events, evt];
        let status: RunLog["status"] = prev.status;
        if (evt.type === "done") status = "done";
        if (evt.type === "error") status = "error";
        return { events, status };
      });
    });
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "run", agentId: id, prompt }));
    };
  }

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto px-8 py-10">
        <Card>
          <div className="flex items-center gap-2 text-[var(--color-danger)]">
            <AlertCircle className="w-4 h-4" />
            <span>{loadError}</span>
          </div>
        </Card>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="max-w-3xl mx-auto px-8 py-10 text-[var(--color-fg-muted)]">Loading…</div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to dashboard
      </Link>

      <div className="flex items-start gap-4 mb-8">
        <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5 text-[var(--color-accent)]" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{agent.name}</h1>
          <p className="mt-1 text-[var(--color-fg-muted)] text-sm">{agent.description}</p>
        </div>
      </div>

      <Card className="mb-4">
        <label className="text-xs uppercase tracking-[0.14em] text-[var(--color-fg-dim)] font-medium">
          Message
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Say something to your agent…"
          rows={3}
          className="mt-2 w-full bg-transparent text-sm resize-none focus:outline-none placeholder:text-[var(--color-fg-dim)]"
        />
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-[var(--color-fg-dim)]">
            Streams over WebSocket from the local Agent SDK runner.
          </div>
          <Button onClick={startRun} disabled={run.status === "running"}>
            {run.status === "running" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Running
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Run
              </>
            )}
          </Button>
        </div>
      </Card>

      <div
        ref={scrollRef}
        className="card-surface p-5 min-h-[260px] max-h-[60vh] overflow-y-auto space-y-3"
      >
        {run.status === "idle" && (
          <div className="text-sm text-[var(--color-fg-dim)] flex items-center gap-2">
            <Play className="w-3.5 h-3.5" />
            Output appears here when you hit Run.
          </div>
        )}
        {run.events.map((evt, i) => (
          <EventRow key={i} evt={evt} />
        ))}
        {run.status === "done" && (
          <div className="pt-3 border-t border-[var(--color-border-subtle)] flex items-center gap-2 text-xs text-[var(--color-success)]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Done.
          </div>
        )}
      </div>
    </div>
  );
}

function EventRow({ evt }: { evt: RunEvent }) {
  if (evt.type === "started") {
    return (
      <div className="text-xs uppercase tracking-[0.14em] text-[var(--color-fg-dim)]">
        ▸ Started
      </div>
    );
  }
  if (evt.type === "text") {
    return (
      <div className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--color-fg)]">
        {evt.text}
      </div>
    );
  }
  if (evt.type === "tool_use") {
    return (
      <div className="text-xs flex items-start gap-2 p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)]">
        <Wrench className="w-3.5 h-3.5 mt-0.5 text-[var(--color-accent)] shrink-0" />
        <div>
          <div className="font-mono text-[var(--color-fg)]">{evt.name}</div>
          <pre className="mt-1 font-mono text-[11px] text-[var(--color-fg-muted)] whitespace-pre-wrap break-all">
            {JSON.stringify(evt.input, null, 2)}
          </pre>
        </div>
      </div>
    );
  }
  if (evt.type === "tool_result") {
    return (
      <div className="text-xs p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)]">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)] mb-1">
          tool result
        </div>
        <pre className="font-mono text-[11px] text-[var(--color-fg-muted)] whitespace-pre-wrap break-all">
          {typeof evt.output === "string" ? evt.output : JSON.stringify(evt.output, null, 2)}
        </pre>
      </div>
    );
  }
  if (evt.type === "error") {
    return (
      <div className="text-sm flex items-start gap-2 text-[var(--color-danger)]">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>{evt.error}</span>
      </div>
    );
  }
  return null;
}

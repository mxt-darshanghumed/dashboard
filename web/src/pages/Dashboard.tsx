import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowUpRight, Bot, ZapOff } from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { fetchEngines, type Engine } from "@/lib/api";
import { cn } from "@/lib/utils";

export function Dashboard() {
  const [engines, setEngines] = useState<Engine[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEngines()
      .then(setEngines)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-fg-dim)] font-medium mb-2">
          Dashboard
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">Engines</h1>
        <p className="mt-2 text-[var(--color-fg-muted)] max-w-xl text-balance">
          Each engine is an LLM provider you can chat with. Click one to see all running sessions or start a new one.
        </p>
      </div>

      {error && (
        <Card className="mb-6 border-[color-mix(in_oklch,var(--color-danger)_40%,transparent)]">
          <CardTitle className="text-[var(--color-danger)]">Backend unreachable</CardTitle>
          <CardDescription className="mt-1">{error}</CardDescription>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {engines.map((engine) => (
          <EngineCard key={engine.id} engine={engine} />
        ))}
        {engines.length === 0 && !error && (
          <Card>
            <CardDescription>Loading engines…</CardDescription>
          </Card>
        )}
      </div>
    </div>
  );
}

function EngineCard({ engine }: { engine: Engine }) {
  const inner = (
    <Card
      className={cn(
        "h-full transition-colors",
        engine.available
          ? "hover:border-[var(--color-fg-dim)] group-hover:ring-accent-soft"
          : "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center border",
              engine.available
                ? "bg-[var(--color-bg-elevated)] border-[var(--color-border-subtle)]"
                : "bg-[var(--color-bg)] border-[var(--color-border-subtle)]"
            )}
          >
            {engine.available ? (
              <Bot className="w-4 h-4 text-[var(--color-accent)]" />
            ) : (
              <ZapOff className="w-4 h-4 text-[var(--color-fg-dim)]" />
            )}
          </div>
          <CardTitle>{engine.name}</CardTitle>
        </div>
        {engine.available ? (
          <ArrowUpRight className="w-4 h-4 text-[var(--color-fg-dim)] group-hover:text-[var(--color-fg)] transition-colors" />
        ) : (
          <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)] border border-[var(--color-border-subtle)] rounded-full px-2 py-0.5">
            Soon
          </span>
        )}
      </div>
      <CardDescription>{engine.description}</CardDescription>
      <div className="mt-4 flex items-center gap-2 text-xs text-[var(--color-fg-dim)]">
        <Sparkles className="w-3 h-3" />
        <span>{engine.available ? "Click to see sessions" : "Engine not connected yet"}</span>
      </div>
    </Card>
  );

  if (!engine.available) {
    return <div className="cursor-not-allowed">{inner}</div>;
  }
  return (
    <Link to={`/engine/${engine.id}`} className="group">
      {inner}
    </Link>
  );
}

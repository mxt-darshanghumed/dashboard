import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Play, ArrowUpRight } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchAgents, type AgentConfig } from "@/lib/api";

export function Dashboard() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents()
      .then(setAgents)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-fg-dim)] font-medium mb-2">
            Dashboard
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            Your agents
          </h1>
          <p className="mt-2 text-[var(--color-fg-muted)] max-w-xl text-balance">
            Personal Claude agents for whatever you need to automate. Pick one to run, or create a new one.
          </p>
        </div>
        <Link to="/new-agent">
          <Button variant="primary">
            <Bot className="w-4 h-4" />
            New agent
          </Button>
        </Link>
      </div>

      {error && (
        <Card className="mb-6 border-[color-mix(in_oklch,var(--color-danger)_40%,transparent)]">
          <CardTitle className="text-[var(--color-danger)]">Backend unreachable</CardTitle>
          <CardDescription className="mt-1">{error}</CardDescription>
          <CardDescription className="mt-2 font-mono text-xs">
            Is the server running on :3001? Try <code>npm run dev</code> at the repo root.
          </CardDescription>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <Link key={agent.id} to={`/agent/${agent.id}`} className="group">
            <Card className="h-full hover:border-[var(--color-fg-dim)] transition-colors group-hover:ring-accent-soft">
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] flex items-center justify-center">
                    <Bot className="w-4 h-4 text-[var(--color-accent)]" />
                  </div>
                  <CardTitle>{agent.name}</CardTitle>
                </div>
                <ArrowUpRight className="w-4 h-4 text-[var(--color-fg-dim)] group-hover:text-[var(--color-fg)] transition-colors" />
              </CardHeader>
              <CardDescription>{agent.description}</CardDescription>
              <div className="mt-4 flex items-center gap-2 text-xs text-[var(--color-fg-dim)]">
                <Play className="w-3 h-3" />
                <span>Click to run</span>
              </div>
            </Card>
          </Link>
        ))}

        {agents.length === 0 && !error && (
          <Card>
            <CardDescription>Loading agents…</CardDescription>
          </Card>
        )}
      </div>
    </div>
  );
}

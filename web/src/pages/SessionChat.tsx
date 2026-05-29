import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Loader2,
  Send,
  AlertCircle,
  Wrench,
  RotateCcw,
  User,
  Shield,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { openSessionSocket, type RunEvent } from "@/lib/api";
import { cn } from "@/lib/utils";

type AssistantBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: unknown; id?: string }
  | { type: "tool_result"; output: unknown }
  | { type: "permission_request"; id: string; toolName: string; input: unknown; status: "pending" | "allowed" | "denied" }
  | { type: "error"; text: string };

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text?: string;
  blocks?: AssistantBlock[];
  streaming?: boolean;
}

export function SessionChat() {
  const { engineId, sessionId } = useParams();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [reconnectKey, setReconnectKey] = useState(0);
  useEffect(() => {
    if (!sessionId) return;
    const ws = openSessionSocket(sessionId, handleEvent);
    ws.addEventListener("open", () => setConnected(true));
    ws.addEventListener("close", () => setConnected(false));
    ws.addEventListener("error", () => setConnected(false));
    wsRef.current = ws;
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, reconnectKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  }, [input]);

  function handleEvent(evt: RunEvent) {
    if (evt.type === "session_open" || evt.type === "reset_ack" || evt.type === "started") return;

    if (evt.type === "done") {
      setHasSession(true);
      setStreaming(false);
      setTurns((prev) => markLastAssistantDone(prev));
      return;
    }

    if (evt.type === "error") {
      setStreaming(false);
      setTurns((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant" && last.streaming) {
          return appendToLastAssistant(prev, { type: "error", text: evt.error });
        }
        return prev;
      });
      return;
    }

    if (evt.type === "text") {
      setTurns((prev) => appendToLastAssistant(prev, { type: "text", text: evt.text }));
      return;
    }

    if (evt.type === "tool_use") {
      setTurns((prev) =>
        appendToLastAssistant(prev, {
          type: "tool_use",
          name: evt.name,
          input: evt.input,
          id: evt.id,
        })
      );
      return;
    }

    if (evt.type === "tool_result") {
      setTurns((prev) => appendToLastAssistant(prev, { type: "tool_result", output: evt.output }));
      return;
    }

    if (evt.type === "permission_request") {
      setTurns((prev) =>
        appendToLastAssistant(prev, {
          type: "permission_request",
          id: evt.id,
          toolName: evt.toolName,
          input: evt.input,
          status: "pending",
        })
      );
      return;
    }
  }

  function respondToPermission(id: string, behavior: "allow" | "deny") {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify({ type: "permission_response", id, behavior }));
    setTurns((prev) =>
      prev.map((t) => {
        if (t.role !== "assistant" || !t.blocks) return t;
        return {
          ...t,
          blocks: t.blocks.map((b) =>
            b.type === "permission_request" && b.id === id
              ? { ...b, status: behavior === "allow" ? "allowed" : "denied" }
              : b
          ),
        };
      })
    );
  }

  function send() {
    const text = input.trim();
    if (!text || streaming || !sessionId || !wsRef.current) return;
    const ws = wsRef.current;
    if (ws.readyState !== ws.OPEN) return;

    const userTurn: ChatTurn = { id: nanoid(), role: "user", text };
    const assistantTurn: ChatTurn = {
      id: nanoid(),
      role: "assistant",
      blocks: [],
      streaming: true,
    };
    setTurns((prev) => [...prev, userTurn, assistantTurn]);
    setInput("");
    setStreaming(true);
    ws.send(JSON.stringify({ type: "run", prompt: text }));
  }

  function resetConversation() {
    if (streaming) return;
    setTurns([]);
    setHasSession(false);
    wsRef.current?.send(JSON.stringify({ type: "reset" }));
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-8 h-screen flex flex-col">
      <Link
        to={`/engine/${engineId}`}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] mb-5 shrink-0"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to {engineId} sessions
      </Link>

      <div className="flex items-start gap-4 mb-6 shrink-0">
        <div className="w-11 h-11 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5 text-[var(--color-accent)]" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight capitalize">{engineId} session</h1>
          <p className="mt-1 text-[var(--color-fg-muted)] text-xs font-mono">{sessionId}</p>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-[11px] font-mono",
              connected ? "text-[var(--color-success)]" : "text-[var(--color-fg-dim)]"
            )}
          >
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                connected ? "bg-[var(--color-success)]" : "bg-[var(--color-fg-dim)]"
              )}
            />
            {connected ? "connected" : "disconnected"}
          </span>
          {hasSession && (
            <button
              type="button"
              onClick={resetConversation}
              disabled={streaming}
              title="Reset conversation"
              className="inline-flex items-center gap-1 px-2 h-7 rounded-full border border-[var(--color-border-subtle)] hover:border-[var(--color-fg-dim)] text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {!connected && (
        <div className="mb-3 px-4 py-2.5 rounded-[var(--radius-md)] border border-[color-mix(in_oklch,var(--color-danger)_35%,transparent)] bg-[color-mix(in_oklch,var(--color-danger)_8%,transparent)] flex items-center gap-2.5 text-xs text-[var(--color-danger)] shrink-0">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">Disconnected from server.</span>
          <button
            type="button"
            onClick={() => setReconnectKey((k) => k + 1)}
            className="inline-flex items-center gap-1 px-2 h-6 rounded border border-[color-mix(in_oklch,var(--color-danger)_40%,transparent)] hover:bg-[color-mix(in_oklch,var(--color-danger)_15%,transparent)] font-mono text-[10px] uppercase tracking-[0.14em]"
          >
            Reconnect
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto card-surface p-5 mb-3 space-y-4">
        {turns.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-[var(--color-fg-muted)] py-12">
            <div className="w-12 h-12 rounded-full bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] flex items-center justify-center mb-3">
              <Bot className="w-5 h-5 text-[var(--color-accent)]" />
            </div>
            <div className="text-sm font-medium text-[var(--color-fg)]">Start chatting.</div>
            <div className="text-xs mt-1.5 max-w-xs">
              The agent will ask before running any risky tool (Bash, Edit, MCP). Approve or deny inline.
            </div>
          </div>
        )}

        {turns.map((turn) =>
          turn.role === "user" ? (
            <UserBubble key={turn.id} text={turn.text ?? ""} />
          ) : (
            <AssistantBubble
              key={turn.id}
              blocks={turn.blocks ?? []}
              streaming={turn.streaming ?? false}
              onPermission={respondToPermission}
            />
          )
        )}
      </div>

      <div className="card-surface px-3 py-2 flex items-end gap-2 shrink-0">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={streaming ? "Waiting for response…" : "Message…"}
          rows={1}
          disabled={streaming || !connected}
          className="flex-1 bg-transparent text-sm resize-none min-h-[36px] max-h-[180px] py-1.5 focus:outline-none placeholder:text-[var(--color-fg-dim)] disabled:opacity-60"
        />
        <Button onClick={send} disabled={!input.trim() || streaming || !connected} size="icon">
          {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
      <div className="mt-1.5 text-[10px] text-[var(--color-fg-dim)] font-mono shrink-0">
        Enter to send · Shift+Enter for newline
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end gap-2">
      <div className="max-w-[80%] rounded-[var(--radius-md)] rounded-tr-sm px-3.5 py-2 bg-[color-mix(in_oklch,var(--color-accent)_22%,var(--color-bg-elevated))] border border-[color-mix(in_oklch,var(--color-accent)_35%,transparent)] text-sm text-[var(--color-fg)] whitespace-pre-wrap">
        {text}
      </div>
      <div className="w-7 h-7 rounded-full bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] flex items-center justify-center shrink-0 mt-0.5">
        <User className="w-3.5 h-3.5 text-[var(--color-fg-muted)]" />
      </div>
    </div>
  );
}

function AssistantBubble({
  blocks,
  streaming,
  onPermission,
}: {
  blocks: AssistantBlock[];
  streaming: boolean;
  onPermission: (id: string, behavior: "allow" | "deny") => void;
}) {
  return (
    <div className="flex gap-2">
      <div className="w-7 h-7 rounded-full bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-3.5 h-3.5 text-[var(--color-accent)]" />
      </div>
      <div className="max-w-[85%] space-y-2">
        {blocks.length === 0 && streaming && <ThinkingDots />}

        {blocks.map((block, i) => {
          if (block.type === "text") {
            return (
              <div
                key={i}
                className="rounded-[var(--radius-md)] rounded-tl-sm px-3.5 py-2 bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-fg)] whitespace-pre-wrap leading-relaxed"
              >
                {block.text}
              </div>
            );
          }
          if (block.type === "tool_use") {
            return <ToolUseCard key={i} name={block.name} input={block.input} />;
          }
          if (block.type === "tool_result") {
            return <ToolResultCard key={i} output={block.output} />;
          }
          if (block.type === "permission_request") {
            return (
              <PermissionCard
                key={i}
                id={block.id}
                toolName={block.toolName}
                input={block.input}
                status={block.status}
                onPermission={onPermission}
              />
            );
          }
          if (block.type === "error") {
            return (
              <div
                key={i}
                className="rounded-[var(--radius-md)] px-3 py-2 bg-[color-mix(in_oklch,var(--color-danger)_5%,transparent)] border border-[color-mix(in_oklch,var(--color-danger)_30%,transparent)] text-sm text-[var(--color-danger)] flex items-start gap-2"
              >
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{block.text}</span>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="text-xs text-[var(--color-fg-dim)] italic flex items-center gap-1.5 py-1">
      <span className="inline-flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-[var(--color-fg-dim)] animate-pulse" />
        <span className="w-1 h-1 rounded-full bg-[var(--color-fg-dim)] animate-pulse [animation-delay:200ms]" />
        <span className="w-1 h-1 rounded-full bg-[var(--color-fg-dim)] animate-pulse [animation-delay:400ms]" />
      </span>
      thinking
    </div>
  );
}

function ToolUseCard({ name, input }: { name: string; input: unknown }) {
  return (
    <div className="rounded-[var(--radius-md)] px-3 py-2 bg-[color-mix(in_oklch,var(--color-accent)_5%,var(--color-bg-elevated))] border border-[color-mix(in_oklch,var(--color-accent)_25%,transparent)] text-xs">
      <div className="flex items-center gap-1.5 mb-1">
        <Wrench className="w-3 h-3 text-[var(--color-accent)]" />
        <span className="font-mono font-semibold text-[var(--color-fg)]">{name}</span>
      </div>
      <pre className="font-mono text-[10.5px] text-[var(--color-fg-muted)] whitespace-pre-wrap break-all">
        {JSON.stringify(input, null, 2)}
      </pre>
    </div>
  );
}

function ToolResultCard({ output }: { output: unknown }) {
  const text = typeof output === "string" ? output : JSON.stringify(output, null, 2);
  return (
    <div className="rounded-[var(--radius-md)] px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border-subtle)] text-xs">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)] mb-1">
        tool result
      </div>
      <pre className="font-mono text-[10.5px] text-[var(--color-fg-muted)] whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
        {text}
      </pre>
    </div>
  );
}

function PermissionCard({
  id,
  toolName,
  input,
  status,
  onPermission,
}: {
  id: string;
  toolName: string;
  input: unknown;
  status: "pending" | "allowed" | "denied";
  onPermission: (id: string, behavior: "allow" | "deny") => void;
}) {
  const tone =
    status === "allowed"
      ? "border-[color-mix(in_oklch,var(--color-success)_40%,transparent)] bg-[color-mix(in_oklch,var(--color-success)_8%,transparent)]"
      : status === "denied"
      ? "border-[color-mix(in_oklch,var(--color-danger)_40%,transparent)] bg-[color-mix(in_oklch,var(--color-danger)_8%,transparent)]"
      : "border-[color-mix(in_oklch,var(--color-warning)_45%,transparent)] bg-[color-mix(in_oklch,var(--color-warning)_8%,transparent)]";

  return (
    <div className={cn("rounded-[var(--radius-md)] px-3 py-2.5 border", tone)}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Shield className="w-3.5 h-3.5" style={{ color: "var(--color-warning)" }} />
        <span className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--color-warning)]">
          Permission needed
        </span>
        <span className="ml-auto text-[11px] font-mono text-[var(--color-fg)]">{toolName}</span>
      </div>
      <pre className="font-mono text-[10.5px] text-[var(--color-fg-muted)] whitespace-pre-wrap break-all mb-2 max-h-40 overflow-y-auto">
        {JSON.stringify(input, null, 2)}
      </pre>
      {status === "pending" ? (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="primary" onClick={() => onPermission(id, "allow")}>
            <Check className="w-3.5 h-3.5" />
            Allow
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onPermission(id, "deny")}>
            <X className="w-3.5 h-3.5" />
            Deny
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            "text-[11px] font-mono uppercase tracking-[0.14em]",
            status === "allowed" ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"
          )}
        >
          {status === "allowed" ? "Allowed" : "Denied"}
        </div>
      )}
    </div>
  );
}

function appendToLastAssistant(turns: ChatTurn[], block: AssistantBlock): ChatTurn[] {
  const last = turns[turns.length - 1];
  if (!last || last.role !== "assistant") {
    return [...turns, { id: nanoid(), role: "assistant", blocks: [block], streaming: true }];
  }
  const blocks = [...(last.blocks ?? [])];
  if (block.type === "text") {
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock?.type === "text") {
      blocks[blocks.length - 1] = { type: "text", text: lastBlock.text + block.text };
    } else {
      blocks.push(block);
    }
  } else {
    blocks.push(block);
  }
  return [...turns.slice(0, -1), { ...last, blocks }];
}

function markLastAssistantDone(turns: ChatTurn[]): ChatTurn[] {
  const last = turns[turns.length - 1];
  if (!last || last.role !== "assistant") return turns;
  return [...turns.slice(0, -1), { ...last, streaming: false }];
}

function nanoid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

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
  Reply,
  Pencil,
  CornerUpLeft,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Wand2,
  Undo2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import {
  openSessionSocket,
  fetchSessionMessages,
  renameSession,
  countTokens,
  compressPrompt,
  fetchCompressStatus,
  type RunEvent,
  type StoredAssistantBlock,
  type StoredMessage,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type AssistantBlock = StoredAssistantBlock | { type: "permission_pending"; id: string; toolName: string; input: unknown };

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  ts?: string;
  text?: string;
  replyTo?: { id: string; preview: string };
  blocks?: AssistantBlock[];
  streaming?: boolean;
}

export function SessionChat() {
  const { engineId, sessionId } = useParams();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; preview: string } | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [title, setTitle] = useState<string>("");
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const [reconnectKey, setReconnectKey] = useState(0);

  // Token counter + compression
  const [tokenCount, setTokenCount] = useState(0);
  const [compressing, setCompressing] = useState<"rules" | "smart" | null>(null);
  const [lastCompression, setLastCompression] = useState<{
    original: string;
    compressed: string;
    originalTokens: number;
    compressedTokens: number;
    percent: number;
    notes?: string;
  } | null>(null);
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);

  // Live token count (debounced)
  useEffect(() => {
    if (!input) {
      setTokenCount(0);
      return;
    }
    const handle = setTimeout(() => {
      countTokens(input).then(setTokenCount).catch(() => {});
    }, 250);
    return () => clearTimeout(handle);
  }, [input]);

  useEffect(() => {
    fetchCompressStatus()
      .then((s) => setOllamaAvailable(s.ollama.available))
      .catch(() => setOllamaAvailable(false));
  }, []);

  async function runCompress(mode: "rules" | "smart") {
    if (!input.trim() || compressing) return;
    setCompressing(mode);
    try {
      const result = await compressPrompt(input, mode);
      setLastCompression({
        original: result.original,
        compressed: result.compressed,
        originalTokens: result.originalTokens,
        compressedTokens: result.compressedTokens,
        percent: result.percent,
        notes: result.notes,
      });
      setInput(result.compressed);
    } catch {
      /* show no-op */
    } finally {
      setCompressing(null);
    }
  }

  function undoCompression() {
    if (!lastCompression) return;
    setInput(lastCompression.original);
    setLastCompression(null);
  }

  useEffect(() => {
    if (!sessionId) return;
    fetchSessionMessages(sessionId)
      .then((messages) => {
        // Don't clobber if WS already populated turns (history event won the race).
        setTurns((prev) => (prev.length > 0 ? prev : messages.map(messageToTurn)));
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryLoaded(true));
  }, [sessionId]);

  // Mark this session as "seen up to now" whenever the chat is open and turns
  // change — this drives the "ready" indicator on the engine page.
  useEffect(() => {
    if (!sessionId) return;
    try {
      localStorage.setItem(`cockpit:lastSeen:${sessionId}`, new Date().toISOString());
    } catch {
      /* ignore quota */
    }
  }, [sessionId, turns]);

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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }, [input]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  function handleEvent(evt: RunEvent) {
    if (evt.type === "session_open") return;

    if (evt.type === "history") {
      // Server sent the canonical history; let it win if we hadn't loaded yet
      setTurns((prev) => {
        if (prev.length === 0) return evt.messages.map(messageToTurn);
        return prev;
      });
      setHistoryLoaded(true);
      return;
    }

    if (evt.type === "in_progress") {
      // Reconnecting to a mid-run session: append the partial assistant turn so
      // subsequent streaming events flow in naturally.
      setTurns((prev) => [
        ...prev,
        {
          id: nanoid(),
          role: "assistant",
          blocks: evt.blocks as AssistantBlock[],
          streaming: true,
          ts: new Date().toISOString(),
        },
      ]);
      setStreaming(true);
      return;
    }

    if (evt.type === "user_recorded") return; // already added optimistically
    if (evt.type === "assistant_recorded") {
      setTurns((prev) => {
        const last = prev[prev.length - 1];
        // Replace the last assistant turn with the canonical server version.
        // The previous `done` event has already flipped streaming off; that's
        // expected here. Replacing avoids duplicating the message.
        if (last?.role === "assistant") {
          return [...prev.slice(0, -1), messageToTurn(evt.message)];
        }
        return [...prev, messageToTurn(evt.message)];
      });
      return;
    }

    if (evt.type === "reset_ack") {
      setTurns([]);
      return;
    }

    if (evt.type === "started") return;

    if (evt.type === "done") {
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
          type: "permission_pending",
          id: evt.id,
          toolName: evt.toolName,
          input: evt.input,
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
          blocks: t.blocks.map((b) => {
            if ("type" in b && b.type === "permission_pending" && b.id === id) {
              return {
                type: "permission_request" as const,
                id: b.id,
                toolName: b.toolName,
                input: b.input,
                status: behavior === "allow" ? ("allowed" as const) : ("denied" as const),
              };
            }
            return b;
          }),
        };
      })
    );
  }

  function send() {
    const text = input.trim();
    if (!text || streaming || !sessionId || !wsRef.current) return;
    const ws = wsRef.current;
    if (ws.readyState !== ws.OPEN) return;

    const userTurn: ChatTurn = {
      id: nanoid(),
      role: "user",
      text,
      ts: new Date().toISOString(),
      replyTo: replyTo ?? undefined,
    };
    const assistantTurn: ChatTurn = {
      id: nanoid(),
      role: "assistant",
      blocks: [],
      streaming: true,
      ts: new Date().toISOString(),
    };
    setTurns((prev) => [...prev, userTurn, assistantTurn]);
    setInput("");
    setStreaming(true);
    ws.send(
      JSON.stringify({
        type: "run",
        prompt: text,
        ...(replyTo ? { replyTo } : {}),
      })
    );
    setReplyTo(null);
  }

  function clearChat() {
    if (streaming) return;
    setTurns([]);
    wsRef.current?.send(JSON.stringify({ type: "reset" }));
  }

  async function saveTitle() {
    if (!sessionId) return;
    const next = titleDraft.trim();
    if (!next) {
      setEditingTitle(false);
      return;
    }
    try {
      const s = await renameSession(sessionId, next);
      setTitle(s.title);
    } catch {
      /* ignore */
    } finally {
      setEditingTitle(false);
    }
  }

  function startReplyTo(turn: ChatTurn) {
    const preview = previewOfTurn(turn);
    if (!preview) return;
    setReplyTo({ id: turn.id, preview });
    textareaRef.current?.focus();
  }

  return (
    <div className="h-screen flex flex-col w-full">
      <header className="px-8 py-4 border-b border-[var(--color-border-subtle)] flex items-center gap-4 shrink-0">
        <Link
          to={`/engine/${engineId}`}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Sessions
        </Link>
        <div className="w-px h-5 bg-[var(--color-border-subtle)]" />
        <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-[var(--color-accent)]" />
        </div>
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveTitle();
                }
                if (e.key === "Escape") setEditingTitle(false);
              }}
              className="bg-transparent border-b border-[var(--color-fg-dim)] text-base font-semibold focus:outline-none focus:border-[var(--color-accent)] w-full"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setTitleDraft(title || "");
                setEditingTitle(true);
              }}
              className="group inline-flex items-center gap-2 text-left"
            >
              <span className="text-base font-semibold tracking-tight truncate">
                {title || titleFallback(turns) || "New chat"}
              </span>
              <Pencil className="w-3 h-3 text-[var(--color-fg-dim)] opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
          <div className="text-[10px] text-[var(--color-fg-dim)] font-mono mt-0.5 truncate">
            {engineId} · {sessionId}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
          {turns.length > 0 && (
            <button
              type="button"
              onClick={clearChat}
              disabled={streaming}
              title="Reset conversation (clears history)"
              className="inline-flex items-center gap-1 px-2 h-7 rounded-full border border-[var(--color-border-subtle)] hover:border-[var(--color-fg-dim)] text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      </header>

      {!connected && (
        <div className="mx-8 mt-3 px-4 py-2.5 rounded-[var(--radius-md)] border border-[color-mix(in_oklch,var(--color-danger)_35%,transparent)] bg-[color-mix(in_oklch,var(--color-danger)_8%,transparent)] flex items-center gap-2.5 text-xs text-[var(--color-danger)] shrink-0">
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-6 space-y-5">
          {historyLoaded && turns.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center text-[var(--color-fg-muted)] py-20">
              <div className="w-12 h-12 rounded-full bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] flex items-center justify-center mb-3">
                <Bot className="w-5 h-5 text-[var(--color-accent)]" />
              </div>
              <div className="text-sm font-medium text-[var(--color-fg)]">Start chatting.</div>
              <div className="text-xs mt-1.5 max-w-sm">
                Code-changing tools (Edit / Write) prompt for permission. Everything else runs straight through.
              </div>
            </div>
          )}

          {turns.map((turn) =>
            turn.role === "user" ? (
              <UserBubble
                key={turn.id}
                turn={turn}
                onReply={() => startReplyTo(turn)}
              />
            ) : (
              <AssistantBubble
                key={turn.id}
                turn={turn}
                onPermission={respondToPermission}
                onReply={() => startReplyTo(turn)}
              />
            )
          )}
        </div>
      </div>

      <div className="px-8 pb-5 pt-2 shrink-0">
        <div className="max-w-5xl mx-auto">
          {replyTo && (
            <div className="mb-2 flex items-start gap-2 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] text-xs">
              <CornerUpLeft className="w-3.5 h-3.5 text-[var(--color-fg-dim)] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0 text-[var(--color-fg-muted)] italic line-clamp-2">
                {replyTo.preview}
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="card-surface px-3 py-2 flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (lastCompression && e.target.value !== lastCompression.compressed) {
                  setLastCompression(null);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={streaming ? "Waiting for response…" : "Message…"}
              rows={1}
              disabled={streaming || !connected}
              className="flex-1 bg-transparent text-sm resize-none min-h-[36px] max-h-[220px] py-1.5 focus:outline-none placeholder:text-[var(--color-fg-dim)] disabled:opacity-60"
            />
            <Button onClick={send} disabled={!input.trim() || streaming || !connected} size="icon">
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>

          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[var(--color-fg-dim)] font-mono flex-wrap">
            <span>Enter to send · Shift+Enter newline · Hover msg to reply</span>
            <span className="ml-auto inline-flex items-center gap-1">
              <span className="text-[var(--color-fg-muted)]">~{tokenCount}</span>
              <span>tokens</span>
            </span>
            {input.trim() && (
              <>
                <button
                  type="button"
                  onClick={() => runCompress("rules")}
                  disabled={!!compressing}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--color-border-subtle)] hover:border-[var(--color-fg-dim)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors disabled:opacity-50"
                  title="Strip fillers, collapse whitespace (instant, offline)"
                >
                  {compressing === "rules" ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-2.5 h-2.5" />
                  )}
                  Rules
                </button>
                <button
                  type="button"
                  onClick={() => runCompress("smart")}
                  disabled={!!compressing || ollamaAvailable === false}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--color-border-subtle)] hover:border-[var(--color-accent)] text-[var(--color-fg-muted)] hover:text-[var(--color-accent)] transition-colors disabled:opacity-40"
                  title={
                    ollamaAvailable === false
                      ? "Smart compress requires Ollama running locally. Install with: winget install Ollama.Ollama, then: ollama pull qwen2.5:1.5b"
                      : "Rewrite via local LLM (Ollama)"
                  }
                >
                  {compressing === "smart" ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-2.5 h-2.5" />
                  )}
                  Smart
                </button>
              </>
            )}
            {lastCompression && (
              <button
                type="button"
                onClick={undoCompression}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--color-border-subtle)] hover:border-[var(--color-fg-dim)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
              >
                <Undo2 className="w-2.5 h-2.5" />
                Undo
              </button>
            )}
          </div>

          {lastCompression && (
            <div className="mt-1 text-[10px] font-mono flex items-center gap-2 flex-wrap">
              <span className="text-[var(--color-fg-dim)]">compressed</span>
              <span className="text-[var(--color-fg-muted)]">
                {lastCompression.originalTokens} → {lastCompression.compressedTokens}
              </span>
              <span
                className={cn(
                  "font-semibold",
                  lastCompression.percent > 0
                    ? "text-[var(--color-success)]"
                    : "text-[var(--color-fg-dim)]"
                )}
              >
                {lastCompression.percent > 0 ? `-${lastCompression.percent}%` : "no savings"}
              </span>
              {lastCompression.notes && (
                <span className="text-[var(--color-warning)] italic">
                  {lastCompression.notes}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UserBubble({ turn, onReply }: { turn: ChatTurn; onReply: () => void }) {
  return (
    <div className="flex justify-end gap-2.5 group">
      <button
        type="button"
        onClick={onReply}
        className="opacity-0 group-hover:opacity-100 transition-opacity self-center text-[var(--color-fg-dim)] hover:text-[var(--color-accent)] p-1"
        title="Reply to this message"
      >
        <Reply className="w-3.5 h-3.5" />
      </button>
      <div className="max-w-[70%]">
        {turn.replyTo && (
          <div className="mb-1 px-3 py-1.5 rounded-[var(--radius-md)] border-l-2 border-[var(--color-fg-dim)] bg-[var(--color-bg-elevated)] text-[11px] text-[var(--color-fg-muted)] italic line-clamp-2">
            {turn.replyTo.preview}
          </div>
        )}
        <div className="rounded-[var(--radius-md)] rounded-tr-sm px-4 py-2.5 bg-[color-mix(in_oklch,var(--color-accent)_22%,var(--color-bg-elevated))] border border-[color-mix(in_oklch,var(--color-accent)_35%,transparent)] text-sm text-[var(--color-fg)] whitespace-pre-wrap leading-relaxed">
          {turn.text}
        </div>
        {turn.ts && (
          <div className="mt-1 text-[10px] font-mono text-[var(--color-fg-dim)] text-right">
            {formatTime(turn.ts)}
          </div>
        )}
      </div>
      <div className="w-8 h-8 rounded-full bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] flex items-center justify-center shrink-0 mt-0.5">
        <User className="w-4 h-4 text-[var(--color-fg-muted)]" />
      </div>
    </div>
  );
}

function AssistantBubble({
  turn,
  onPermission,
  onReply,
}: {
  turn: ChatTurn;
  onPermission: (id: string, behavior: "allow" | "deny") => void;
  onReply: () => void;
}) {
  const blocks = turn.blocks ?? [];
  return (
    <div className="flex gap-2.5 group">
      <div className="w-8 h-8 rounded-full bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-4 h-4 text-[var(--color-accent)]" />
      </div>
      <div className="flex-1 min-w-0 max-w-[85%] space-y-2">
        {blocks.length === 0 && turn.streaming && <ThinkingDots />}
        {blocks.map((block, i) => (
          <BlockRenderer key={i} block={block} onPermission={onPermission} />
        ))}
        {turn.ts && !turn.streaming && blocks.length > 0 && (
          <div className="mt-1 text-[10px] font-mono text-[var(--color-fg-dim)]">
            {formatTime(turn.ts)}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onReply}
        className="opacity-0 group-hover:opacity-100 transition-opacity self-center text-[var(--color-fg-dim)] hover:text-[var(--color-accent)] p-1"
        title="Reply to this message"
      >
        <Reply className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function BlockRenderer({
  block,
  onPermission,
}: {
  block: AssistantBlock;
  onPermission: (id: string, behavior: "allow" | "deny") => void;
}) {
  if (block.type === "text") {
    return (
      <div className="rounded-[var(--radius-md)] rounded-tl-sm px-4 py-2.5 bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)]">
        <div className="chat-md">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown>
        </div>
      </div>
    );
  }
  if (block.type === "tool_use") return <ToolUseCard name={block.name} input={block.input} />;
  if (block.type === "tool_result") return <ToolResultCard output={block.output} />;
  if (block.type === "permission_pending") {
    return (
      <PermissionCard
        id={block.id}
        toolName={block.toolName}
        input={block.input}
        status="pending"
        onPermission={onPermission}
      />
    );
  }
  if (block.type === "permission_request") {
    return (
      <PermissionCard
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
      <div className="rounded-[var(--radius-md)] px-3 py-2 bg-[color-mix(in_oklch,var(--color-danger)_5%,transparent)] border border-[color-mix(in_oklch,var(--color-danger)_30%,transparent)] text-sm text-[var(--color-danger)] flex items-start gap-2">
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>{block.text}</span>
      </div>
    );
  }
  return null;
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
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[var(--radius-md)] bg-[color-mix(in_oklch,var(--color-accent)_5%,var(--color-bg-elevated))] border border-[color-mix(in_oklch,var(--color-accent)_25%,transparent)] text-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-[color-mix(in_oklch,var(--color-accent)_10%,transparent)] transition-colors"
      >
        <Wrench className="w-3 h-3 text-[var(--color-accent)]" />
        <span className="font-mono font-semibold text-[var(--color-fg)]">{name}</span>
        {open ? (
          <ChevronDown className="w-3 h-3 text-[var(--color-fg-dim)] ml-auto" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[var(--color-fg-dim)] ml-auto" />
        )}
      </button>
      {open && (
        <pre className="px-3 pb-2 font-mono text-[10.5px] text-[var(--color-fg-muted)] whitespace-pre-wrap break-all">
          {JSON.stringify(input, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ToolResultCard({ output }: { output: unknown }) {
  const [open, setOpen] = useState(false);
  const text = typeof output === "string" ? output : JSON.stringify(output, null, 2);
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-bg)] border border-[var(--color-border-subtle)] text-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-[var(--color-bg-elevated)] transition-colors"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)]">
          tool result
        </span>
        {open ? (
          <ChevronDown className="w-3 h-3 text-[var(--color-fg-dim)] ml-auto" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[var(--color-fg-dim)] ml-auto" />
        )}
      </button>
      {open && (
        <pre className="px-3 pb-2 font-mono text-[10.5px] text-[var(--color-fg-muted)] whitespace-pre-wrap break-all max-h-72 overflow-y-auto">
          {text}
        </pre>
      )}
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

function messageToTurn(m: StoredMessage): ChatTurn {
  if (m.role === "user") {
    return {
      id: m.id,
      role: "user",
      ts: m.ts,
      text: m.text,
      replyTo: m.replyTo,
    };
  }
  return {
    id: m.id,
    role: "assistant",
    ts: m.ts,
    blocks: m.blocks ?? [],
    streaming: false,
  };
}

function previewOfTurn(turn: ChatTurn): string {
  if (turn.role === "user") return (turn.text ?? "").slice(0, 200);
  const textBlock = (turn.blocks ?? []).find((b) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  if (textBlock) return textBlock.text.slice(0, 200);
  return "";
}

function titleFallback(turns: ChatTurn[]): string | undefined {
  const firstUser = turns.find((t) => t.role === "user");
  return firstUser?.text?.slice(0, 60);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function nanoid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

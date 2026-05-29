import type { WebSocket } from "ws";
import {
  loadAllSessions,
  persistSession,
  deleteSessionFile,
  type StoredSession,
  type StoredMessage,
  type StoredAssistantBlock,
} from "./storage.js";

export type AssistantBlock = StoredAssistantBlock;
export type Message = StoredMessage;

export interface Session extends StoredSession {
  ws?: WebSocket;
  busy: boolean;
  /** Debounce timer for persistence. */
  saveTimer?: NodeJS.Timeout;
}

export interface SessionSummary {
  id: string;
  engineId: string;
  title: string;
  createdAt: string;
  lastActivityAt: string;
  busy: boolean;
  firstUserMessage?: string;
  connected: boolean;
  messageCount: number;
}

const sessions = new Map<string, Session>();

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function initSessionStore(): Promise<void> {
  const loaded = await loadAllSessions();
  for (const stored of loaded) {
    sessions.set(stored.id, { ...stored, busy: false });
  }
  console.log(`[sessions] loaded ${loaded.length} from disk`);
}

function scheduleSave(s: Session, delayMs = 250): void {
  if (s.saveTimer) clearTimeout(s.saveTimer);
  s.saveTimer = setTimeout(() => {
    const { ws: _ws, busy: _busy, saveTimer: _t, ...stored } = s;
    void persistSession(stored as StoredSession).catch((err) => {
      console.log(`[sessions] persist ${s.id} failed: ${err}`);
    });
  }, delayMs);
}

export function createSession(engineId: string, title?: string): Session {
  const id = randomId();
  const now = new Date().toISOString();
  const session: Session = {
    id,
    engineId,
    title: title ?? "New chat",
    createdAt: now,
    lastActivityAt: now,
    busy: false,
    messages: [],
  };
  sessions.set(id, session);
  scheduleSave(session, 0);
  return session;
}

export function listSessionsForEngine(engineId: string): SessionSummary[] {
  return [...sessions.values()]
    .filter((s) => s.engineId === engineId)
    .sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1))
    .map(toSummary);
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function getSessionSummary(id: string): SessionSummary | undefined {
  const s = sessions.get(id);
  return s ? toSummary(s) : undefined;
}

export function deleteSession(id: string): void {
  const s = sessions.get(id);
  if (s?.ws && s.ws.readyState === s.ws.OPEN) {
    try {
      s.ws.close(1000, "session deleted");
    } catch {
      /* ignore */
    }
  }
  sessions.delete(id);
  void deleteSessionFile(id);
}

export function touchSession(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  s.lastActivityAt = new Date().toISOString();
  scheduleSave(s);
}

export function renameSession(id: string, title: string): SessionSummary | undefined {
  const s = sessions.get(id);
  if (!s) return undefined;
  s.title = title.trim() || s.title;
  s.lastActivityAt = new Date().toISOString();
  scheduleSave(s, 0);
  return toSummary(s);
}

export function appendUserMessage(
  id: string,
  text: string,
  replyTo?: Message["replyTo"]
): Message | undefined {
  const s = sessions.get(id);
  if (!s) return undefined;
  const msg: Message = {
    id: randomId(),
    ts: new Date().toISOString(),
    role: "user",
    text,
    replyTo,
  };
  s.messages.push(msg);
  if (!s.firstUserMessage) s.firstUserMessage = text.slice(0, 200);
  if ((s.title === "New chat" || !s.title) && text) {
    s.title = text.slice(0, 60);
  }
  s.lastActivityAt = msg.ts;
  scheduleSave(s);
  return msg;
}

export function appendAssistantMessage(
  id: string,
  blocks: AssistantBlock[]
): Message | undefined {
  const s = sessions.get(id);
  if (!s) return undefined;
  const msg: Message = {
    id: randomId(),
    ts: new Date().toISOString(),
    role: "assistant",
    blocks,
  };
  s.messages.push(msg);
  s.lastActivityAt = msg.ts;
  scheduleSave(s);
  return msg;
}

export function clearSessionMessages(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  s.messages = [];
  s.agentSessionId = undefined;
  s.firstUserMessage = undefined;
  s.lastActivityAt = new Date().toISOString();
  scheduleSave(s, 0);
}

function toSummary(s: Session): SessionSummary {
  return {
    id: s.id,
    engineId: s.engineId,
    title: s.title,
    createdAt: s.createdAt,
    lastActivityAt: s.lastActivityAt,
    busy: s.busy,
    firstUserMessage: s.firstUserMessage,
    connected: !!s.ws && s.ws.readyState === s.ws.OPEN,
    messageCount: s.messages.length,
  };
}

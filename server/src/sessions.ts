import type { WebSocket } from "ws";

export interface Session {
  id: string;
  engineId: string;
  title: string;
  createdAt: string;
  lastActivityAt: string;
  /** Claude Agent SDK's internal session_id used for resume(). */
  agentSessionId?: string;
  ws?: WebSocket;
  busy: boolean;
  /** First user message (used as auto-title preview). */
  firstUserMessage?: string;
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
}

const sessions = new Map<string, Session>();

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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
  };
  sessions.set(id, session);
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
}

export function touchSession(id: string): void {
  const s = sessions.get(id);
  if (s) s.lastActivityAt = new Date().toISOString();
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
  };
}

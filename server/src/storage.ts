import { mkdir, readdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataRoot = process.env.AGENT_COCKPIT_DATA_DIR
  ?? path.resolve(__dirname, "../../data");
export const sessionsDir = path.resolve(dataRoot, "sessions");

export type StoredAssistantBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: unknown; id?: string }
  | { type: "tool_result"; output: unknown }
  | { type: "permission_request"; id: string; toolName: string; input: unknown; status: "allowed" | "denied" }
  | { type: "error"; text: string };

export interface StoredMessage {
  id: string;
  ts: string;
  role: "user" | "assistant";
  /** For user messages. */
  text?: string;
  /** For user messages: optional quote of an earlier message. */
  replyTo?: { id: string; preview: string };
  /** For assistant messages. */
  blocks?: StoredAssistantBlock[];
}

export interface StoredSession {
  id: string;
  engineId: string;
  title: string;
  createdAt: string;
  lastActivityAt: string;
  agentSessionId?: string;
  firstUserMessage?: string;
  messages: StoredMessage[];
}

let ready = false;
export async function ensureStorageReady(): Promise<void> {
  if (ready) return;
  await mkdir(sessionsDir, { recursive: true });
  ready = true;
}

export async function loadAllSessions(): Promise<StoredSession[]> {
  await ensureStorageReady();
  let files: string[];
  try {
    files = await readdir(sessionsDir);
  } catch {
    return [];
  }
  const sessions: StoredSession[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(path.join(sessionsDir, file), "utf8");
      const parsed = JSON.parse(raw) as StoredSession;
      if (parsed && parsed.id) sessions.push(parsed);
    } catch (err) {
      console.log(`[storage] skip ${file}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return sessions;
}

export async function persistSession(s: StoredSession): Promise<void> {
  await ensureStorageReady();
  const tmp = path.join(sessionsDir, `${s.id}.tmp`);
  const final = path.join(sessionsDir, `${s.id}.json`);
  await writeFile(tmp, JSON.stringify(s, null, 2), "utf8");
  await rename(tmp, final);
}

export async function deleteSessionFile(id: string): Promise<void> {
  try {
    await unlink(path.join(sessionsDir, `${id}.json`));
  } catch {
    /* ignore */
  }
}

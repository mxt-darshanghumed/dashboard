import { countTokens } from "@anthropic-ai/tokenizer";

export interface CompressionResult {
  original: string;
  compressed: string;
  originalTokens: number;
  compressedTokens: number;
  saved: number;
  percent: number;
  mode: "rules" | "smart";
  notes?: string;
}

export function tokens(text: string): number {
  if (!text) return 0;
  return countTokens(text);
}

/**
 * Conservative rule-based compression — safe for natural prose.
 * Never touches text inside triple backtick code fences.
 */
export function ruleBasedCompress(text: string): string {
  // Split out code fences so we don't munge code
  const parts: { kind: "code" | "prose"; text: string }[] = [];
  const fenceRe = /(```[\s\S]*?```|`[^`\n]+`)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ kind: "prose", text: text.slice(lastIdx, match.index) });
    }
    parts.push({ kind: "code", text: match[0] });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    parts.push({ kind: "prose", text: text.slice(lastIdx) });
  }

  const compressedParts = parts.map((p) =>
    p.kind === "code" ? p.text : compressProse(p.text)
  );
  return compressedParts.join("").trim();
}

const FILLER_PATTERNS: RegExp[] = [
  /\bI would like to\b/gi,
  /\bI'd like to\b/gi,
  /\bcould you please\b/gi,
  /\bplease can you\b/gi,
  /\bcan you please\b/gi,
  /\bif you don't mind\b/gi,
  /\bif you would\b/gi,
  /\bif possible\b/gi,
  /\bif you can\b/gi,
  /\bI think that\b/gi,
  /\bI believe that\b/gi,
  /\bin my opinion\b/gi,
  /\bbasically,?\s*/gi,
  /\bactually,?\s*/gi,
  /\bessentially,?\s*/gi,
  /\bliterally,?\s*/gi,
  /\bjust\s+(?=\w)/gi, // "just" as filler before verb
  /\bkind of\b/gi,
  /\bsort of\b/gi,
  /\byou know\b/gi,
  /\bof course\b/gi,
  /\bperhaps\b/gi,
  /\bvery\s+(?=\w)/gi,
  /\breally\s+(?=\w)/gi,
];

function compressProse(s: string): string {
  let t = s;

  // Filler removal
  for (const re of FILLER_PATTERNS) {
    t = t.replace(re, "");
  }

  // Smart-quote → ASCII
  t = t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, "-")
    .replace(/—/g, "-")
    .replace(/…/g, "...");

  // Multiple punctuation
  t = t.replace(/!{2,}/g, "!").replace(/\?{2,}/g, "?").replace(/\.{4,}/g, "...");

  // Collapse whitespace
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/\s+([.,;:!?])/g, "$1");
  t = t.replace(/\n{3,}/g, "\n\n");

  // Trim leading commas/spaces if filler removal left them
  t = t.replace(/(^|[.\n])\s*,\s*/g, "$1");

  return t;
}

export interface OllamaConfig {
  url: string;
  model: string;
}

export function getOllamaConfig(): OllamaConfig {
  return {
    url: process.env.OLLAMA_URL ?? "http://localhost:11434",
    model: process.env.OLLAMA_COMPRESS_MODEL ?? "qwen2.5:1.5b",
  };
}

const COMPRESSOR_SYSTEM_PROMPT = `You are a prompt-compression assistant. Rewrite the user's message using the absolute minimum tokens while preserving:
- All technical details, file paths, names, code, URLs, numbers
- The user's intent and constraints
- Any specific requirements

Do not:
- Add commentary or meta-text
- Change technical specifics
- Omit context
- Use markdown formatting unless the original had it

Output ONLY the compressed message. No preamble, no explanation, no quotes around the output.`;

export async function ollamaCompress(text: string): Promise<string> {
  const { url, model } = getOllamaConfig();
  const response = await fetch(`${url}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      system: COMPRESSOR_SYSTEM_PROMPT,
      prompt: text,
      stream: false,
      options: { temperature: 0.1 },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama returned ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as { response?: string };
  return (data.response ?? "").trim();
}

export async function isOllamaAvailable(): Promise<boolean> {
  const { url } = getOllamaConfig();
  try {
    const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function compress(
  text: string,
  mode: "rules" | "smart"
): Promise<CompressionResult> {
  const originalTokens = tokens(text);
  let compressed: string;
  let notes: string | undefined;

  if (mode === "smart") {
    try {
      compressed = await ollamaCompress(text);
      if (!compressed) {
        compressed = ruleBasedCompress(text);
        notes = "Ollama returned empty result, fell back to rules";
      }
    } catch (err) {
      compressed = ruleBasedCompress(text);
      notes =
        "Ollama unavailable, fell back to rules. " +
        (err instanceof Error ? err.message : String(err));
    }
  } else {
    compressed = ruleBasedCompress(text);
  }

  const compressedTokens = tokens(compressed);
  const saved = originalTokens - compressedTokens;
  const percent =
    originalTokens > 0 ? Math.round((saved / originalTokens) * 100) : 0;

  return {
    original: text,
    compressed,
    originalTokens,
    compressedTokens,
    saved,
    percent,
    mode,
    notes,
  };
}

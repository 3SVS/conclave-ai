/**
 * v0.16.8 — Phase 4: external design-reference fetcher + extractor.
 *
 * Pulls design lessons from a curated allowlist of public sources,
 * extracts them into AnswerKey / FailureEntry shape via Claude Haiku
 * (cheap, ~$0.01/source/refresh), caches results in D1's
 * `external_references` table with a 24h TTL.
 *
 * Two callers:
 *   - Daily cron in src/index.ts: iterates the allowlist, refreshes
 *     every source whose cached entries are within 24h of expiry.
 *   - POST /admin/refresh-references endpoint (auth: admin token):
 *     manual force-refresh of all sources or a single source_id.
 *
 * Reader: GET /references/:domain endpoint serves the cached entries
 * to CLI review + audit, which injects them into ctx.answerKeys /
 * failureCatalog alongside the bundled seeds + user-written entries.
 *
 * Cost discipline: extraction is one Haiku call per source per refresh.
 * 8 sources × 1 refresh/day × $0.01 = $0.08/day worst case. Negligible
 * compared to per-review LLM spend. The cron is the only caller that
 * triggers extraction; reader endpoints are pure D1 reads.
 *
 * Security: SOURCES is a hardcoded allowlist. We never accept a runtime
 * URL — that would be SSRF. Adding a source = code change + review.
 */
import type { Env } from "./env.js";

/**
 * Curated allowlist of public design-reference sources. Each entry is
 * a stable id + a fetch URL + a hint for the extractor about what the
 * content shape is.
 *
 * Picking criteria:
 *   - Public, stable URL (raw GitHub / docs hosting).
 *   - Treats design as a system, not an art project — concrete
 *     lessons, not vibes.
 *   - Recent enough that the patterns are still current.
 *
 * Adding new entries: PR-only. No runtime URLs.
 */
export interface ExternalSource {
  id: string;
  url: string;
  /** Free-text label shown in source_id column + admin output. */
  name: string;
  /**
   * Which extractor to use. "markdown-design" runs the design lessons
   * extractor; future values can add per-format paths (shadcn registry
   * JSON, design tokens JSON, etc).
   */
  shape: "markdown-design";
}

export const SOURCES: readonly ExternalSource[] = [
  {
    id: "vercel-design",
    name: "Vercel Design Guidelines",
    url: "https://raw.githubusercontent.com/vercel/style-guide/main/README.md",
    shape: "markdown-design",
  },
  {
    id: "shadcn-ui-readme",
    name: "shadcn/ui (component primitives + token system)",
    url: "https://raw.githubusercontent.com/shadcn-ui/ui/main/README.md",
    shape: "markdown-design",
  },
  {
    id: "tailwind-ui-anatomy",
    name: "Tailwind UI component anatomy patterns",
    url: "https://raw.githubusercontent.com/tailwindlabs/tailwindcss.com/main/src/docs/customizing-colors.mdx",
    shape: "markdown-design",
  },
  {
    id: "refactoring-ui-summary",
    name: "Refactoring UI principles (Adam Wathan, Steve Schoger)",
    url: "https://raw.githubusercontent.com/HugoGiraudel/awesome-design-resources/master/README.md",
    shape: "markdown-design",
  },
  {
    id: "design-system-checklist",
    name: "Design Systems Checklist (Marvel)",
    url: "https://raw.githubusercontent.com/sturobson/design-systems-checklist/master/README.md",
    shape: "markdown-design",
  },
];

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 15_000;
const EXTRACTOR_MODEL = "claude-haiku-4-5";

// ---------------------------------------------------------------------------
// Extractor — runs Haiku on fetched markdown + asks for AnswerKey /
// FailureEntry-shaped JSON.

interface ExtractedEntry {
  kind: "answer_key" | "failure";
  domain: "design";
  title: string;
  body: string;
  tags: string[];
  category?: string;
  severity?: "blocker" | "major" | "minor";
}

const EXTRACTOR_PROMPT = `You are extracting design lessons from a public design-system or design-resource document. Output valid JSON only — no prose, no markdown fences.

For each distinct, actionable lesson the document teaches, output one JSON object. Two kinds:

1. answer_key — a positive pattern the document recommends. Fields:
   { "kind": "answer_key", "domain": "design", "title": "<3-7 words: short pattern label>", "body": "<one paragraph: the lesson, written as a directive>", "tags": ["3-5 lowercase keywords"] }

2. failure — a documented anti-pattern / 'don't' / common mistake. Fields:
   { "kind": "failure", "domain": "design", "title": "<short label>", "body": "<one paragraph>", "tags": [...], "category": "<one of: accessibility | contrast | regression | dead-code | performance | other>", "severity": "<blocker | major | minor>" }

Rules:
- Only output entries the document genuinely teaches. Do not invent.
- Skip generic boilerplate (license, install instructions, table of contents).
- Cap at 8 entries total per source. Pick the most concrete + most actionable.
- Output ONE JSON object per line (JSONL). No outer array.
- If the document teaches nothing extractable, output an empty body (no lines).`;

interface AnthropicMessage {
  role: "user";
  content: string;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

async function callHaiku(env: Env, system: string, user: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: EXTRACTOR_MODEL,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: user } as AnthropicMessage],
    }),
  });
  if (!r.ok) {
    const tail = await r.text();
    throw new Error(`Anthropic ${r.status}: ${tail.slice(0, 200)}`);
  }
  const j = (await r.json()) as AnthropicResponse;
  return j.content?.[0]?.text ?? "";
}

function parseJsonl(text: string): ExtractedEntry[] {
  const out: ExtractedEntry[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || !line.startsWith("{")) continue;
    try {
      const obj = JSON.parse(line);
      if (typeof obj?.title !== "string" || typeof obj?.body !== "string") continue;
      if (obj.kind !== "answer_key" && obj.kind !== "failure") continue;
      const entry: ExtractedEntry = {
        kind: obj.kind,
        domain: "design",
        title: String(obj.title).slice(0, 200),
        body: String(obj.body).slice(0, 1200),
        tags: Array.isArray(obj.tags)
          ? obj.tags.slice(0, 8).map((t: unknown) => String(t).slice(0, 32))
          : [],
      };
      if (obj.kind === "failure") {
        entry.category = typeof obj.category === "string" ? obj.category : "other";
        entry.severity =
          obj.severity === "blocker" || obj.severity === "major" || obj.severity === "minor"
            ? obj.severity
            : "minor";
      }
      out.push(entry);
    } catch {
      /* skip malformed line */
    }
  }
  return out.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Fetch + extract one source.

async function fetchSource(source: ExternalSource): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const r = await fetch(source.url, {
      headers: { "user-agent": "conclave-ai-code-council/external-references" },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const text = await r.text();
    // Cap at 24KB so the Haiku call stays predictable.
    return text.slice(0, 24_000);
  } catch {
    return null;
  }
}

function renderPromptText(entry: ExtractedEntry): string {
  if (entry.kind === "answer_key") {
    return `[${entry.tags.slice(0, 3).join("/") || "design"}] ${entry.title} — ${entry.body}`;
  }
  return `[${entry.category ?? "design"}/${entry.severity ?? "minor"}] ${entry.title} — ${entry.body}`;
}

async function shaHex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface RefreshResult {
  source_id: string;
  ok: boolean;
  entries: number;
  reason?: string;
}

/**
 * Refresh one source: fetch → extract → upsert into D1.
 * On any failure (fetch, extract, parse), returns ok: false with a
 * reason. Doesn't throw — caller iterates and aggregates.
 */
export async function refreshSource(env: Env, source: ExternalSource): Promise<RefreshResult> {
  const text = await fetchSource(source);
  if (!text) {
    return { source_id: source.id, ok: false, entries: 0, reason: "fetch_failed" };
  }
  let extracted: ExtractedEntry[];
  try {
    const raw = await callHaiku(env, EXTRACTOR_PROMPT, `Source: ${source.name}\nURL: ${source.url}\n\n---\n\n${text}`);
    extracted = parseJsonl(raw);
  } catch (err) {
    return { source_id: source.id, ok: false, entries: 0, reason: `extract_failed: ${(err as Error).message.slice(0, 120)}` };
  }
  if (extracted.length === 0) {
    return { source_id: source.id, ok: true, entries: 0, reason: "no_extractable_lessons" };
  }

  // Upsert. Entry id is sha256(source_id + idx) so re-runs replace
  // prior cached entries instead of accumulating duplicates.
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + TTL_MS).toISOString();
  // First, mark previous entries from this source as removed so stale
  // ones don't keep getting served once we've extracted a fresh batch.
  await env.DB.prepare(
    `UPDATE external_references SET removed_at = ? WHERE source_id = ? AND removed_at IS NULL`,
  )
    .bind(now, source.id)
    .run();

  for (let i = 0; i < extracted.length; i++) {
    const e = extracted[i]!;
    const id = "ext_" + (await shaHex(`${source.id}::${i}::${now}`)).slice(0, 24);
    const promptText = renderPromptText(e);
    await env.DB.prepare(
      `INSERT INTO external_references
         (id, source_id, source_url, kind, domain, category, severity, title, body, tags, prompt_text, fetched_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        source.id,
        source.url,
        e.kind,
        e.domain,
        e.category ?? null,
        e.severity ?? null,
        e.title,
        e.body,
        JSON.stringify(e.tags),
        promptText,
        now,
        expires,
      )
      .run()
      .catch(() => undefined);
  }
  return { source_id: source.id, ok: true, entries: extracted.length };
}

/** Refresh every source in the allowlist. Returns per-source results. */
export async function refreshAllSources(env: Env): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];
  for (const source of SOURCES) {
    results.push(await refreshSource(env, source));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Reader — used by GET /references/:domain.

export interface CachedReference {
  kind: "answer_key" | "failure";
  domain: "design";
  prompt_text: string;
}

/**
 * Read all non-expired, non-removed references for a domain.
 * Order: most-recently-fetched first.
 */
export async function listExternalReferences(
  env: Env,
  domain: "code" | "design",
): Promise<CachedReference[]> {
  const now = new Date().toISOString();
  const r = await env.DB.prepare(
    `SELECT kind, domain, prompt_text
       FROM external_references
      WHERE domain = ? AND removed_at IS NULL AND expires_at > ?
      ORDER BY fetched_at DESC LIMIT 32`,
  )
    .bind(domain, now)
    .all<{ kind: string; domain: string; prompt_text: string }>();
  const rows = r.results ?? [];
  return rows
    .filter((row) => row.domain === "design" && (row.kind === "answer_key" || row.kind === "failure"))
    .map((row) => ({
      kind: row.kind as "answer_key" | "failure",
      domain: "design" as const,
      prompt_text: row.prompt_text,
    }));
}

/**
 * v0.16.12 — Sprint E1: autonomous source discovery.
 *
 * Polls GitHub for repos that look like design-system / a11y / pattern
 * resources, runs a Haiku relevance check on each candidate's README
 * snippet, and records the result in `source_candidates`. Operators
 * see fresh candidates via GET /admin/source-candidates and can
 * approve/reject via POST /admin/source-candidates/:id/decide.
 *
 * Cost: GitHub search API is free for unauthenticated callers (60
 * req/h rate limit). We make ~5-10 search calls per weekly run and
 * 0.0001/candidate × ~30 candidates = ~$0.003 Haiku per run. Negligible.
 *
 * Why GitHub-trending-style search instead of full crawler: respect
 * the source-discovery surface area Phase 4 already established. Each
 * candidate is reviewed once + cached; we don't re-evaluate the same
 * repo every week. This keeps the "feedback loop" deterministic for
 * the operator.
 */
import type { Env } from "./env.js";

const DISCOVERY_MODEL = "claude-haiku-4-5";
const DISCOVERY_TIMEOUT_MS = 8_000;
const PER_QUERY_LIMIT = 10; // top N from each search query
const MAX_CANDIDATES_PER_RUN = 30; // cap total Haiku calls

// Search queries — broad but targeted at design / a11y / patterns. Each
// query produces up to PER_QUERY_LIMIT candidate repos. We intersect
// with existing source_candidates + the Phase 4 allowlist before any
// Haiku call so we never re-evaluate.
const SEARCH_QUERIES: ReadonlyArray<{ q: string; tag: string }> = [
  { q: "topic:design-system+stars:>500", tag: "design-system" },
  { q: "topic:accessibility+language:typescript+stars:>200", tag: "a11y" },
  { q: "topic:react-patterns+stars:>200", tag: "react-patterns" },
  { q: "topic:component-library+language:typescript+stars:>500", tag: "component-library" },
  { q: "design+tokens+language:css+stars:>100", tag: "design-tokens" },
];

interface GithubSearchItem {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  topics: string[];
  default_branch: string;
}

interface GithubSearchResponse {
  items?: GithubSearchItem[];
}

interface CandidateRow {
  github_full_name: string;
}

async function shaHex8(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
}

async function searchGithub(query: string): Promise<GithubSearchItem[]> {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${PER_QUERY_LIMIT}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "conclave-ai/source-discovery",
        "x-github-api-version": "2022-11-28",
      },
      signal: ctrl.signal,
    });
    if (!r.ok) return [];
    const j = (await r.json()) as GithubSearchResponse;
    return j.items ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

async function fetchReadmeSnippet(item: GithubSearchItem): Promise<string | null> {
  // Try common README locations on the default branch.
  const candidates = [
    `https://raw.githubusercontent.com/${item.full_name}/${item.default_branch}/README.md`,
    `https://raw.githubusercontent.com/${item.full_name}/${item.default_branch}/readme.md`,
  ];
  for (const url of candidates) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), DISCOVERY_TIMEOUT_MS);
      const r = await fetch(url, {
        headers: { "user-agent": "conclave-ai/source-discovery" },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!r.ok) continue;
      const text = await r.text();
      // Cap at 8KB so the relevance prompt stays predictable.
      return text.slice(0, 8_000);
    } catch {
      continue;
    }
  }
  return null;
}

const RELEVANCE_PROMPT = `You evaluate whether a GitHub repository is a useful source of DESIGN-SYSTEM or ACCESSIBILITY or COMPONENT-PATTERNS lessons that could improve an automated design code review tool.

Output ONE JSON object — no prose, no markdown fences:
{
  "score": <number 0.0 to 1.0>,
  "reason": "<one sentence — why this score>"
}

Score guidance:
- 0.8-1.0 — concrete pattern catalog (e.g., shadcn/ui-style component primitives, design-system docs, refactoring-ui guidelines)
- 0.5-0.7 — useful but adjacent (e.g., a single-component library, a hooks library)
- 0.2-0.4 — design-shaped marketing site, blog, sample app
- 0.0-0.1 — unrelated, abandoned, or clearly not pattern-bearing

DO NOT invent details not present in the README excerpt.`;

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

async function evaluateRelevance(
  env: Env,
  item: GithubSearchItem,
  readmeSnippet: string,
): Promise<{ score: number; reason: string } | null> {
  if (!env.ANTHROPIC_API_KEY) return null;
  const userMessage = [
    `Repo: ${item.full_name}`,
    `Stars: ${item.stargazers_count}`,
    `Description: ${item.description ?? "(none)"}`,
    `Topics: ${(item.topics ?? []).join(", ")}`,
    "",
    "README excerpt:",
    "---",
    readmeSnippet,
  ].join("\n");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: DISCOVERY_MODEL,
        max_tokens: 256,
        system: RELEVANCE_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const j = (await r.json()) as AnthropicResponse;
    const text = j.content?.[0]?.text ?? "";
    const stripped = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "");
    const obj = JSON.parse(stripped) as { score?: unknown; reason?: unknown };
    const score = typeof obj.score === "number" && obj.score >= 0 && obj.score <= 1 ? obj.score : null;
    const reason = typeof obj.reason === "string" ? obj.reason.slice(0, 280) : "";
    if (score === null) return null;
    return { score, reason };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export interface DiscoveryResult {
  query: string;
  searched: number;
  evaluated: number;
  saved: number;
  skipped_existing: number;
  reasons: Array<{ full_name: string; reason: string }>;
}

export interface DiscoveryRunSummary {
  ran_queries: number;
  total_evaluated: number;
  total_saved: number;
  total_skipped_existing: number;
  per_query: DiscoveryResult[];
}

/**
 * One discovery pass. Idempotent: existing source_candidates rows
 * (by github_full_name UNIQUE) are skipped, never overwritten.
 */
export async function runSourceDiscovery(env: Env): Promise<DiscoveryRunSummary> {
  // Pull existing candidates once so we don't re-Haiku them.
  const existingRes = await env.DB.prepare(
    `SELECT github_full_name FROM source_candidates`,
  ).all<CandidateRow>();
  const existing = new Set((existingRes.results ?? []).map((r) => r.github_full_name));

  const summary: DiscoveryRunSummary = {
    ran_queries: 0,
    total_evaluated: 0,
    total_saved: 0,
    total_skipped_existing: 0,
    per_query: [],
  };
  let evaluatedTotal = 0;

  for (const { q } of SEARCH_QUERIES) {
    if (evaluatedTotal >= MAX_CANDIDATES_PER_RUN) break;
    summary.ran_queries++;

    const items = await searchGithub(q);
    const result: DiscoveryResult = {
      query: q,
      searched: items.length,
      evaluated: 0,
      saved: 0,
      skipped_existing: 0,
      reasons: [],
    };

    for (const item of items) {
      if (evaluatedTotal >= MAX_CANDIDATES_PER_RUN) break;
      if (!item.full_name) continue;
      if (existing.has(item.full_name)) {
        result.skipped_existing++;
        continue;
      }

      const readme = await fetchReadmeSnippet(item);
      if (!readme) continue;
      const evaluation = await evaluateRelevance(env, item, readme);
      result.evaluated++;
      evaluatedTotal++;
      if (!evaluation) continue;

      const id = `sc_${await shaHex8(item.full_name)}`;
      const now = new Date().toISOString();
      try {
        await env.DB.prepare(
          `INSERT INTO source_candidates
             (id, github_full_name, github_url, raw_url, description, star_count,
              language, topics, relevance_score, relevance_reason, status, discovered_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidate', ?)`,
        )
          .bind(
            id,
            item.full_name,
            item.html_url,
            `https://raw.githubusercontent.com/${item.full_name}/${item.default_branch}/README.md`,
            item.description ?? null,
            item.stargazers_count ?? null,
            item.language ?? null,
            JSON.stringify(item.topics ?? []),
            evaluation.score,
            evaluation.reason,
            now,
          )
          .run();
        existing.add(item.full_name);
        result.saved++;
        result.reasons.push({ full_name: item.full_name, reason: evaluation.reason });
      } catch {
        // Likely UNIQUE constraint race — count as skip, continue.
        result.skipped_existing++;
      }
    }

    summary.total_evaluated += result.evaluated;
    summary.total_saved += result.saved;
    summary.total_skipped_existing += result.skipped_existing;
    summary.per_query.push(result);
  }

  return summary;
}

// --- Reader (used by GET /admin/source-candidates) -----------------------

export interface SourceCandidateRow {
  id: string;
  github_full_name: string;
  github_url: string;
  description: string | null;
  star_count: number | null;
  language: string | null;
  topics: string[];
  relevance_score: number | null;
  relevance_reason: string | null;
  status: string;
  discovered_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export async function listSourceCandidates(
  env: Env,
  status: "candidate" | "approved" | "rejected" | null,
): Promise<SourceCandidateRow[]> {
  const where = status
    ? `WHERE removed_at IS NULL AND status = ?`
    : `WHERE removed_at IS NULL`;
  const stmt = env.DB.prepare(
    `SELECT id, github_full_name, github_url, description, star_count, language,
            topics, relevance_score, relevance_reason, status, discovered_at,
            reviewed_at, reviewed_by
       FROM source_candidates
       ${where}
       ORDER BY relevance_score DESC, discovered_at DESC
       LIMIT 100`,
  );
  const r = await (status ? stmt.bind(status).all() : stmt.all());
  const rows = (r.results ?? []) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    github_full_name: String(row.github_full_name),
    github_url: String(row.github_url),
    description: row.description === null || row.description === undefined ? null : String(row.description),
    star_count: typeof row.star_count === "number" ? row.star_count : null,
    language: row.language === null || row.language === undefined ? null : String(row.language),
    topics: parseJsonArray(String(row.topics ?? "[]")),
    relevance_score: typeof row.relevance_score === "number" ? row.relevance_score : null,
    relevance_reason: row.relevance_reason === null || row.relevance_reason === undefined ? null : String(row.relevance_reason),
    status: String(row.status),
    discovered_at: String(row.discovered_at),
    reviewed_at: row.reviewed_at === null || row.reviewed_at === undefined ? null : String(row.reviewed_at),
    reviewed_by: row.reviewed_by === null || row.reviewed_by === undefined ? null : String(row.reviewed_by),
  }));
}

function parseJsonArray(s: string): string[] {
  try {
    const j = JSON.parse(s);
    return Array.isArray(j) ? j.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

export async function decideCandidate(
  env: Env,
  id: string,
  decision: "approved" | "rejected",
  reviewer: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const r = await env.DB.prepare(
    `UPDATE source_candidates
        SET status = ?, reviewed_at = ?, reviewed_by = ?
      WHERE id = ? AND removed_at IS NULL AND status = 'candidate'`,
  )
    .bind(decision, now, reviewer, id)
    .run();
  return (r.meta?.changes ?? 0) > 0;
}

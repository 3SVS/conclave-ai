/**
 * v0.16.10 — Sprint C: feedback → promoted-seeds promoter.
 *
 * Reads classified-but-not-yet-promoted user_feedback rows, groups by
 * (domain, category), and when a group has ≥ THRESHOLD rows in the
 * last WINDOW_DAYS, synthesizes a single promoted_seed via Haiku and
 * marks the contributing rows with promoted_at.
 *
 * Two callers:
 *   - daily cron in src/index.ts (`0 4 * * *`, one hour after the
 *     external-references refresh so /seeds/promoted/:domain stays
 *     consistent with /references/:domain on the same review pass).
 *   - POST /admin/promote-seeds (INTERNAL_CALLBACK_TOKEN-auth) for
 *     manual debugging / smoke tests.
 *
 * Cost: one Haiku call per (domain, category) that crosses the
 * threshold per run. Even with all 13 categories crossing on the same
 * day that's ~$0.001. Negligible.
 *
 * Idempotency: a promoter pass that fails halfway (Haiku error mid-
 * iteration) leaves earlier promotions intact. The next pass picks up
 * the un-promoted rows and tries again. Rows whose Haiku synthesis
 * fails twice will surface in the per-category failures[] of the
 * RunResult so operators can investigate.
 */
import type { Env } from "./env.js";

const PROMOTE_THRESHOLD = 3;          // classified rows needed to trigger promotion
const WINDOW_DAYS = 30;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;
const PROMOTER_MODEL = "claude-haiku-4-5";
const PROMOTER_TIMEOUT_MS = 8_000;
const MAX_SOURCE_ROWS_PER_PROMOTION = 12; // cap LLM input for cost predictability

type Domain = "code" | "design";

interface SourceFeedbackRow {
  id: string;
  domain: string;
  category: string;
  severity: string;
  what_user_wanted: string;
  what_we_produced: string;
}

interface PromotedSummary {
  kind: "answer_key" | "failure";
  title: string;
  body: string;
  tags: string[];
  severity?: "blocker" | "major" | "minor";
}

const SYSTEM_PROMPT = `You synthesize a SINGLE actionable seed from user feedback rows that all describe the same kind of problem.

Output ONE JSON object — no prose, no markdown fences:
{
  "kind": "<answer_key | failure>",
  "title": "<3-7 words, short pattern label>",
  "body": "<one paragraph: the lesson, written as a directive — what the reviewer should look for / call out next time>",
  "tags": ["3-5 lowercase keywords"],
  "severity": "<blocker | major | minor>"   // include only when kind == 'failure'
}

Choose:
- "failure" when the rows describe an anti-pattern conclave produced or missed (most common).
- "answer_key" when the rows describe a positive pattern conclave should keep producing.

Severity (failure only):
- "blocker" — broken feature / WCAG-violation level / security
- "major" — visibly wrong but not blocking the page from working
- "minor" — polish / nit

Body must be specific enough that a reviewer agent could use it as a checklist item. Do not invent details not present in the source rows.`;

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

async function callHaiku(env: Env, system: string, user: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROMOTER_TIMEOUT_MS);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: PROMOTER_MODEL,
        max_tokens: 512,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const tail = await r.text();
      throw new Error(`Anthropic ${r.status}: ${tail.slice(0, 200)}`);
    }
    const j = (await r.json()) as AnthropicResponse;
    return j.content?.[0]?.text ?? "";
  } finally {
    clearTimeout(t);
  }
}

function parseSummary(text: string): PromotedSummary {
  // Tolerate optional code fences.
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  const obj = JSON.parse(stripped) as Record<string, unknown>;

  const kind = obj.kind === "answer_key" ? "answer_key" : "failure";
  const title = typeof obj.title === "string" ? obj.title.slice(0, 200) : "Promoted seed";
  const body = typeof obj.body === "string" ? obj.body.slice(0, 1200) : "";
  const tags = Array.isArray(obj.tags)
    ? obj.tags.slice(0, 8).map((t) => String(t).slice(0, 32))
    : [];
  const sevRaw = obj.severity;
  const severity: PromotedSummary["severity"] | undefined =
    kind === "failure" && (sevRaw === "blocker" || sevRaw === "major" || sevRaw === "minor")
      ? sevRaw
      : kind === "failure"
        ? "minor"
        : undefined;

  if (!body) throw new Error("promoter returned empty body");
  return { kind, title, body, tags, ...(severity ? { severity } : {}) };
}

function renderPromptText(s: PromotedSummary, category: string): string {
  if (s.kind === "answer_key") {
    return `[${(s.tags.slice(0, 3).join("/")) || category}] ${s.title} — ${s.body}`;
  }
  return `[${category}/${s.severity ?? "minor"}] ${s.title} — ${s.body}`;
}

function buildUserMessage(category: string, rows: readonly SourceFeedbackRow[]): string {
  const lines: string[] = [];
  lines.push(`Domain: ${rows[0]?.domain ?? "design"}`);
  lines.push(`Category: ${category}`);
  lines.push(`Source feedback (${rows.length} rows):`);
  lines.push("");
  for (const r of rows) {
    lines.push(`---`);
    lines.push(`severity: ${r.severity}`);
    lines.push(`wanted: ${r.what_user_wanted}`);
    lines.push(`produced: ${r.what_we_produced}`);
  }
  return lines.join("\n");
}

async function shaHex8(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
}

export interface CategoryPromotionResult {
  domain: string;
  category: string;
  source_count: number;
  promoted: boolean;
  promoted_seed_id?: string;
  reason?: string;
}

export interface PromoterRunResult {
  scanned_groups: number;
  promoted: number;
  skipped_below_threshold: number;
  failed: number;
  results: CategoryPromotionResult[];
}

/**
 * Top-level promoter pass. Returns aggregated results so the cron handler
 * can log them + so /admin/promote-seeds can return them in the body.
 */
export async function promoteSeedsPass(env: Env): Promise<PromoterRunResult> {
  const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();

  // Pull all groups with ≥THRESHOLD eligible rows in window. We do the
  // grouping in SQL so we don't shuttle non-promotable rows over the
  // (domain, category) wall.
  const groupsRes = await env.DB.prepare(
    `SELECT domain, category, COUNT(*) as n
       FROM user_feedback
      WHERE removed_at IS NULL
        AND status = 'classified'
        AND promoted_at IS NULL
        AND created_at >= ?
        AND category IS NOT NULL
      GROUP BY domain, category
     HAVING n >= ?
      ORDER BY n DESC`,
  )
    .bind(cutoff, PROMOTE_THRESHOLD)
    .all<{ domain: string; category: string; n: number }>();
  const groups = groupsRes.results ?? [];

  const results: CategoryPromotionResult[] = [];
  let promoted = 0;
  let failed = 0;

  for (const g of groups) {
    const rowsRes = await env.DB.prepare(
      `SELECT id, domain, category, severity, what_user_wanted, what_we_produced
         FROM user_feedback
        WHERE removed_at IS NULL
          AND status = 'classified'
          AND promoted_at IS NULL
          AND domain = ? AND category = ?
          AND created_at >= ?
        ORDER BY created_at DESC
        LIMIT ?`,
    )
      .bind(g.domain, g.category, cutoff, MAX_SOURCE_ROWS_PER_PROMOTION)
      .all<SourceFeedbackRow>();
    const rows = rowsRes.results ?? [];
    if (rows.length < PROMOTE_THRESHOLD) {
      // Race: a parallel pass already promoted some rows. Skip safely.
      results.push({
        domain: g.domain,
        category: g.category,
        source_count: rows.length,
        promoted: false,
        reason: "below_threshold_after_recount",
      });
      continue;
    }

    let summary: PromotedSummary;
    try {
      const raw = await callHaiku(env, SYSTEM_PROMPT, buildUserMessage(g.category, rows));
      summary = parseSummary(raw);
    } catch (err) {
      failed++;
      results.push({
        domain: g.domain,
        category: g.category,
        source_count: rows.length,
        promoted: false,
        reason: `haiku_failed: ${(err as Error).message.slice(0, 120)}`,
      });
      continue;
    }

    const now = new Date().toISOString();
    const idHash = await shaHex8(`${g.domain}::${g.category}::${now}`);
    const promotedId = `ps_${Date.now().toString(36)}_${idHash}`;
    const sourceIds = rows.map((r) => r.id);
    const promptText = renderPromptText(summary, g.category);

    try {
      await env.DB.prepare(
        `INSERT INTO promoted_seeds
          (id, domain, category, kind, severity, title, body, tags, prompt_text,
           source_feedback_ids, source_count, promoted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          promotedId,
          g.domain,
          g.category,
          summary.kind,
          summary.severity ?? null,
          summary.title,
          summary.body,
          JSON.stringify(summary.tags),
          promptText,
          JSON.stringify(sourceIds),
          rows.length,
          now,
        )
        .run();

      // Mark each source row as promoted. Best-effort batch — if one
      // update fails we still keep the promoted_seed (the duplicate
      // protection is the threshold logic, not the marker).
      for (const r of rows) {
        await env.DB.prepare(
          `UPDATE user_feedback SET promoted_at = ? WHERE id = ?`,
        )
          .bind(now, r.id)
          .run()
          .catch(() => undefined);
      }
    } catch (err) {
      failed++;
      results.push({
        domain: g.domain,
        category: g.category,
        source_count: rows.length,
        promoted: false,
        reason: `db_write_failed: ${(err as Error).message.slice(0, 120)}`,
      });
      continue;
    }

    promoted++;
    results.push({
      domain: g.domain,
      category: g.category,
      source_count: rows.length,
      promoted: true,
      promoted_seed_id: promotedId,
    });
  }

  return {
    scanned_groups: groups.length,
    promoted,
    skipped_below_threshold: 0, // SQL HAVING already filters those — kept for forward-compat
    failed,
    results,
  };
}

// --- Reader (used by GET /seeds/promoted/:domain) -----------------------

export interface PromotedSeedRow {
  kind: "answer_key" | "failure";
  domain: Domain;
  category: string;
  prompt_text: string;
}

export async function listPromotedSeeds(
  env: Env,
  domain: Domain,
): Promise<PromotedSeedRow[]> {
  const r = await env.DB.prepare(
    `SELECT kind, domain, category, prompt_text
       FROM promoted_seeds
      WHERE domain = ? AND removed_at IS NULL
      ORDER BY promoted_at DESC LIMIT 32`,
  )
    .bind(domain)
    .all<{ kind: string; domain: string; category: string; prompt_text: string }>();
  const rows = r.results ?? [];
  return rows
    .filter((row) => (row.kind === "answer_key" || row.kind === "failure"))
    .map((row) => ({
      kind: row.kind as "answer_key" | "failure",
      domain: row.domain as Domain,
      category: row.category,
      prompt_text: row.prompt_text,
    }));
}

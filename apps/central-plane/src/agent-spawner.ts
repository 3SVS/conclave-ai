/**
 * v0.16.17 — Sprint E5 (shadow scaffold): agent self-spawning detector.
 *
 * Today's scope:
 *   1. Detect domain emergence — scan classified-as-'other' user_feedback
 *      rows in a recent window for clusters of similar wording / file-
 *      type hints that don't fit any current agent's lane.
 *   2. When ≥THRESHOLD rows form a cluster (loose: shared keywords),
 *      ask Haiku to synthesize a candidate {agent_id, display_name,
 *      domain_hint, system_prompt} for that domain.
 *   3. Insert into spawned_agents with status='shadow'. NEVER touches
 *      user-visible verdicts.
 *
 * Manual graduation (POST /admin/spawned-agents/:id/promote) is the
 * only path from shadow → promoted. Once promoted, a follow-up sprint
 * will wire the CLI's buildAgent factory to spawn these agents into
 * the council. Today's commit ships only the detection + storage.
 *
 * Cost: one Haiku call per emerged cluster per pass × ~$0.0001 = ~free.
 * Cron runs weekly so even a busy month wouldn't exceed pennies.
 *
 * Threshold + window are intentionally generous (3 rows / 60 days)
 * because the alternative — false-negative on a real new domain —
 * leaves the council blind to it.
 */
import type { Env } from "./env.js";

const SPAWNER_MODEL = "claude-haiku-4-5";
const SPAWNER_TIMEOUT_MS = 8_000;
const EMERGENCE_THRESHOLD = 3;       // classified-as-other rows in cluster
const WINDOW_DAYS = 60;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

interface OtherFeedbackRow {
  id: string;
  what_user_wanted: string;
  what_we_produced: string;
  reasoning: string | null;
  domain: string;
}

interface SpawnedAgentSpec {
  agent_id: string;
  display_name: string;
  /** Strict 'code' | 'design' filter the runtime council uses to gate which reviews recruit this agent. */
  domain: "code" | "design";
  domain_hint: string;
  system_prompt: string;
  base_agent_id: string | null;
  emergence_signal: string;
}

/**
 * Auto-graduation thresholds. Lifted out of `runAutoGraduation` so the
 * tests can read the same constants the cron path uses.
 *
 * trial → promoted requires:
 *   - agent has been in trial ≥ TRIAL_MIN_DURATION_MS
 *   - ≥ TRIAL_MIN_OUTCOMES outcomes recorded
 *   - pass-rate ≥ TRIAL_PROMOTE_PASS_RATE
 *
 * trial → archived requires:
 *   - ≥ TRIAL_MIN_OUTCOMES_FOR_ARCHIVE outcomes recorded
 *   - pass-rate ≤ TRIAL_ARCHIVE_PASS_RATE
 */
export const TRIAL_MIN_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
export const TRIAL_MIN_OUTCOMES = 10;
export const TRIAL_PROMOTE_PASS_RATE = 0.8;
export const TRIAL_MIN_OUTCOMES_FOR_ARCHIVE = 5;
export const TRIAL_ARCHIVE_PASS_RATE = 0.2;

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

const SPAWN_PROMPT = `You inspect a cluster of user-reported feedback rows that conclave's classifier put in category="other" (no existing agent specialty fits). Your job: decide whether this cluster represents a coherent NEW domain that warrants spawning a dedicated review agent, and if so, draft the agent's identity + system prompt.

Output ONE JSON object — no prose, no markdown fences:
{
  "spawn": <true|false>,
  "agent_id": "<lowercase-kebab, e.g. k8s-manifest, graphql-schema, rust-borrow>",
  "display_name": "<3-5 words, Title Case>",
  "domain": "<exactly one of: code | design — gates which review types recruit this agent in the runtime council>",
  "domain_hint": "<one sentence: what does this agent specialize in?>",
  "base_agent_id": "<closest existing agent: claude | openai | gemini | design | null>",
  "emergence_signal": "<one sentence: WHY this cluster looks coherent + actionable>",
  "system_prompt": "<the full system prompt this new agent should use; ~10-30 lines, professional, in the SAME voice as the existing agents (You are a senior reviewer on a multi-agent council for Conclave AI...). Reference the specific domain. Make it concrete: what to flag, what to NOT flag.>"
}

Spawn criteria:
- spawn: true only when the cluster is COHERENT (rows share a real domain, not just random "other" misses) AND the domain isn't already covered (claude/openai/gemini handle code; design handles UI).
- spawn: false when rows are noise, miscategorizations, or already covered.

domain field:
- "code" — backend, infra, schemas, language-specific reviews (k8s, GraphQL, Rust, etc.)
- "design" — UI, accessibility, layout, visual.
- When uncertain, default "code".

If spawn=false, omit the other fields or leave them empty strings; the caller will skip insertion.`;

async function callHaiku(env: Env, system: string, user: string): Promise<string | null> {
  if (!env.ANTHROPIC_API_KEY) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SPAWNER_TIMEOUT_MS);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: SPAWNER_MODEL,
        max_tokens: 2048,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const j = (await r.json()) as AnthropicResponse;
    return j.content?.[0]?.text ?? "";
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function parseSpawnSpec(text: string): SpawnedAgentSpec | { spawn: false } | null {
  try {
    const stripped = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "");
    const obj = JSON.parse(stripped) as Record<string, unknown>;
    if (obj.spawn !== true) return { spawn: false };
    if (
      typeof obj.agent_id !== "string" ||
      typeof obj.display_name !== "string" ||
      typeof obj.domain_hint !== "string" ||
      typeof obj.system_prompt !== "string"
    ) {
      return null;
    }
    const baseRaw = obj.base_agent_id;
    const base_agent_id =
      typeof baseRaw === "string" && ["claude", "openai", "gemini", "design"].includes(baseRaw)
        ? baseRaw
        : null;
    // Default to 'code' when Haiku omits or returns an unrecognized value.
    // The migration's NOT NULL DEFAULT 'code' covers backfill of existing
    // rows; this default covers new inserts where the model didn't comply
    // with the prompt.
    const domain: "code" | "design" =
      obj.domain === "design" ? "design" : "code";
    return {
      agent_id: String(obj.agent_id).slice(0, 64),
      display_name: String(obj.display_name).slice(0, 100),
      domain,
      domain_hint: String(obj.domain_hint).slice(0, 280),
      system_prompt: String(obj.system_prompt).slice(0, 8_000),
      base_agent_id,
      emergence_signal: typeof obj.emergence_signal === "string" ? obj.emergence_signal.slice(0, 280) : "",
    };
  } catch {
    return null;
  }
}

async function shaHex8(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
}

export interface SpawnerRunResult {
  scanned_other_rows: number;
  spawn_attempted: boolean;
  spawn_succeeded: boolean;
  spawned_agent_id?: string;
  reason?: string;
}

/**
 * One pass. Today simplified: ALL classified-as-'other' rows in the
 * window are passed as one cluster (no sub-clustering). This is enough
 * to ship — Haiku decides whether they cohere. Future passes can add
 * keyword/embedding clustering to fan into multiple candidate spawns
 * per pass.
 */
export async function runAgentSpawner(env: Env): Promise<SpawnerRunResult> {
  const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();

  // Pull recent classified-as-other rows.
  const rowsRes = await env.DB.prepare(
    `SELECT id, what_user_wanted, what_we_produced, reasoning, domain
       FROM user_feedback
      WHERE removed_at IS NULL
        AND status = 'classified'
        AND category = 'other'
        AND created_at >= ?
      ORDER BY created_at DESC LIMIT 30`,
  )
    .bind(cutoff)
    .all<OtherFeedbackRow>();
  const rows = rowsRes.results ?? [];
  if (rows.length < EMERGENCE_THRESHOLD) {
    return {
      scanned_other_rows: rows.length,
      spawn_attempted: false,
      spawn_succeeded: false,
      reason: "below_threshold",
    };
  }

  const userMessage = [
    `Recent classified-as-other feedback rows (${rows.length} in last ${WINDOW_DAYS} days):`,
    "",
    ...rows.map((r, i) => `--- row ${i + 1} (${r.domain}) ---\nwanted: ${r.what_user_wanted}\nproduced: ${r.what_we_produced}${r.reasoning ? `\nclassifier reason: ${r.reasoning}` : ""}`),
  ].join("\n");

  const raw = await callHaiku(env, SPAWN_PROMPT, userMessage);
  if (!raw) {
    return {
      scanned_other_rows: rows.length,
      spawn_attempted: true,
      spawn_succeeded: false,
      reason: "haiku_failed",
    };
  }
  const parsed = parseSpawnSpec(raw);
  if (!parsed || ("spawn" in parsed && parsed.spawn === false)) {
    return {
      scanned_other_rows: rows.length,
      spawn_attempted: true,
      spawn_succeeded: false,
      reason: "spawn_declined_by_haiku",
    };
  }

  const spec = parsed as SpawnedAgentSpec;

  // Idempotency: if agent_id already exists (UNIQUE), skip insertion.
  const existing = await env.DB.prepare(
    `SELECT 1 as n FROM spawned_agents WHERE agent_id = ? AND removed_at IS NULL`,
  )
    .bind(spec.agent_id)
    .first<{ n: number }>();
  if (existing) {
    return {
      scanned_other_rows: rows.length,
      spawn_attempted: true,
      spawn_succeeded: false,
      reason: "agent_id_already_exists",
      spawned_agent_id: spec.agent_id,
    };
  }

  const id = `sa_${await shaHex8(spec.agent_id)}`;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO spawned_agents
       (id, agent_id, display_name, domain, domain_hint, emergence_signal,
        trigger_feedback_ids, system_prompt, base_agent_id, status, spawned_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'shadow', ?)`,
  )
    .bind(
      id,
      spec.agent_id,
      spec.display_name,
      spec.domain,
      spec.domain_hint,
      spec.emergence_signal,
      JSON.stringify(rows.map((r) => r.id)),
      spec.system_prompt,
      spec.base_agent_id,
      now,
    )
    .run();

  return {
    scanned_other_rows: rows.length,
    spawn_attempted: true,
    spawn_succeeded: true,
    spawned_agent_id: spec.agent_id,
  };
}

// --- Reader / mutator helpers used by routes ---------------------------

export type SpawnedAgentStatus = "shadow" | "trial" | "promoted" | "archived";

export interface SpawnedAgentRow {
  id: string;
  agent_id: string;
  display_name: string;
  domain: "code" | "design";
  domain_hint: string;
  emergence_signal: string | null;
  base_agent_id: string | null;
  /** 8000-char Haiku-synthesized system prompt the runtime council slots in. */
  system_prompt: string;
  status: SpawnedAgentStatus;
  spawned_at: string;
  trial_promoted_at: string | null;
  promoted_at: string | null;
  archived_at: string | null;
}

export async function listSpawnedAgents(
  env: Env,
  status: SpawnedAgentStatus | null,
  domain?: "code" | "design",
): Promise<SpawnedAgentRow[]> {
  const wheres = ["removed_at IS NULL"];
  const binds: unknown[] = [];
  if (status) {
    wheres.push("status = ?");
    binds.push(status);
  }
  if (domain) {
    wheres.push("domain = ?");
    binds.push(domain);
  }
  const stmt = env.DB.prepare(
    `SELECT id, agent_id, display_name, domain, domain_hint, emergence_signal,
            base_agent_id, system_prompt, status, spawned_at,
            trial_promoted_at, promoted_at, archived_at
       FROM spawned_agents
       WHERE ${wheres.join(" AND ")}
       ORDER BY spawned_at DESC LIMIT 100`,
  );
  const r = binds.length === 0 ? await stmt.all() : await stmt.bind(...binds).all();
  const rows = (r.results ?? []) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    agent_id: String(row.agent_id),
    display_name: String(row.display_name),
    domain: (row.domain === "design" ? "design" : "code") as "code" | "design",
    domain_hint: String(row.domain_hint),
    emergence_signal: row.emergence_signal == null ? null : String(row.emergence_signal),
    base_agent_id: row.base_agent_id == null ? null : String(row.base_agent_id),
    system_prompt: String(row.system_prompt),
    status: row.status as SpawnedAgentStatus,
    spawned_at: String(row.spawned_at),
    trial_promoted_at: row.trial_promoted_at == null ? null : String(row.trial_promoted_at),
    promoted_at: row.promoted_at == null ? null : String(row.promoted_at),
    archived_at: row.archived_at == null ? null : String(row.archived_at),
  }));
}

export async function setSpawnedAgentStatus(
  env: Env,
  id: string,
  newStatus: SpawnedAgentStatus,
): Promise<boolean> {
  const now = new Date().toISOString();
  let sql = `UPDATE spawned_agents SET status = ? WHERE id = ? AND removed_at IS NULL`;
  let binds: unknown[] = [newStatus, id];
  if (newStatus === "trial") {
    sql = `UPDATE spawned_agents SET status = ?, trial_promoted_at = ? WHERE id = ? AND removed_at IS NULL`;
    binds = [newStatus, now, id];
  } else if (newStatus === "promoted") {
    sql = `UPDATE spawned_agents SET status = ?, promoted_at = ? WHERE id = ? AND removed_at IS NULL`;
    binds = [newStatus, now, id];
  } else if (newStatus === "archived") {
    sql = `UPDATE spawned_agents SET status = ?, archived_at = ? WHERE id = ? AND removed_at IS NULL`;
    binds = [newStatus, now, id];
  }
  const r = await env.DB.prepare(sql).bind(...binds).run();
  return (r.meta?.changes ?? 0) > 0;
}

// --- Outcome ingest ----------------------------------------------------

export interface SpawnedAgentOutcomeInput {
  agent_id: string; // the kebab agent_id, e.g. "k8s-manifest"
  review_id: string;
  verdict: "approve" | "rework" | "reject";
  blocker_count: number;
  cost_usd: number;
  latency_ms: number;
  /** True/false when the review's smoke run reported a result; null when no smoke was run. */
  smoke_passed: boolean | null;
}

/**
 * Record a single review outcome for a spawned agent. The CLI calls
 * this after every review the spawned agent participated in (trial or
 * promoted). Idempotent on (spawned_agent_pk, review_id) — pre-existing
 * rows are left alone.
 */
export async function recordSpawnedAgentOutcome(
  env: Env,
  input: SpawnedAgentOutcomeInput,
): Promise<{ ok: true } | { ok: false; reason: "agent_not_found" | "duplicate" }> {
  const agentRow = await env.DB.prepare(
    `SELECT id FROM spawned_agents WHERE agent_id = ? AND removed_at IS NULL`,
  )
    .bind(input.agent_id)
    .first<{ id: string }>();
  if (!agentRow) return { ok: false, reason: "agent_not_found" };

  const dup = await env.DB.prepare(
    `SELECT 1 FROM spawned_agent_outcomes WHERE spawned_agent_pk = ? AND review_id = ? LIMIT 1`,
  )
    .bind(agentRow.id, input.review_id)
    .first<{ "1": number }>();
  if (dup) return { ok: false, reason: "duplicate" };

  const id = `sao_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO spawned_agent_outcomes
       (id, spawned_agent_pk, review_id, verdict, blocker_count, cost_usd, latency_ms, smoke_passed, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      agentRow.id,
      input.review_id,
      input.verdict,
      input.blocker_count,
      input.cost_usd,
      input.latency_ms,
      input.smoke_passed === null ? null : input.smoke_passed ? 1 : 0,
      now,
    )
    .run();
  return { ok: true };
}

/**
 * Update only `smoke_passed` on an existing outcome row for
 * (agent_id, review_id). Used by autofix-pipeline after smoke runs —
 * review.ts posts the outcome with `smoke_passed: null` because review
 * doesn't run smoke; autofix does, and this is how the result threads
 * back so auto-graduation's pass-rate reflects build/test reality.
 *
 * Idempotent: re-applying the same value is a no-op. Returns
 * `agent_not_found` when no spawned agent matches `agent_id`,
 * `outcome_not_found` when no row exists for (agent_pk, review_id).
 */
export async function updateSpawnedAgentSmokeOutcome(
  env: Env,
  input: { agent_id: string; review_id: string; smoke_passed: boolean | null },
): Promise<{ ok: true } | { ok: false; reason: "agent_not_found" | "outcome_not_found" }> {
  const agentRow = await env.DB.prepare(
    `SELECT id FROM spawned_agents WHERE agent_id = ? AND removed_at IS NULL`,
  )
    .bind(input.agent_id)
    .first<{ id: string }>();
  if (!agentRow) return { ok: false, reason: "agent_not_found" };

  const smokeCol =
    input.smoke_passed === null ? null : input.smoke_passed ? 1 : 0;
  const result = await env.DB.prepare(
    `UPDATE spawned_agent_outcomes
        SET smoke_passed = ?
      WHERE spawned_agent_pk = ? AND review_id = ?`,
  )
    .bind(smokeCol, agentRow.id, input.review_id)
    .run();
  // D1 reports affected row count under meta.changes. When 0, the
  // matching outcome row doesn't exist yet — autofix shouldn't be
  // updating something review.ts never inserted.
  if ((result.meta?.changes ?? 0) === 0) {
    return { ok: false, reason: "outcome_not_found" };
  }
  return { ok: true };
}

// --- Auto-graduation ---------------------------------------------------

export interface AutoGradResult {
  evaluated: number;
  promoted: string[];
  archived: string[];
}

interface OutcomeAggRow {
  spawned_agent_pk: string;
  agent_id: string;
  trial_promoted_at: string | null;
  total: number;
  passes: number;
}

/**
 * Define a "trial pass" as a review where the spawned agent didn't
 * reject AND smoke didn't fail. Reject + non-null smoke_passed=0 are
 * the only ways an outcome counts as a fail. Smoke=null (no smoke
 * configured) is neutral — it neither helps nor hurts the trial.
 */
export function isTrialPass(verdict: string, smokePassed: number | null): boolean {
  if (verdict === "reject") return false;
  if (smokePassed === 0) return false;
  return true;
}

/**
 * Pure decision logic — exposed for tests. Given the trial entry +
 * outcome counts + a `now` timestamp, returns "promote" / "archive" /
 * "wait".
 */
export function decideAutoGrad(args: {
  trialPromotedAt: string | null;
  total: number;
  passes: number;
  now: number;
}): "promote" | "archive" | "wait" {
  const { trialPromotedAt, total, passes, now } = args;
  if (!trialPromotedAt) return "wait";
  // Archive first — fail-fast on clearly bad agents even before the
  // duration window has elapsed (saves wasted reviews).
  if (total >= TRIAL_MIN_OUTCOMES_FOR_ARCHIVE) {
    const passRate = passes / total;
    if (passRate <= TRIAL_ARCHIVE_PASS_RATE) return "archive";
  }
  const promotedAt = Date.parse(trialPromotedAt);
  if (!Number.isFinite(promotedAt)) return "wait";
  if (now - promotedAt < TRIAL_MIN_DURATION_MS) return "wait";
  if (total < TRIAL_MIN_OUTCOMES) return "wait";
  const passRate = passes / total;
  if (passRate >= TRIAL_PROMOTE_PASS_RATE) return "promote";
  return "wait";
}

export async function runAutoGraduation(env: Env, nowMs: number = Date.now()): Promise<AutoGradResult> {
  // Aggregate outcomes per trial agent.
  const agg = await env.DB.prepare(
    `SELECT sa.id AS spawned_agent_pk, sa.agent_id, sa.trial_promoted_at,
            COUNT(o.id) AS total,
            SUM(CASE
                  WHEN o.verdict = 'reject' THEN 0
                  WHEN o.smoke_passed = 0 THEN 0
                  ELSE 1
                END) AS passes
       FROM spawned_agents sa
       LEFT JOIN spawned_agent_outcomes o ON o.spawned_agent_pk = sa.id
      WHERE sa.status = 'trial' AND sa.removed_at IS NULL
      GROUP BY sa.id`,
  ).all<OutcomeAggRow>();
  const rows = agg.results ?? [];
  const result: AutoGradResult = { evaluated: rows.length, promoted: [], archived: [] };
  for (const row of rows) {
    const decision = decideAutoGrad({
      trialPromotedAt: row.trial_promoted_at,
      total: Number(row.total ?? 0),
      passes: Number(row.passes ?? 0),
      now: nowMs,
    });
    if (decision === "promote") {
      const flipped = await setSpawnedAgentStatus(env, row.spawned_agent_pk, "promoted");
      if (flipped) result.promoted.push(row.agent_id);
    } else if (decision === "archive") {
      const flipped = await setSpawnedAgentStatus(env, row.spawned_agent_pk, "archived");
      if (flipped) result.archived.push(row.agent_id);
    }
  }
  return result;
}

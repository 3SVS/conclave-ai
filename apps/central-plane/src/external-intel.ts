/**
 * Shared framework for the 4 external-intel miners (CVE, MCP server,
 * shadcn community blocks, awesome-list entries). Each miner is a
 * thin "fetch + distill + persist" loop on top of this module — same
 * D1 table (`external_intel`), same state bookmarking pattern.
 *
 * Migration: 0024_external_intel.sql.
 *
 * The intent is that adding a 5th external feed in the future is a
 * 100-LOC miner file plus a cron entry, not a new schema.
 */
import type { Env } from "./env.js";

export type IntelType = "cve" | "mcp-server" | "shadcn-block" | "awesome-entry";

export type IntelDomain = "code" | "design";
export type IntelKind = "failure" | "answer_key";
export type IntelSeverity = "blocker" | "major" | "minor" | "nit" | null;

export interface ExternalIntelRow {
  /** Stable id — caller computes it from (intel_type, source_id) so re-runs are idempotent. */
  id: string;
  intel_type: IntelType;
  source_id: string;
  source_url: string;
  source_repo: string | null;
  domain: IntelDomain;
  kind: IntelKind;
  category: string;
  severity: IntelSeverity;
  title: string;
  body: string;
  tags: string[];
  prompt_text: string;
  /** Free-form JSON; type-specific extras. */
  metadata?: Record<string, unknown>;
}

/**
 * SHA-256 → first 16 hex chars. Browser/Workers SubtleCrypto-based.
 * Used to compute stable row ids.
 */
async function shaHex16(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf).slice(0, 8);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** Stable row id: `ei_<sha8>`. */
export async function makeIntelId(intelType: IntelType, sourceId: string): Promise<string> {
  return `ei_${await shaHex16(`${intelType}#${sourceId}`)}`;
}

/**
 * Insert (or upsert on the unique (intel_type, source_id) key) one row.
 * Caller has already computed `id` via `makeIntelId`; we don't recompute
 * to keep this insert path deterministic.
 */
export async function upsertIntel(env: Env, row: ExternalIntelRow): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO external_intel
       (id, intel_type, source_id, source_url, source_repo, domain, kind,
        category, severity, title, body, tags, prompt_text, metadata,
        fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(intel_type, source_id) DO UPDATE SET
       source_url   = excluded.source_url,
       source_repo  = excluded.source_repo,
       domain       = excluded.domain,
       kind         = excluded.kind,
       category     = excluded.category,
       severity     = excluded.severity,
       title        = excluded.title,
       body         = excluded.body,
       tags         = excluded.tags,
       prompt_text  = excluded.prompt_text,
       metadata     = excluded.metadata,
       fetched_at   = excluded.fetched_at,
       removed_at   = NULL`,
  )
    .bind(
      row.id,
      row.intel_type,
      row.source_id,
      row.source_url,
      row.source_repo,
      row.domain,
      row.kind,
      row.category,
      row.severity,
      row.title,
      row.body,
      JSON.stringify(row.tags ?? []),
      row.prompt_text,
      row.metadata ? JSON.stringify(row.metadata) : null,
      now,
    )
    .run();
}

/**
 * Read the per-source bookmark. Returns null on first run.
 */
export async function readIntelState(
  env: Env,
  intelType: IntelType,
  sourceId: string,
): Promise<{ last_seen_marker: string | null; last_seen_at: string | null } | null> {
  const row = await env.DB.prepare(
    `SELECT last_seen_marker, last_seen_at
       FROM external_intel_state
      WHERE intel_type = ? AND source_id = ?`,
  )
    .bind(intelType, sourceId)
    .first<{ last_seen_marker: string | null; last_seen_at: string | null }>();
  return row ?? null;
}

/**
 * Write the per-source bookmark. Idempotent on (intel_type, source_id).
 */
export async function writeIntelState(
  env: Env,
  intelType: IntelType,
  sourceId: string,
  marker: { last_seen_marker?: string; last_seen_at?: string },
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO external_intel_state
       (intel_type, source_id, last_seen_marker, last_seen_at, last_run_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(intel_type, source_id) DO UPDATE SET
       last_seen_marker = COALESCE(excluded.last_seen_marker, external_intel_state.last_seen_marker),
       last_seen_at     = COALESCE(excluded.last_seen_at,     external_intel_state.last_seen_at),
       last_run_at      = excluded.last_run_at`,
  )
    .bind(
      intelType,
      sourceId,
      marker.last_seen_marker ?? null,
      marker.last_seen_at ?? null,
      now,
    )
    .run();
}

/**
 * Returns RAG-ready prompt_text rows for one domain. Used by the
 * CLI-facing `/seeds/external-intel/:domain` route to inject into
 * review/audit RAG context alongside the existing OSS PR + spec-update
 * + promoted seeds feeds.
 *
 * Caps at `limit` rows ordered by recency (newest first). Failures and
 * answer_keys are returned in separate buckets so the caller decides
 * which goes into `ctx.answerKeys` vs `ctx.failureCatalog`.
 */
export async function listIntelForDomain(
  env: Env,
  domain: IntelDomain,
  limit = 50,
): Promise<{
  answer_keys: string[];
  failures: string[];
}> {
  const rows = await env.DB.prepare(
    `SELECT prompt_text, kind
       FROM external_intel
      WHERE domain = ? AND removed_at IS NULL
      ORDER BY fetched_at DESC
      LIMIT ?`,
  )
    .bind(domain, limit)
    .all<{ prompt_text: string; kind: IntelKind }>();
  const answer_keys: string[] = [];
  const failures: string[] = [];
  for (const r of rows.results ?? []) {
    if (r.kind === "answer_key") answer_keys.push(r.prompt_text);
    else failures.push(r.prompt_text);
  }
  return { answer_keys, failures };
}

/**
 * Canonical single-line render helper. Every miner produces a
 * prompt_text via this fn so the format the agent sees is uniform:
 *   "[intel-type@source_id] title — body"
 *
 * Tags can be appended by the miner if the type has structured extras
 * (e.g. CVE severity, CWE id list).
 */
export function renderIntelPrompt(opts: {
  intel_type: IntelType;
  source_id: string;
  title: string;
  body: string;
  tagSuffix?: string;
}): string {
  const { intel_type, source_id, title, body, tagSuffix } = opts;
  const head = `[${intel_type}@${source_id}] ${title}`;
  const tail = tagSuffix ? ` (${tagSuffix})` : "";
  return `${head} — ${body}${tail}`;
}

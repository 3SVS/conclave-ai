/**
 * workspace/project-sources-db.ts — Stage 261
 *
 * D1 persistence for project source connections (website / github_repo /
 * document). Documents live in R2 (reference = object key); this table is the
 * unified registry a project's "connections" panel reads.
 */
import type { Env } from "../env.js";

export const SOURCE_TYPES = ["website", "github_repo", "document"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export type DbProjectSource = {
  id: string;
  projectId: string;
  userKey: string;
  type: SourceType;
  reference: string;
  label?: string;
  contentType?: string;
  sizeBytes?: number;
  createdAt: string;
};

type RawRow = {
  id: string;
  project_id: string;
  user_key: string;
  type: SourceType;
  reference: string;
  label: string | null;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

function randId(): string {
  const ts = Date.now().toString(36).slice(-6);
  const r = Math.random().toString(36).slice(2, 6);
  return `psrc_${ts}${r}`;
}

function fromRow(row: RawRow): DbProjectSource {
  return {
    id: row.id,
    projectId: row.project_id,
    userKey: row.user_key,
    type: row.type,
    reference: row.reference,
    label: row.label ?? undefined,
    contentType: row.content_type ?? undefined,
    sizeBytes: row.size_bytes ?? undefined,
    createdAt: row.created_at,
  };
}

export async function insertProjectSource(
  env: Env,
  input: {
    projectId: string;
    userKey: string;
    type: SourceType;
    reference: string;
    label?: string;
    contentType?: string;
    sizeBytes?: number;
    now?: string;
  },
): Promise<DbProjectSource> {
  const id = randId();
  const now = input.now ?? new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO project_sources
       (id, project_id, user_key, type, reference, label, content_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.projectId,
      input.userKey,
      input.type,
      input.reference,
      input.label ?? null,
      input.contentType ?? null,
      input.sizeBytes ?? null,
      now,
    )
    .run();
  return {
    id,
    projectId: input.projectId,
    userKey: input.userKey,
    type: input.type,
    reference: input.reference,
    label: input.label,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    createdAt: now,
  };
}

export async function listProjectSources(env: Env, projectId: string): Promise<DbProjectSource[]> {
  const res = await env.DB.prepare(
    `SELECT id, project_id, user_key, type, reference, label, content_type, size_bytes, created_at
       FROM project_sources
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT 100`,
  )
    .bind(projectId)
    .all();
  return ((res?.results ?? []) as RawRow[]).map(fromRow);
}

export async function getProjectSourceById(env: Env, id: string): Promise<DbProjectSource | null> {
  const row = (await env.DB.prepare(
    `SELECT id, project_id, user_key, type, reference, label, content_type, size_bytes, created_at
       FROM project_sources
      WHERE id = ?`,
  )
    .bind(id)
    .first()) as RawRow | null;
  return row ? fromRow(row) : null;
}

export async function deleteProjectSource(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM project_sources WHERE id = ?`).bind(id).run();
}

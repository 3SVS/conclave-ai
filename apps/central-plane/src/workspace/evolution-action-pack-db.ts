/**
 * workspace/evolution-action-pack-db.ts — Stage 77
 *
 * D1 persistence for saved Evolution Action Packs. The full
 * EvolutionActionPack snapshot lives in pack_json; list/query fields are
 * promoted to columns (see migration 0044).
 */
import type { Env } from "../env.js";

export type DbEvolutionActionPack = {
  id: string;
  projectId: string;
  userKey: string;
  experimentId: string;
  benchmarkId?: string;
  selectedCandidateId?: string;
  recommendedAction: string;
  title: string;
  packJson: string;
  createdAt: string;
  updatedAt: string;
};

export type EvolutionActionPackListItem = {
  id: string;
  experimentId: string;
  recommendedAction: string;
  title: string;
  createdAt: string;
};

type Row = {
  id: string;
  project_id: string;
  user_key: string;
  experiment_id: string;
  benchmark_id: string | null;
  selected_candidate_id: string | null;
  recommended_action: string;
  title: string;
  pack_json: string;
  created_at: string;
  updated_at: string;
};

function map(row: Row): DbEvolutionActionPack {
  return {
    id: row.id,
    projectId: row.project_id,
    userKey: row.user_key,
    experimentId: row.experiment_id,
    benchmarkId: row.benchmark_id ?? undefined,
    selectedCandidateId: row.selected_candidate_id ?? undefined,
    recommendedAction: row.recommended_action,
    title: row.title,
    packJson: row.pack_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function randId(): string {
  const ts = Date.now().toString(36).slice(-6);
  const r = Math.random().toString(36).slice(2, 6);
  return `weap_${ts}${r}`;
}

const COLS = `id, project_id, user_key, experiment_id, benchmark_id, selected_candidate_id,
            recommended_action, title, pack_json, created_at, updated_at`;

export async function insertEvolutionActionPack(
  env: Env,
  input: {
    projectId: string;
    userKey: string;
    experimentId: string;
    benchmarkId?: string;
    selectedCandidateId?: string;
    recommendedAction: string;
    title: string;
    packJson: string;
    now?: string;
  },
): Promise<DbEvolutionActionPack> {
  const id = randId();
  const now = input.now ?? new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO workspace_evolution_action_packs
       (id, project_id, user_key, experiment_id, benchmark_id, selected_candidate_id,
        recommended_action, title, pack_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.projectId,
      input.userKey,
      input.experimentId,
      input.benchmarkId ?? null,
      input.selectedCandidateId ?? null,
      input.recommendedAction,
      input.title,
      input.packJson,
      now,
      now,
    )
    .run();
  return {
    id,
    projectId: input.projectId,
    userKey: input.userKey,
    experimentId: input.experimentId,
    benchmarkId: input.benchmarkId,
    selectedCandidateId: input.selectedCandidateId,
    recommendedAction: input.recommendedAction,
    title: input.title,
    packJson: input.packJson,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listEvolutionActionPacks(
  env: Env,
  args: { projectId: string; experimentId: string; limit?: number },
): Promise<EvolutionActionPackListItem[]> {
  const limit = args.limit && args.limit > 0 ? Math.min(args.limit, 100) : 50;
  const res = await env.DB.prepare(
    `SELECT id, experiment_id, recommended_action, title, created_at
       FROM workspace_evolution_action_packs
      WHERE project_id = ? AND experiment_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
  )
    .bind(args.projectId, args.experimentId, limit)
    .all();
  const rows = (res?.results ?? []) as Array<{
    id: string;
    experiment_id: string;
    recommended_action: string;
    title: string;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    experimentId: row.experiment_id,
    recommendedAction: row.recommended_action,
    title: row.title,
    createdAt: row.created_at,
  }));
}

export async function getEvolutionActionPackById(
  env: Env,
  id: string,
): Promise<DbEvolutionActionPack | null> {
  const row = (await env.DB.prepare(
    `SELECT ${COLS}
       FROM workspace_evolution_action_packs WHERE id = ?`,
  )
    .bind(id)
    .first()) as Row | null;
  return row ? map(row) : null;
}

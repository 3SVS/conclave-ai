/**
 * workspace/evolution-action-pack-db.ts — Stage 77 + Stage 78
 *
 * D1 persistence for saved Evolution Action Packs. The full
 * EvolutionActionPack snapshot lives in pack_json; list/query fields are
 * promoted to columns (see migration 0044). Stage 78 adds follow-up columns
 * (see migration 0045) to track the PR / review run / benchmark that came
 * out of using a saved pack.
 */
import type { Env } from "../env.js";

export type FollowupStatus =
  | "not_started"
  | "copied"
  | "in_progress"
  | "reviewed"
  | "benchmarked"
  | "completed"
  | "abandoned";

export const FOLLOWUP_STATUSES: FollowupStatus[] = [
  "not_started",
  "copied",
  "in_progress",
  "reviewed",
  "benchmarked",
  "completed",
  "abandoned",
];

export type FollowupSnapshot = {
  status: FollowupStatus;
  pullRequestNumber?: number;
  reviewRunId?: string;
  benchmarkId?: string;
  note?: string;
  followedAt?: string;
};

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
  followup: FollowupSnapshot;
};

export type EvolutionActionPackListItem = {
  id: string;
  experimentId: string;
  recommendedAction: string;
  title: string;
  createdAt: string;
  followupStatus: FollowupStatus;
  followupPullRequestNumber?: number;
  followupReviewRunId?: string;
  followupBenchmarkId?: string;
  followedAt?: string;
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
  followup_status: string | null;
  followup_pull_request_number: number | null;
  followup_review_run_id: string | null;
  followup_benchmark_id: string | null;
  followup_note: string | null;
  followed_at: string | null;
};

type ListRow = {
  id: string;
  experiment_id: string;
  recommended_action: string;
  title: string;
  created_at: string;
  followup_status: string | null;
  followup_pull_request_number: number | null;
  followup_review_run_id: string | null;
  followup_benchmark_id: string | null;
  followed_at: string | null;
};

function normalizeStatus(raw: string | null | undefined): FollowupStatus {
  if (raw && (FOLLOWUP_STATUSES as string[]).includes(raw)) return raw as FollowupStatus;
  return "not_started";
}

function followupFromRow(row: Pick<Row,
  "followup_status" | "followup_pull_request_number" | "followup_review_run_id" | "followup_benchmark_id" | "followup_note" | "followed_at">): FollowupSnapshot {
  return {
    status: normalizeStatus(row.followup_status),
    pullRequestNumber: row.followup_pull_request_number ?? undefined,
    reviewRunId: row.followup_review_run_id ?? undefined,
    benchmarkId: row.followup_benchmark_id ?? undefined,
    note: row.followup_note ?? undefined,
    followedAt: row.followed_at ?? undefined,
  };
}

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
    followup: followupFromRow(row),
  };
}

function randId(): string {
  const ts = Date.now().toString(36).slice(-6);
  const r = Math.random().toString(36).slice(2, 6);
  return `weap_${ts}${r}`;
}

const COLS = `id, project_id, user_key, experiment_id, benchmark_id, selected_candidate_id,
            recommended_action, title, pack_json, created_at, updated_at,
            followup_status, followup_pull_request_number, followup_review_run_id,
            followup_benchmark_id, followup_note, followed_at`;

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
    followup: { status: "not_started" },
  };
}

export async function listEvolutionActionPacks(
  env: Env,
  args: { projectId: string; experimentId: string; limit?: number },
): Promise<EvolutionActionPackListItem[]> {
  const limit = args.limit && args.limit > 0 ? Math.min(args.limit, 100) : 50;
  const res = await env.DB.prepare(
    `SELECT id, experiment_id, recommended_action, title, created_at,
            followup_status, followup_pull_request_number, followup_review_run_id,
            followup_benchmark_id, followed_at
       FROM workspace_evolution_action_packs
      WHERE project_id = ? AND experiment_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
  )
    .bind(args.projectId, args.experimentId, limit)
    .all();
  const rows = (res?.results ?? []) as ListRow[];
  return rows.map((row) => ({
    id: row.id,
    experimentId: row.experiment_id,
    recommendedAction: row.recommended_action,
    title: row.title,
    createdAt: row.created_at,
    followupStatus: normalizeStatus(row.followup_status),
    followupPullRequestNumber: row.followup_pull_request_number ?? undefined,
    followupReviewRunId: row.followup_review_run_id ?? undefined,
    followupBenchmarkId: row.followup_benchmark_id ?? undefined,
    followedAt: row.followed_at ?? undefined,
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

/** Stage 78 — record the manual follow-up. All fields nullable except status. */
export async function updateEvolutionActionPackFollowup(
  env: Env,
  id: string,
  fields: {
    status: FollowupStatus;
    pullRequestNumber?: number;
    reviewRunId?: string;
    benchmarkId?: string;
    note?: string;
    followedAt?: string;
    now?: string;
  },
): Promise<void> {
  const now = fields.now ?? new Date().toISOString();
  await env.DB.prepare(
    `UPDATE workspace_evolution_action_packs
        SET followup_status = ?,
            followup_pull_request_number = ?,
            followup_review_run_id = ?,
            followup_benchmark_id = ?,
            followup_note = ?,
            followed_at = ?,
            updated_at = ?
      WHERE id = ?`,
  )
    .bind(
      fields.status,
      fields.pullRequestNumber ?? null,
      fields.reviewRunId ?? null,
      fields.benchmarkId ?? null,
      fields.note ?? null,
      fields.followedAt ?? null,
      now,
      id,
    )
    .run();
}

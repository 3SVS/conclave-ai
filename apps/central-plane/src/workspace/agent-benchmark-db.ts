/**
 * workspace/agent-benchmark-db.ts — Stage 65
 *
 * D1 persistence for saved Multi-Agent Build Benchmarks. MVP: the full
 * candidate + result snapshot lives in result_json; list/query fields are
 * promoted to columns (see migration 0040).
 */
import type { Env } from "../env.js";

export type DbAgentBenchmark = {
  id: string;
  projectId: string;
  userKey: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  candidateCount: number;
  winnerCandidateId?: string;
  noClearWinner: boolean;
  resultJson: string;
};

export type AgentBenchmarkListItem = {
  id: string;
  title?: string;
  createdAt: string;
  candidateCount: number;
  winnerCandidateId?: string;
  noClearWinner: boolean;
};

type RawRow = {
  id: string;
  project_id: string;
  user_key: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  candidate_count: number;
  winner_candidate_id: string | null;
  no_clear_winner: number;
  result_json: string;
};

function randId(): string {
  const ts = Date.now().toString(36).slice(-6);
  const r = Math.random().toString(36).slice(2, 6);
  return `wabm_${ts}${r}`;
}

export async function insertAgentBenchmark(
  env: Env,
  input: {
    projectId: string;
    userKey: string;
    title?: string;
    candidateCount: number;
    winnerCandidateId?: string;
    noClearWinner: boolean;
    resultJson: string;
    now?: string;
  },
): Promise<DbAgentBenchmark> {
  const id = randId();
  const now = input.now ?? new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO workspace_agent_benchmarks
       (id, project_id, user_key, title, created_at, updated_at,
        candidate_count, winner_candidate_id, no_clear_winner, result_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.projectId,
      input.userKey,
      input.title ?? null,
      now,
      now,
      input.candidateCount,
      input.winnerCandidateId ?? null,
      input.noClearWinner ? 1 : 0,
      input.resultJson,
    )
    .run();

  return {
    id,
    projectId: input.projectId,
    userKey: input.userKey,
    title: input.title,
    createdAt: now,
    updatedAt: now,
    candidateCount: input.candidateCount,
    winnerCandidateId: input.winnerCandidateId,
    noClearWinner: input.noClearWinner,
    resultJson: input.resultJson,
  };
}

export async function listAgentBenchmarks(
  env: Env,
  projectId: string,
  opts: { limit?: number } = {},
): Promise<AgentBenchmarkListItem[]> {
  const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 100) : 50;
  const res = await env.DB.prepare(
    `SELECT id, title, created_at, candidate_count, winner_candidate_id, no_clear_winner
       FROM workspace_agent_benchmarks
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
  )
    .bind(projectId, limit)
    .all();

  const rows = (res?.results ?? []) as Array<Omit<RawRow, "project_id" | "user_key" | "result_json" | "updated_at">>;
  return rows.map((row) => ({
    id: row.id,
    title: row.title ?? undefined,
    createdAt: row.created_at,
    candidateCount: row.candidate_count,
    winnerCandidateId: row.winner_candidate_id ?? undefined,
    noClearWinner: row.no_clear_winner === 1,
  }));
}

export async function getAgentBenchmarkById(env: Env, id: string): Promise<DbAgentBenchmark | null> {
  const row = (await env.DB.prepare(
    `SELECT id, project_id, user_key, title, created_at, updated_at,
            candidate_count, winner_candidate_id, no_clear_winner, result_json
       FROM workspace_agent_benchmarks
      WHERE id = ?`,
  )
    .bind(id)
    .first()) as RawRow | null;

  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    userKey: row.user_key,
    title: row.title ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    candidateCount: row.candidate_count,
    winnerCandidateId: row.winner_candidate_id ?? undefined,
    noClearWinner: row.no_clear_winner === 1,
    resultJson: row.result_json,
  };
}

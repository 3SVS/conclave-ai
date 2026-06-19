-- Stage 65: persisted Multi-Agent Build Benchmark.
-- A saved benchmark is a deterministic comparison of existing review runs
-- (candidates) against acceptance results. MVP stores the full candidate +
-- result snapshot in result_json; query/list fields are promoted to columns.
-- No agent execution, no billing — pure project-level evidence artifact.

CREATE TABLE IF NOT EXISTS workspace_agent_benchmarks (
  id                  TEXT NOT NULL PRIMARY KEY,
  project_id          TEXT NOT NULL,
  user_key            TEXT NOT NULL,
  title               TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  candidate_count     INTEGER NOT NULL,
  winner_candidate_id TEXT,
  no_clear_winner     INTEGER NOT NULL DEFAULT 0,
  result_json         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_agent_benchmarks_project
  ON workspace_agent_benchmarks(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_agent_benchmarks_user
  ON workspace_agent_benchmarks(user_key, created_at DESC);

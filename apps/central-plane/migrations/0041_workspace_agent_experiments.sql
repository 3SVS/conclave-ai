-- Stage 72: persisted Manual Multi-Agent Experiments.
-- An experiment is a saved plan (template + candidates) that tracks, per
-- candidate, the manually-linked PR number, review run, and benchmark. No
-- agent execution; candidates are linked by the user. Separate candidate table
-- because candidate links are updated often (PATCH).

CREATE TABLE IF NOT EXISTS workspace_agent_experiments (
  id          TEXT NOT NULL PRIMARY KEY,
  project_id  TEXT NOT NULL,
  user_key    TEXT NOT NULL,
  title       TEXT NOT NULL,
  template_id TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft',
  plan_json   TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_agent_experiments_project
  ON workspace_agent_experiments(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_agent_experiment_candidates (
  id                  TEXT NOT NULL PRIMARY KEY,
  experiment_id       TEXT NOT NULL,
  candidate_id        TEXT NOT NULL,
  label               TEXT NOT NULL,
  mode                TEXT NOT NULL,
  role                TEXT NOT NULL,
  suggested_agent     TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'planned',
  pull_request_number INTEGER,
  review_run_id       TEXT,
  benchmark_id        TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_agent_experiment_candidates_exp
  ON workspace_agent_experiment_candidates(experiment_id);

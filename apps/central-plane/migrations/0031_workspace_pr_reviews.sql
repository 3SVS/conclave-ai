-- Stage 11: workspace PR review runs.
-- Stores async review executions triggered from the dashboard.
-- Completely separate from saas_jobs — no SaaS user required.

CREATE TABLE IF NOT EXISTS workspace_pr_review_runs (
  id                    TEXT NOT NULL PRIMARY KEY,
  project_id            TEXT NOT NULL,
  user_key              TEXT NOT NULL,
  repo_full_name        TEXT NOT NULL,
  pr_number             INTEGER NOT NULL,
  linked_pr_id          TEXT,
  selected_item_ids_json TEXT NOT NULL DEFAULT '[]',
  status                TEXT NOT NULL DEFAULT 'queued',
  saas_job_id           TEXT,
  result_json           TEXT,
  error_message         TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_pr_review_runs_project
  ON workspace_pr_review_runs(project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_pr_review_runs_pr
  ON workspace_pr_review_runs(project_id, repo_full_name, pr_number, updated_at DESC);

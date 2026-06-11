-- Stage 10: workspace PR linking.
-- Stores the mapping between workspace projects and GitHub Pull Requests.
-- selected_item_ids_json records which "꼭 들어가야 할 항목" the PR relates to.
-- No review job is created here — that's Stage 11+.

CREATE TABLE IF NOT EXISTS workspace_project_pull_requests (
  id                    TEXT NOT NULL PRIMARY KEY,
  project_id            TEXT NOT NULL,
  user_key              TEXT NOT NULL,
  repo_full_name        TEXT NOT NULL,
  pr_number             INTEGER NOT NULL,
  pr_title              TEXT NOT NULL,
  pr_state              TEXT NOT NULL,
  pr_url                TEXT,
  pr_head_branch        TEXT,
  pr_base_branch        TEXT,
  selected_item_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_project_prs_project
  ON workspace_project_pull_requests (project_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_project_prs_unique
  ON workspace_project_pull_requests (project_id, repo_full_name, pr_number);

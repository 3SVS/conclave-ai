-- Stage 13: PR comment records.
-- Stores GitHub issue comments posted from the dashboard after a PR review run.
-- status values: draft | posted | error

CREATE TABLE IF NOT EXISTS workspace_pr_comments (
  id                    TEXT NOT NULL PRIMARY KEY,
  project_id            TEXT NOT NULL,
  user_key              TEXT NOT NULL,
  repo_full_name        TEXT NOT NULL,
  pr_number             INTEGER NOT NULL,
  review_run_id         TEXT,
  fix_brief_id          TEXT,
  selected_item_ids_json TEXT NOT NULL DEFAULT '[]',
  github_comment_id     TEXT,
  github_comment_url    TEXT,
  body_preview          TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft',
  error_message         TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_pr_comments_project
  ON workspace_pr_comments(project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_pr_comments_pr
  ON workspace_pr_comments(project_id, repo_full_name, pr_number);

-- Stage 14: workspace usage events for future billing/analytics.
-- Records per-user feature usage without credit deduction.
-- event_type examples: workspace_pr_review_run, workspace_pr_comment_posted,
--   workspace_pr_comment_updated, workspace_fix_pack_exported

CREATE TABLE IF NOT EXISTS workspace_usage_events (
  id          TEXT NOT NULL PRIMARY KEY,
  user_key    TEXT NOT NULL,
  project_id  TEXT,
  event_type  TEXT NOT NULL,
  metadata_json TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_usage_events_user
  ON workspace_usage_events(user_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_usage_events_project
  ON workspace_usage_events(project_id, event_type, created_at DESC);

-- Stage 5 workspace persistence tables.
-- user_key is an anonymous UUID generated client-side (no real auth yet).
-- All tables forward-only — existing production tables are untouched.

CREATE TABLE IF NOT EXISTS workspace_projects (
  id               TEXT NOT NULL PRIMARY KEY,
  user_key         TEXT NOT NULL,
  title            TEXT NOT NULL,
  idea             TEXT NOT NULL DEFAULT '',
  understood_json  TEXT NOT NULL DEFAULT '{}',
  product_spec_json TEXT NOT NULL DEFAULT '{}',
  items_json       TEXT NOT NULL DEFAULT '[]',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_projects_user_key
  ON workspace_projects (user_key);

CREATE TABLE IF NOT EXISTS workspace_items (
  id           TEXT NOT NULL PRIMARY KEY,
  project_id   TEXT NOT NULL,
  title        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'not_started',
  criteria_json TEXT NOT NULL DEFAULT '[]',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_items_project_id
  ON workspace_items (project_id);

CREATE TABLE IF NOT EXISTS workspace_check_runs (
  id          TEXT NOT NULL PRIMARY KEY,
  project_id  TEXT NOT NULL,
  source      TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_check_runs_project_id
  ON workspace_check_runs (project_id);

CREATE TABLE IF NOT EXISTS workspace_fix_suggestions (
  id              TEXT NOT NULL PRIMARY KEY,
  project_id      TEXT NOT NULL,
  item_id         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',
  suggestion_json TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_fix_suggestions_project_id
  ON workspace_fix_suggestions (project_id);

-- Stage 20: workspace credit balance + ledger skeleton.
-- No deduction on feature execution yet — manual grant and preview only.
-- credit_type: review | fix | workspace
-- direction: grant | debit | adjustment | preview

CREATE TABLE IF NOT EXISTS workspace_credit_balances (
  id          TEXT NOT NULL PRIMARY KEY,
  user_key    TEXT NOT NULL,
  credit_type TEXT NOT NULL,
  balance     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_credit_balances_user_type
  ON workspace_credit_balances(user_key, credit_type);

CREATE TABLE IF NOT EXISTS workspace_credit_ledger (
  id              TEXT NOT NULL PRIMARY KEY,
  user_key        TEXT NOT NULL,
  project_id      TEXT,
  credit_type     TEXT NOT NULL,
  amount          INTEGER NOT NULL,
  direction       TEXT NOT NULL,
  reason          TEXT NOT NULL,
  source_event_id TEXT,
  metadata_json   TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_credit_ledger_user
  ON workspace_credit_ledger(user_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_credit_ledger_project
  ON workspace_credit_ledger(project_id, created_at DESC);

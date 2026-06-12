-- Stage 33: user-initiated credit top-up request table.
-- Stores manual top-up requests that admins fulfill via grant.
-- No payment provider integration — admin grant only.

CREATE TABLE IF NOT EXISTS workspace_credit_topup_requests (
  id TEXT PRIMARY KEY,
  user_key TEXT NOT NULL,
  credit_type TEXT NOT NULL DEFAULT 'review',
  requested_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  note TEXT,
  admin_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_workspace_credit_topup_requests_user
ON workspace_credit_topup_requests(user_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_credit_topup_requests_status
ON workspace_credit_topup_requests(status, created_at DESC);

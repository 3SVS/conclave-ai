-- v0.17 — GitHub Marketplace subscription tracking.
--
-- GitHub Marketplace emits `marketplace_purchase` webhook events on
-- the same /webhook/github endpoint we already use for App events.
-- This table records the latest known subscription state per GH
-- account (user or org) so we can:
--   * reconcile saas_users.tier when a paid plan starts / changes /
--     cancels;
--   * surface accurate billing state in /me / admin dashboards;
--   * audit retro-active for support cases (which plan was a user on
--     when their PR ran).
--
-- One row per github_account_id. State transitions are upserts;
-- history isn't kept in this table (the webhook payload's
-- effective_date + status are sufficient for the lifecycle we care
-- about).

CREATE TABLE IF NOT EXISTS gh_marketplace_subscriptions (
  id                    TEXT PRIMARY KEY,            -- mp_<time36>_<rand16>
  github_account_id     INTEGER NOT NULL UNIQUE,     -- account.id (user or org)
  github_account_login  TEXT NOT NULL,               -- account.login
  github_account_type   TEXT NOT NULL,               -- 'User' | 'Organization'
  saas_user_id          TEXT,                        -- linked saas_users.id (matched on github_user_id == account.id for User; null for Org until matched manually)
  plan_id               INTEGER NOT NULL,            -- marketplace_purchase.plan.id
  plan_name             TEXT NOT NULL,               -- e.g. 'Free' | 'Solo' | 'Pro'
  plan_monthly_price_cents INTEGER NOT NULL DEFAULT 0,
  unit_count            INTEGER NOT NULL DEFAULT 1,  -- per-seat plans; 1 for flat
  billing_cycle         TEXT,                        -- 'monthly' | 'yearly' | null
  on_free_trial         INTEGER NOT NULL DEFAULT 0,  -- 0/1 bool
  free_trial_ends_on    TEXT,                        -- ISO date, nullable
  next_billing_date     TEXT,                        -- ISO date, nullable
  status                TEXT NOT NULL,               -- 'active' | 'pending_cancellation' | 'cancelled'
  pending_change_plan_id INTEGER,                    -- next plan_id when status='pending_cancellation' or a pending downgrade
  effective_date        TEXT NOT NULL,               -- ISO date of last status transition
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  FOREIGN KEY (saas_user_id) REFERENCES saas_users(id)
);

CREATE INDEX IF NOT EXISTS idx_gh_mp_user
  ON gh_marketplace_subscriptions(saas_user_id);
CREATE INDEX IF NOT EXISTS idx_gh_mp_account
  ON gh_marketplace_subscriptions(github_account_id);
CREATE INDEX IF NOT EXISTS idx_gh_mp_status
  ON gh_marketplace_subscriptions(status);

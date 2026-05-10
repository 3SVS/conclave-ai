-- v0.14.3 — Sprint E5 council wire-in: 'trial' state + domain field +
-- smoke gate on outcomes.
--
-- 0021 introduced spawned_agents with status ∈ {shadow, promoted,
-- archived}. The 'shadow' state never reaches the council (data-only).
-- 'promoted' was reserved as the future "actually participates" state
-- but was never wired in.
--
-- This migration adds:
--   1. `domain` (NOT NULL, default 'code') — the resolved domain the
--      spawned agent should join reviews of. Originally we stored only
--      `domain_hint` (free-form one-line label); the wire-in needs a
--      strict 'code' | 'design' filter to match the CLI's resolved
--      review domain.
--   2. New status `trial` — sits between shadow and promoted. Trial
--      agents participate in the council but their reject verdict is
--      downgraded to advisory-rework so the FIRST cohort of N reviews
--      a spawned agent runs cannot block a merge. Auto-graduation
--      (trial → promoted) and auto-archive (trial → archived) live in
--      the worker's run-agent-spawner cron.
--   3. `trial_promoted_at` — when the operator (or auto-graduation)
--      flipped the agent shadow → trial. Used by the auto-graduation
--      window: trial duration + outcome count are both gates.
--   4. `spawned_agent_outcomes.smoke_passed` — captures whether the
--      review's smoke run passed (or 'NULL' when no smoke was
--      configured for the repo). Auto-graduation requires both a
--      successful trial verdict and a passing smoke run for the
--      review to count as a "trial pass."
--
-- D1 (SQLite) doesn't ALTER COLUMN, so adding columns is the supported
-- path. Existing rows backfill 'code' for `domain` (the typical case;
-- design-only spawned agents are flagged in shadow/admin and the
-- operator can fix per-row before promoting).

ALTER TABLE spawned_agents
  ADD COLUMN domain TEXT NOT NULL DEFAULT 'code';

ALTER TABLE spawned_agents
  ADD COLUMN trial_promoted_at TEXT;

ALTER TABLE spawned_agent_outcomes
  ADD COLUMN smoke_passed INTEGER;  -- 0 = failed, 1 = passed, NULL = no smoke run

-- Status transition reference (not enforced by D1; the routes Zod-
-- validate every status flip):
--
--   shadow ──manual──▶ trial ──auto/manual──▶ promoted
--      │                 │                      │
--      └──manual─────▶ archived ◀──auto/manual──┘
--
-- Auto-graduation (worker cron):
--   trial → promoted  when:
--     - trial_promoted_at older than 14 days
--     - ≥ 10 outcomes recorded
--     - pass-rate ≥ 80%, where "pass" = (verdict in {approve, rework})
--       AND (smoke_passed = 1 OR smoke_passed IS NULL)
--   trial → archived  when:
--     - ≥ 5 outcomes recorded
--     - pass-rate ≤ 20%

-- Replace the old status index so domain-filtered fetches are cheap.
DROP INDEX IF EXISTS idx_spawned_agents_status;

CREATE INDEX IF NOT EXISTS idx_spawned_agents_status_domain
  ON spawned_agents(status, domain, spawned_at DESC)
  WHERE removed_at IS NULL;

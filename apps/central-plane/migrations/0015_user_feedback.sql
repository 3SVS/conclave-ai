-- v0.16.9 — Sprint A: user_feedback intake + classification.
--
-- Stores user-reported feedback on conclave's review/autofix output:
--   - what they wanted vs what we produced
--   - severity (blocker | major | minor | nit)
--   - domain (code | design)
-- Each row is auto-classified into a category by Haiku at intake time
-- (sync, see feedback-classifier.ts). On Haiku failure the row is left
-- as 'pending' and a 6-hour cron retries via /admin/classify-feedback.
--
-- This is the input pipeline for the self-evolve substrate shipped in
-- Phase 1-5: feedback rows accumulate by category, and Sprint C will
-- promote categories with ≥N signals into the bundled design-seeds.json
-- the CLI ships with.
--
-- Lifecycle:
--   created (status='pending') → classified (status='classified', category set)
--                              ↘ if Haiku fails 3x → status='failed' (manual review)

CREATE TABLE IF NOT EXISTS user_feedback (
  id                TEXT PRIMARY KEY,                  -- fb_<timeMs36>_<rand16>
  user_id           TEXT NOT NULL,                     -- saas_users(id)
  job_id            TEXT,                              -- jobs(id), nullable — feedback may have no associated job
  run_id            TEXT,                              -- free-form correlation id when no jobs row exists
  domain            TEXT NOT NULL,                     -- 'code' | 'design'
  severity          TEXT NOT NULL,                     -- 'blocker' | 'major' | 'minor' | 'nit'
  what_user_wanted  TEXT NOT NULL,                     -- free-text expectation, capped at 4000 chars
  what_we_produced  TEXT NOT NULL,                     -- free-text actual, capped at 4000 chars
  category          TEXT,                              -- classifier output (FeedbackCategory enum), null until classified
  confidence        REAL,                              -- classifier confidence 0..1, null until classified
  reasoning         TEXT,                              -- one-sentence why-this-category from classifier
  status            TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'classified' | 'failed'
  retry_count       INTEGER NOT NULL DEFAULT 0,        -- number of classify retries (capped at 3 → status='failed')
  last_error        TEXT,                              -- last classify error message (truncated)
  created_at        TEXT NOT NULL,                     -- ISO-8601
  classified_at     TEXT,                              -- ISO-8601, set when status flips to 'classified'
  removed_at        TEXT,                              -- soft delete
  FOREIGN KEY (user_id) REFERENCES saas_users(id),
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user
  ON user_feedback(user_id, created_at DESC)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_feedback_status
  ON user_feedback(status, created_at)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_feedback_category
  ON user_feedback(domain, category, severity)
  WHERE removed_at IS NULL AND status = 'classified';

CREATE INDEX IF NOT EXISTS idx_user_feedback_job
  ON user_feedback(job_id, created_at DESC)
  WHERE removed_at IS NULL AND job_id IS NOT NULL;

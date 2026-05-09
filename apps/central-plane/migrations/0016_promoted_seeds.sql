-- v0.16.10 — Sprint C: feedback → promoted seeds.
--
-- Sprint A captured user feedback into user_feedback (classified by Haiku).
-- Sprint C closes the loop: when ≥THRESHOLD classified feedback rows
-- accumulate in the same (domain, category) within a recent window,
-- we synthesize a single "promoted seed" — the conclave's first
-- learnable rule pulled from real user signal — and serve it to CLI
-- review/audit alongside bundled-seeds + external-references.
--
-- Lifecycle:
--   1. user_feedback row classified (Sprint A path).
--   2. seed-promoter cron (`0 4 * * *`) iterates each (domain, category):
--        a. count classified non-promoted rows in the last 30 days.
--        b. if count ≥ 3 → call Haiku to summarize the pattern
--           from those rows into {title, body, tags}.
--        c. insert into promoted_seeds; mark source rows promoted_at.
--   3. CLI review/audit GET /seeds/promoted/:domain → injects entries
--      into ctx.answerKeys / failureCatalog at retrieval time.
--
-- Idempotency: source_feedback_ids is a JSON array of contributing
-- user_feedback row ids; user_feedback.promoted_at is set when a row
-- contributes to a promoted seed so the next promoter pass doesn't
-- double-count.
--
-- Soft-delete via removed_at preserves history (we keep promoted seeds
-- visible to operators even after threshold changes / category rename).

CREATE TABLE IF NOT EXISTS promoted_seeds (
  id                   TEXT PRIMARY KEY,             -- ps_<timeMs36>_<sha8>
  domain               TEXT NOT NULL,                -- 'code' | 'design'
  category             TEXT NOT NULL,                -- FeedbackCategory enum value
  kind                 TEXT NOT NULL,                -- 'answer_key' | 'failure'
  severity             TEXT,                         -- 'blocker' | 'major' | 'minor' (nullable for answer_key)
  title                TEXT NOT NULL,                -- short label
  body                 TEXT NOT NULL,                -- the lesson / pattern body
  tags                 TEXT NOT NULL DEFAULT '[]',   -- JSON array
  prompt_text          TEXT NOT NULL,                -- single-line render the CLI consumes
  source_feedback_ids  TEXT NOT NULL DEFAULT '[]',   -- JSON array of fb_ ids that produced this
  source_count         INTEGER NOT NULL,             -- number of source feedback rows (denormalized for ranking)
  promoted_at          TEXT NOT NULL,                -- ISO-8601
  removed_at           TEXT                          -- soft delete
);

CREATE INDEX IF NOT EXISTS idx_promoted_seeds_domain
  ON promoted_seeds(domain, category, promoted_at DESC)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_promoted_seeds_category
  ON promoted_seeds(category, promoted_at DESC)
  WHERE removed_at IS NULL;

-- Add a promoted_at marker on user_feedback so the promoter knows which
-- rows have already contributed and skips them on subsequent passes.
ALTER TABLE user_feedback ADD COLUMN promoted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_user_feedback_unpromoted_classified
  ON user_feedback(domain, category, created_at DESC)
  WHERE removed_at IS NULL AND status = 'classified' AND promoted_at IS NULL;

-- v0.16.12 — Sprint E1: autonomous source discovery.
--
-- Phase 4 ships a hardcoded 5-source allowlist for design lessons.
-- E1 lets conclave discover NEW potentially-useful sources (currently
-- GitHub-Trending-style sweeps) and surface them as candidates for
-- operator approval — or auto-approval after a probation window.
--
-- Lifecycle:
--   1. Weekly cron polls GitHub Trending API filtered by relevant
--      labels (design-system, accessibility, react-patterns, …).
--   2. For each candidate repo not already in source_candidates or the
--      Phase 4 allowlist: insert with status='candidate', initial Haiku
--      relevance score, sample raw URL.
--   3. During probation (4 weeks default) the source is fetched on each
--      Phase 4 refresh cycle but its extracted entries land in a
--      separate `external_references` row with `provisional=1` so
--      Sprint D telemetry can compare its contribution against the
--      stable allowlist's.
--   4. After probation, Sprint D measurement promotes the candidate
--      to status='approved' (auto-approve when its extracts have
--      contributed to ≥N council catches) OR status='rejected'.
--
-- Sprint E1 ships the table, the discovery cron, and the candidate
-- listing endpoint. Auto-approval (step 4) lands later once Sprint D
-- telemetry data exists.
--
-- Soft-delete via removed_at to preserve discovery history.

CREATE TABLE IF NOT EXISTS source_candidates (
  id                TEXT PRIMARY KEY,            -- sc_<sha8(github_url)>
  github_full_name  TEXT NOT NULL UNIQUE,        -- e.g. "vercel/style-guide"
  github_url        TEXT NOT NULL,               -- https://github.com/<full_name>
  raw_url           TEXT NOT NULL,               -- raw.githubusercontent.com/.../README.md
  description       TEXT,                        -- repo description from GitHub API
  star_count        INTEGER,                     -- snapshot at discovery time
  language          TEXT,                        -- primary language as reported by GitHub
  topics            TEXT NOT NULL DEFAULT '[]',  -- JSON array of GitHub topics
  relevance_score   REAL,                        -- Haiku evaluation 0.0-1.0
  relevance_reason  TEXT,                        -- one-sentence why-this-might-be-useful
  status            TEXT NOT NULL DEFAULT 'candidate',  -- 'candidate' | 'approved' | 'rejected'
  discovered_at     TEXT NOT NULL,               -- ISO-8601
  reviewed_at       TEXT,                        -- when an operator (or auto-rule) approved/rejected
  reviewed_by       TEXT,                        -- saas_users.id or 'auto'
  removed_at        TEXT                         -- soft delete
);

CREATE INDEX IF NOT EXISTS idx_source_candidates_status
  ON source_candidates(status, relevance_score DESC, discovered_at DESC)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_source_candidates_score
  ON source_candidates(relevance_score DESC, discovered_at DESC)
  WHERE removed_at IS NULL AND status = 'candidate';

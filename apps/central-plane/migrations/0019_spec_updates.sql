-- v0.16.14 — Sprint E3: changelog / spec monitoring.
--
-- Weekly scan of release feeds for foundational frameworks/specs
-- (React, Next.js, Tailwind, TypeScript, shadcn-ui, Storybook). For
-- each new release vs last seen, ask Haiku to extract:
--   - answer_key entries — new recommended patterns
--   - failure entries     — deprecated patterns / "don't do this"
--
-- Distinct from E1 (which discovers NEW sources) and E2 (which mines
-- bugfix PRs). E3 tracks the next VERSION of EXISTING upstream specs
-- so conclave doesn't review against stale practices once a major
-- ships.
--
-- Lifecycle:
--   1. Weekly cron iterates SPEC_TARGETS.
--   2. Fetch releases via GitHub API; filter > last_seen_version.
--   3. Per release: send body to Haiku → 0..N {kind, title, body,
--      tags, severity?} entries.
--   4. Insert into spec_updates with stable id keyed on (source_id,
--      release_tag, idx).
--   5. CLI fetches via GET /seeds/spec-updates/:domain and injects
--      alongside other RAG streams.
--
-- Soft-delete via removed_at preserves history.

CREATE TABLE IF NOT EXISTS spec_updates (
  id              TEXT PRIMARY KEY,            -- su_<sha8(source_id+release_tag+idx)>
  source_id       TEXT NOT NULL,               -- 'react' | 'nextjs' | 'tailwind' | 'typescript' | 'shadcn-ui' | 'storybook'
  source_repo     TEXT NOT NULL,               -- 'facebook/react' (for traceability)
  release_tag     TEXT NOT NULL,               -- e.g. 'v18.3.0'
  release_url     TEXT NOT NULL,               -- https://github.com/.../releases/tag/<tag>
  release_published_at TEXT NOT NULL,          -- ISO-8601
  domain          TEXT NOT NULL,               -- 'code' | 'design'
  kind            TEXT NOT NULL,               -- 'answer_key' | 'failure'
  category        TEXT,                        -- e.g. 'accessibility' | 'design-tokens' | 'correctness'
  severity        TEXT,                        -- 'blocker' | 'major' | 'minor' (failures only)
  title           TEXT NOT NULL,               -- short label
  body            TEXT NOT NULL,               -- the rule
  tags            TEXT NOT NULL DEFAULT '[]',  -- JSON array
  prompt_text     TEXT NOT NULL,               -- single-line render
  extracted_at    TEXT NOT NULL,               -- ISO-8601
  removed_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_spec_updates_domain
  ON spec_updates(domain, extracted_at DESC)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_spec_updates_source
  ON spec_updates(source_id, release_published_at DESC)
  WHERE removed_at IS NULL;

-- High-water mark per source so the next pass only fetches releases
-- published after the last successful extraction.
CREATE TABLE IF NOT EXISTS spec_monitor_state (
  source_id            TEXT PRIMARY KEY,
  last_release_tag     TEXT,
  last_release_published_at TEXT,
  last_run_at          TEXT NOT NULL
);

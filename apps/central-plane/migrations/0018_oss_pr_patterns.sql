-- v0.16.13 — Sprint E2: OSS PR pattern miner.
--
-- Scans recently-merged PRs from a curated list of high-traffic OSS
-- repos for `fix:`, `perf:`, `a11y:`, `security:` labels. Each match
-- becomes a Haiku-extracted FailureEntry tagged with PR provenance so
-- the CLI's review/audit RAG context inherits real-world bug history
-- without waiting for users to report similar issues.
--
-- Lifecycle:
--   1. Daily cron polls `/repos/<owner>/<repo>/pulls?state=closed`
--      filtered to `merged_at` > last_run_high_water_mark.
--   2. For each PR matching label/title regex: pull diff snippet +
--      commit message → Haiku → JSON {category, title, body, severity,
--      tags}.
--   3. Insert into oss_pr_patterns. Stable id keyed on (repo,
--      pr_number) so re-scans don't dupe.
--   4. CLI fetches via GET /seeds/oss-patterns/:domain alongside
--      promoted_seeds + external_references. (Wire-in in CLI follows
--      same lib/external-references.ts shape.)
--
-- Soft-delete via removed_at preserves history.

CREATE TABLE IF NOT EXISTS oss_pr_patterns (
  id                TEXT PRIMARY KEY,           -- op_<sha8(repo+pr_number)>
  repo              TEXT NOT NULL,              -- "vercel/next.js"
  pr_number         INTEGER NOT NULL,           -- the merged PR number
  pr_url            TEXT NOT NULL,              -- https://github.com/<repo>/pull/<n>
  pr_title          TEXT NOT NULL,
  pr_merged_at      TEXT NOT NULL,              -- ISO-8601
  pr_labels         TEXT NOT NULL DEFAULT '[]', -- JSON array of label names
  domain            TEXT NOT NULL,              -- 'code' | 'design'
  kind              TEXT NOT NULL DEFAULT 'failure',  -- 'answer_key' | 'failure' (failure overwhelmingly dominant)
  category          TEXT NOT NULL,              -- e.g. 'accessibility', 'performance', 'security'
  severity          TEXT,                       -- 'blocker' | 'major' | 'minor'
  title             TEXT NOT NULL,              -- 3-7 word pattern label
  body              TEXT NOT NULL,              -- the rule reviewer agents read
  tags              TEXT NOT NULL DEFAULT '[]', -- JSON array
  prompt_text       TEXT NOT NULL,              -- single-line render the CLI consumes
  extracted_at      TEXT NOT NULL,              -- ISO-8601
  removed_at        TEXT,
  UNIQUE(repo, pr_number)
);

CREATE INDEX IF NOT EXISTS idx_oss_pr_patterns_domain
  ON oss_pr_patterns(domain, extracted_at DESC)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_oss_pr_patterns_repo
  ON oss_pr_patterns(repo, pr_merged_at DESC)
  WHERE removed_at IS NULL;

-- High-water mark per repo so the next pass only scans PRs merged
-- after the last successful run.
CREATE TABLE IF NOT EXISTS oss_pr_miner_state (
  repo                TEXT PRIMARY KEY,
  last_merged_at_seen TEXT,                     -- ISO-8601 of latest pr_merged_at processed
  last_run_at         TEXT NOT NULL
);

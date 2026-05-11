-- v0.17 — generic external intel pipeline.
--
-- Sprint E2/E3 each ship their own miner (oss-pr-miner, changelog-monitor)
-- with their own table. For 4 additional external feeds (CVE advisories,
-- MCP server registry, shadcn community blocks, awesome-list entries)
-- the pattern is identical — fetch a feed, distill via Haiku, store as
-- a RAG-injectable failure/answer-key entry — so we land one shared
-- table here instead of four near-duplicates.
--
-- All 4 miners write into `external_intel`. Each miner records its own
-- per-source bookmark in `external_intel_state` so re-runs are idempotent.
--
-- Schema mirrors oss_pr_patterns's downstream-consumer shape (domain /
-- kind / category / severity / title / body / tags / prompt_text) so the
-- existing fetch+inject path in the CLI's RAG context loader can read it
-- with minimal change.

CREATE TABLE IF NOT EXISTS external_intel (
  id              TEXT PRIMARY KEY,           -- stable: ei_<sha8(intel_type#source_id)>
  intel_type      TEXT NOT NULL,              -- 'cve' | 'mcp-server' | 'shadcn-block' | 'awesome-entry'
  source_id       TEXT NOT NULL,              -- canonical id within the feed (GHSA id, npm name, etc.)
  source_url      TEXT NOT NULL,              -- canonical link back to the original artifact
  source_repo     TEXT,                       -- "owner/repo" when applicable
  domain          TEXT NOT NULL,              -- 'code' | 'design'
  kind            TEXT NOT NULL DEFAULT 'failure',  -- 'failure' | 'answer_key'
  category        TEXT NOT NULL,              -- conclave category ('security', 'design-tokens', etc.)
  severity        TEXT,                       -- 'blocker' | 'major' | 'minor' | 'nit'
  title           TEXT NOT NULL,              -- 3-7 word pattern label
  body            TEXT NOT NULL,              -- the rule the reviewer agents read
  tags            TEXT NOT NULL DEFAULT '[]', -- JSON array
  prompt_text     TEXT NOT NULL,              -- single-line render the CLI consumes
  metadata        TEXT,                       -- JSON of type-specific extras (CVE severity, CWE list, npm version range, etc.)
  fetched_at      TEXT NOT NULL,              -- ISO-8601
  removed_at      TEXT,
  UNIQUE(intel_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_external_intel_type_domain
  ON external_intel(intel_type, domain, fetched_at DESC)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_external_intel_domain_kind
  ON external_intel(domain, kind, fetched_at DESC)
  WHERE removed_at IS NULL;

-- Per-(intel_type, source_id) bookmark so each miner can pick up
-- exactly where it left off. last_seen_marker is intentionally a free
-- text — different feeds use it for different sentinels (GHSA id for
-- CVE pagination, ISO timestamp for changelog, npm version for
-- registry, etc.).
CREATE TABLE IF NOT EXISTS external_intel_state (
  intel_type        TEXT NOT NULL,
  source_id         TEXT NOT NULL,
  last_seen_marker  TEXT,                     -- type-specific sentinel
  last_seen_at      TEXT,                     -- ISO-8601 of latest source artifact processed
  last_run_at       TEXT NOT NULL,
  PRIMARY KEY (intel_type, source_id)
);

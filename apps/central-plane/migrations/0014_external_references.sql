-- v0.16.8 — Phase 4: external design-reference cache.
--
-- Stores design-system patterns extracted from curated public sources
-- (Vercel Design / shadcn/ui registry / Linear Method / Refactoring UI
-- / GetDesign-style awesome-lists). Refreshed by a daily cron + a
-- manual /admin/refresh-references endpoint.
--
-- Lifecycle:
--   1. Cron / admin call iterates the TS allowlist of source URLs.
--   2. Per source: fetch raw markdown/json → Claude Haiku extracts
--      one or more (AnswerKey | FailureEntry) entries → upsert here.
--   3. CLI review/audit GET /references/:domain → receives the cached
--      entries → injects into ReviewContext.answerKeys / failureCatalog
--      alongside the bundled seeds + user-written entries.
--
-- We store the rendered prompt-line (`prompt_text`) directly so the
-- CLI can use it without re-running the wire-format adapter; the raw
-- structured fields stay around for future federated rerank.

CREATE TABLE IF NOT EXISTS external_references (
  id              TEXT PRIMARY KEY,             -- ext_<sha256(source_id+entry_idx)>
  source_id       TEXT NOT NULL,                -- "vercel-design", "shadcn-ui", "linear-method", …
  source_url      TEXT NOT NULL,                -- full URL fetched from
  kind            TEXT NOT NULL,                -- "answer_key" | "failure"
  domain          TEXT NOT NULL,                -- "code" | "design"
  category        TEXT,                         -- failure category enum (FailureCategorySchema) when kind='failure'
  severity        TEXT,                         -- "blocker" | "major" | "minor" when kind='failure'
  title           TEXT NOT NULL,                -- short label (answer-key 'pattern' OR failure 'title')
  body            TEXT NOT NULL,                -- the lesson / details (the thing agents read)
  tags            TEXT NOT NULL DEFAULT '[]',   -- JSON array
  prompt_text     TEXT NOT NULL,                -- the rendered single-line entry consumed by the CLI
  fetched_at      TEXT NOT NULL,                -- ISO-8601 of the fetch + extract pass
  expires_at      TEXT NOT NULL,                -- fetched_at + 24h
  removed_at      TEXT                          -- nullable; set when source dropped from allowlist
);

CREATE INDEX IF NOT EXISTS idx_external_references_domain
  ON external_references(domain, kind, expires_at)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_external_references_source
  ON external_references(source_id, fetched_at DESC);

-- Stage 261 — Project source connections (ADDITIVE).
--
-- A project can be connected to multiple sources, unified in one table:
--   * website     — deployed app URL (visual completion-check target)
--   * github_repo — owner/repo (PR review / repair-PR target; the existing
--                   workspace-github connection keeps working — this row is the
--                   unified registry entry, no destructive change)
--   * document    — uploaded PRD / spec / md file, stored in R2 (reference = R2 key)
--
-- Safety: CREATE TABLE/INDEX IF NOT EXISTS only. No ALTER, no data mutation.

CREATE TABLE IF NOT EXISTS project_sources (
  id           TEXT NOT NULL PRIMARY KEY,
  project_id   TEXT NOT NULL,
  user_key     TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('website', 'github_repo', 'document')),
  reference    TEXT NOT NULL,           -- url | owner/repo | R2 object key
  label        TEXT,                    -- user-facing name (e.g. "PRD v2")
  content_type TEXT,                    -- documents only
  size_bytes   INTEGER,                 -- documents only
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_sources_project ON project_sources (project_id);
CREATE INDEX IF NOT EXISTS idx_project_sources_user ON project_sources (user_key);

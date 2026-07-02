-- Stage 261 — Simsa visual completion-check runs (ADDITIVE).
--
-- One row per visual inspection of a project's deployed app. The full Korean
-- non-dev report (nondev-report.ts NonDevReport) is snapshotted in report_json;
-- screenshots / video live in R2 under checks/{user_key}/{project_id}/{id}/
-- and their keys are tracked in evidence_keys_json.
--
-- executor: 'local' = operator/concierge ran visual-run.mjs and uploaded;
--           'container' = cloud SimsaInspector run (Phase 2).
-- NO numeric score column by design (Simsa policy §20) — works is tri-state.
--
-- Safety: CREATE TABLE/INDEX IF NOT EXISTS only. No ALTER, no data mutation.

CREATE TABLE IF NOT EXISTS workspace_visual_checks (
  id                 TEXT NOT NULL PRIMARY KEY,
  project_id         TEXT NOT NULL,
  user_key           TEXT NOT NULL,
  target_url         TEXT NOT NULL,
  intent             TEXT NOT NULL,
  decision           TEXT NOT NULL,          -- e.g. "Needs Fix" / "Ready" (11-state ladder)
  works              INTEGER,                -- 1 = works, 0 = broken, NULL = not verified
  status             TEXT NOT NULL DEFAULT 'uploaded'
                     CHECK (status IN ('uploaded', 'queued', 'running', 'done', 'failed')),
  executor           TEXT NOT NULL DEFAULT 'local'
                     CHECK (executor IN ('local', 'container')),
  report_json        TEXT NOT NULL,
  agent_prompt       TEXT,
  evidence_keys_json TEXT NOT NULL DEFAULT '[]',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_visual_checks_project ON workspace_visual_checks (project_id);
CREATE INDEX IF NOT EXISTS idx_workspace_visual_checks_user ON workspace_visual_checks (user_key);

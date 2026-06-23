-- Stage 112 — Persisted Agent Workflow Records.
--
-- Saves the deterministic intake workflow snapshot (acceptance map + stage plan
-- + agent run plan + evidence plan) so a user can list and reopen it later.
-- This is NOT agent execution: no real evidence, decisions, outcomes, benchmark
-- ids, or evolution action packs are stored here. JSON snapshots are stored as
-- TEXT for D1 compatibility and migration simplicity. project_id is nullable
-- because intake may begin before a formal project exists.
CREATE TABLE IF NOT EXISTS workspace_agent_workflow_records (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  intake_type TEXT NOT NULL,
  title TEXT NOT NULL,
  source_summary TEXT NOT NULL,
  raw_input_excerpt TEXT,
  acceptance_map_json TEXT NOT NULL,
  stage_plan_json TEXT NOT NULL,
  agent_run_plan_json TEXT NOT NULL,
  evidence_plan_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_agent_workflow_records_project
ON workspace_agent_workflow_records(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_agent_workflow_records_created
ON workspace_agent_workflow_records(created_at DESC);

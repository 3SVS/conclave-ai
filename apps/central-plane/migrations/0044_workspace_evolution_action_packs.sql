-- Stage 77: persisted Evolution Action Packs.
-- A saved snapshot of a deterministic instruction pack built from an experiment's
-- outcome scorecard. pack_json holds the full server-generated EvolutionActionPack
-- (sections + focusItemIds). No LLM, no agent execution; the pack is generated
-- by the canonical central-plane helper at save time and never trusted from the
-- client.

CREATE TABLE IF NOT EXISTS workspace_evolution_action_packs (
  id                    TEXT NOT NULL PRIMARY KEY,
  project_id            TEXT NOT NULL,
  user_key              TEXT NOT NULL,
  experiment_id         TEXT NOT NULL,
  benchmark_id          TEXT,
  selected_candidate_id TEXT,
  recommended_action    TEXT NOT NULL,
  title                 TEXT NOT NULL,
  pack_json             TEXT NOT NULL,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_evolution_action_packs_project_user
  ON workspace_evolution_action_packs(project_id, user_key);

CREATE INDEX IF NOT EXISTS idx_workspace_evolution_action_packs_experiment
  ON workspace_evolution_action_packs(experiment_id);

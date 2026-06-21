-- Stage 78: action pack follow-up tracking.
-- Records what happened after the user used a saved Evolution Action Pack —
-- the follow-up PR / review run / benchmark and a free-text note. All nullable;
-- older rows are normalised to followup_status="not_started" in the API layer.
-- No agent auto-run, no LLM judgement — the user records this manually.

ALTER TABLE workspace_evolution_action_packs ADD COLUMN followup_status TEXT;
ALTER TABLE workspace_evolution_action_packs ADD COLUMN followup_pull_request_number INTEGER;
ALTER TABLE workspace_evolution_action_packs ADD COLUMN followup_review_run_id TEXT;
ALTER TABLE workspace_evolution_action_packs ADD COLUMN followup_benchmark_id TEXT;
ALTER TABLE workspace_evolution_action_packs ADD COLUMN followup_note TEXT;
ALTER TABLE workspace_evolution_action_packs ADD COLUMN followed_at TEXT;

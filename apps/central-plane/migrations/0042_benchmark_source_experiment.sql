-- Stage 73: link a saved benchmark back to the experiment it was created from.
-- Nullable: benchmarks created directly (Stage 65) leave it NULL; benchmarks
-- created via the experiment handoff record the source experiment id.

ALTER TABLE workspace_agent_benchmarks ADD COLUMN source_experiment_id TEXT;

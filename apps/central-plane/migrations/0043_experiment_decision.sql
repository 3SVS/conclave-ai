-- Stage 74: experiment outcome decision layer.
-- Records which candidate the user accepts / rejects / sends back for fixes,
-- plus an experiment-level decision summary. All nullable (older rows undecided).

ALTER TABLE workspace_agent_experiment_candidates ADD COLUMN outcome TEXT;
ALTER TABLE workspace_agent_experiment_candidates ADD COLUMN outcome_note TEXT;
ALTER TABLE workspace_agent_experiment_candidates ADD COLUMN decided_at TEXT;

ALTER TABLE workspace_agent_experiments ADD COLUMN decision_status TEXT;
ALTER TABLE workspace_agent_experiments ADD COLUMN selected_candidate_id TEXT;
ALTER TABLE workspace_agent_experiments ADD COLUMN decision_note TEXT;
ALTER TABLE workspace_agent_experiments ADD COLUMN decided_at TEXT;

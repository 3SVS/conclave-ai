-- Stage 38: rerun lineage column for workspace_pr_review_runs
-- Tracks which run a re-run was derived from.
-- NULL for normal runs; set to the source run id for re-runs.

ALTER TABLE workspace_pr_review_runs
ADD COLUMN rerun_of_review_run_id TEXT;

CREATE INDEX IF NOT EXISTS idx_workspace_pr_review_runs_rerun_of
ON workspace_pr_review_runs(rerun_of_review_run_id);

-- Stage 28: add status column to workspace_credit_ledger
-- Existing rows default to 'applied' (they were written when actual debits were not enabled,
-- so there are no pending/failed rows to worry about).
ALTER TABLE workspace_credit_ledger
ADD COLUMN status TEXT NOT NULL DEFAULT 'applied';

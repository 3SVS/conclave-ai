-- Stage 26: Debit idempotency — unique index on (user_key, source_event_id) for direction='debit'.
-- Prevents the same credit debit source from being written twice.
-- NULL source_event_id is excluded (SQLite treats NULLs as distinct in unique indexes).
-- Grant/adjustment entries are unaffected: direction != 'debit' is excluded by the partial index.

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_credit_ledger_debit_idempotency
  ON workspace_credit_ledger(user_key, source_event_id)
  WHERE direction = 'debit' AND source_event_id IS NOT NULL;

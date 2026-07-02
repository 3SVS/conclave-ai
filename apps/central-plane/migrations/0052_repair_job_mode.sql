-- Stage 270 — Auto-repair execution result columns (ADDITIVE ALTERs).
--
-- The repair container can now run the worker agent against the Simsa fix
-- brief and apply real code changes on the repair branch. The
-- /internal/repair-done callback reports how the job concluded:
--   mode          TEXT    — 'auto_fix' (worker applied code, non-draft PR)
--                           | 'brief_only' (Stage 268 draft-PR fallback).
--                           NULL on legacy rows and rows still in flight.
--   changed_files INTEGER — number of code files the worker actually changed
--                           (auto_fix only; NULL otherwise).
--
-- NOTE (0048 precedent): `ALTER TABLE ... ADD COLUMN` is additive but NOT
-- idempotent in SQLite/D1 — re-running this file fails with "duplicate column
-- name". Safe here because the deploy pipeline applies each migration exactly
-- once via the d1_migrations ledger (`wrangler d1 migrations apply`). Do NOT
-- apply this file manually with `d1 execute` on a database that already ran
-- the migrations ledger.
--
-- No DROP, no data mutation, both columns NULLable — legacy rows unaffected.

ALTER TABLE workspace_repair_jobs ADD COLUMN mode TEXT;
ALTER TABLE workspace_repair_jobs ADD COLUMN changed_files INTEGER;

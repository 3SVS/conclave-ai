# Stage 224 — Production Auth Migration Apply Gate

Date: 2026-06-26 · Type: production D1 migration apply (0047 only) + verification.

## 1. Approval phrase observed
`"Production auth migration approved."` — present (direct, standalone). Authorizes applying migration
`0047` to the production D1 database ONLY. Does NOT authorize production/dashboard/central-plane deploy,
env/secret provisioning, `AUTH_ENABLED` activation, OAuth, Vercel, CORS, DNS, payment/billing, or
MCP/npm publish. `wrangler d1 migrations apply --remote` was NOT used; no deploy/env/OAuth command was run.

## 2. Branch / HEAD
- main `28652f9` (Stage 221); HEAD == origin/main; worktree clean (no code change in this stage).

## 3. Production / current main state
- Production URL https://app.trysimsa.com · production deploy `9b645af` (Stage 182~183) — UNCHANGED.
- The running worker (`9b645af`) does NOT contain the new auth route code (that is on main `28652f9`,
  not deployed). `AUTH_ENABLED` unset in prod. → the applied tables are DORMANT (no prod code reads/writes them).

## 4. D1 target confirmed
- binding `DB` · database_name `conclave-ai` · database_id `28be7ec4-9c46-4b78-8d07-11f344021dd0`.
- Remote commands reported the exact target: `remote database conclave-ai (28be7ec4-9c46-4b78-8d07-11f344021dd0)`,
  `served_by: v3-prod`, region APAC/ICN — matches Stage 223. Unambiguous.

## 5. Migration file checksum / content review
- `migrations/0047_better_auth_identity_tables.sql`, sha256
  `98dfdbe8c09d454bdae8841ac95f3b9b61933c9e90179e09aea15d99ef8df644` (matches Stage 223).
- 4 × `CREATE TABLE IF NOT EXISTS` (`user`, `session`, `account`, `verification`) +
  3 × `CREATE INDEX IF NOT EXISTS`. No DROP / destructive ALTER / DELETE / TRUNCATE / UPDATE. No
  workspace/project/user_key change.

## 6. Pre-apply local verification
- build pass · auth tests (5 files) 29/29 · typecheck 57/57.

## 7. Pre-apply remote read-only schema check
Command (read-only SELECT):
```
WRANGLER_SEND_METRICS=false CI=1 pnpm --filter @conclave-ai/central-plane exec \
  wrangler d1 execute conclave-ai --remote \
  --command "SELECT name, type FROM sqlite_master WHERE name IN ('user','session','account','verification','idx_session_userId','idx_account_userId','idx_verification_identifier') ORDER BY type, name;"
```
Result: `results: []` — NONE of the 7 Better Auth objects existed pre-apply. `changed_db: false`,
`rows_written: 0` (read-only, no mutation). Confirms not-yet-applied + no name collision. EXIT 0.

## 8. Exact apply command used
```
WRANGLER_SEND_METRICS=false CI=1 pnpm --filter @conclave-ai/central-plane exec \
  wrangler d1 execute conclave-ai --remote \
  --file=./migrations/0047_better_auth_identity_tables.sql
```
(Targeted single-file `d1 execute --remote --file`. `d1 migrations apply` deliberately NOT used.)

## 9. Apply result
- EXIT 0 · `success: true` · "Total queries executed": 7 (4 tables + 3 indexes) · `changed_db: true` ·
  rows_written 17 (DDL schema/index page writes — NOT application-row INSERTs; the migration inserts no
  user/session/account/verification rows) · num_tables 58 · no statement failed.

## 10. Idempotency result
Re-ran the exact same `0047` file once: `success: true`, "Total queries executed": 7, **"Rows written": 0**
(every `IF NOT EXISTS` short-circuited — no-op). Re-count returned 7 (no duplication). Idempotency CONFIRMED.

## 11. Post-apply remote read-only schema verification
- Names/types: tables `account`, `session`, `user`, `verification`; indexes `idx_account_userId`,
  `idx_session_userId`, `idx_verification_identifier`.
- `SELECT COUNT(*) … auth_object_count` = **7** (4 tables + 3 indexes). No application data inserted
  by the migration.

## 12. Post-apply local verification
- build pass · auth tests (5 files) 29/29 · typecheck 57/57 · main `28652f9` clean (no code change).

## 13. Production deploy / env status
- Production deploy UNCHANGED at `9b645af`. No central-plane deploy, no dashboard deploy.
- No env/secret provisioning, `AUTH_ENABLED` still unset in prod, no OAuth. The new schema is dormant
  (the deployed worker neither contains the auth route code nor has auth enabled).

## 14. Rollback / containment note
- Additive + idempotent; production behaviour is unchanged (4 empty tables + 3 indexes, read/written by
  nothing in prod). Containment: the running worker does not use them; `AUTH_ENABLED` unset.
- If ever needed, the tables can be dropped with an explicit, separately-approved teardown
  (`DROP TABLE IF EXISTS "verification"/"account"/"session"/"user";` — reverse FK order) — NOT performed
  here and NOT required (they are empty + dormant).

## 15. Out-of-scope confirmation (NONE performed)
No production deploy, dashboard deploy, central-plane deploy, env/secret provisioning, `AUTH_ENABLED`
activation, OAuth, token, Vercel rewrite, CORS-code change, DNS/domain, payment/billing, hosted
execution, MCP/npm publish, live dashboard behavior change, persistence-to-production of app data, code
change on main, local persistent D1 state committed, dogfood PR #121~130 change. Only the approved
production D1 schema migration (0047) was applied.

## 16. Recommended next stage
**Stage 225 — Production Auth Env / Cookie Topology Readiness Gate** (planning/readiness only). Env/secret
provisioning needs `"Auth production secret provisioning approved."`; production deploy needs
`"Dashboard deploy approved."`; cookie/CORS topology needs `"Auth cookie/CORS topology approved."`

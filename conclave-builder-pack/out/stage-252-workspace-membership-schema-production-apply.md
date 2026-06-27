# Stage 252 — Workspace Membership Schema Production Apply Gate

Date: 2026-06-28 · Type: production D1 schema apply (0048 only) + verification.
**Additive schema live in production D1. Legacy data untouched. No deploy / env / data backfill / launch.**

## 1. Approval phrase observed
`"Workspace membership schema production apply approved."` — present (direct, standalone). Authorizes
applying `0048` to production D1 via targeted single-file `d1 execute` ONLY. Does NOT authorize bulk
`migrations apply`, any other migration, deploy, data backfill, legacy `user_key` migration, project claim,
workspace/member row creation, cleanup, new users, sign-up/sign-in, auth rollback, env/secret change,
`AUTH_SIGNUP_MODE` change, OAuth, DNS/CORS, payment, MCP/npm publish, or broad/invite/workspace launch.

## 2. Branch / HEAD
- main `8203210`; HEAD == origin/main; worktree clean. (No code change — schema apply only.)

## 3. Pre-apply production baseline (read-only)
- `app/api/auth/ok` → 200 `{"ok":true}`; sign-up → 403 `signup_disabled`; Worker `/health` → 200. D1 auth =
  1/1/1/0; `workspace_projects` = **3 legacy rows**. Secrets: `AUTH_ENABLED` present, `AUTH_SIGNUP_MODE`
  absent, `BETTER_AUTH_*` present, OAuth unset.

## 4. Immediate 0048 pre-state verification (read-only)
- `workspaces` absent (0), `workspace_members` absent (0), `workspace_projects.workspace_id` **absent (0)**,
  `workspace_projects.user_key` present (1). Exactly the expected clean pre-state → the non-idempotent
  `ALTER ADD COLUMN` is safe to run once.

## 5. Migration file review
- `0048_workspace_membership_foundation.sql` unchanged from Stage 251: 8 additive statements (2 `CREATE TABLE
  IF NOT EXISTS` + 1 `ALTER … ADD COLUMN workspace_id TEXT` nullable + 5 `CREATE INDEX IF NOT EXISTS`); no
  DROP/DELETE/TRUNCATE/UPDATE outside comments; no backfill; no 0047 redefinition.

## 6. Local verification (pre-apply)
- central-plane build pass · workspace + auth tests **52/52** · route smoke **8/8** · dashboard build + tests
  10/10 · `pnpm verify` green.

## 7. Production apply command used
```
WRANGLER_SEND_METRICS=false CI=1 \
  pnpm --filter @conclave-ai/central-plane exec \
  wrangler d1 execute conclave-ai --remote \
  --file=./migrations/0048_workspace_membership_foundation.sql
```
Run exactly once (targeted single-file; NOT `migrations apply`).

## 8. Apply result / Wrangler output summary
- EXIT 0 · `success: true` · `changed_db: true` · `num_tables: 60` (was 58 → +2) · rows_written 15 (DDL
  schema/index page writes — NOT application rows) · `served_by: v3-prod` (APAC/ICN) · total_attempts 1. No
  statement failed.

## 9. Post-apply schema verification (read-only)
- `workspaces` table exists; `workspace_members` table exists; `workspace_projects.workspace_id` exists
  (nullable — proven by the 3 existing rows receiving NULL); `workspace_projects.user_key` still exists; all
  **5 indexes** exist; the Better Auth 0047 tables (`user`/`session`/`account`/`verification`) all still
  exist (4/4).

## 10. Post-apply data verification (read-only)
- `workspaces` rows = **0**; `workspace_members` rows = **0**. `workspace_projects` = **3** (unchanged from
  pre-apply). **All 3 legacy rows: `workspace_id` IS NULL (3/3); `user_key` retained (3/3)** → legacy data
  untouched, no backfill, no mutation. Auth rows = 1/1/1/0 (unchanged). No tokens read.

## 11. Post-apply runtime verification
- `app.trysimsa.com/account` → 200; `app/api/auth/ok` → 200 `{"ok":true}`; sign-up → 403 `signup_disabled`;
  Worker `/health` → 200. Runtime behaviour UNCHANGED (auth active, sign-up closed, account UX live).

## 12. Post-apply env / secret / auth status
- `AUTH_ENABLED` present (ACTIVE); `AUTH_SIGNUP_MODE` absent (count 0); `BETTER_AUTH_SECRET` /
  `BETTER_AUTH_BASE_URL` / `BETTER_AUTH_TRUSTED_ORIGINS` present; OAuth unset. No env/secret change.

## 13. Rollback / containment decision
- **No rollback.** Apply succeeded once, schema is additive + verified, legacy data untouched, runtime
  healthy. Schema left in place.
- Containment reminder (not triggered): D1/SQLite cannot safely `DROP COLUMN` in all cases → no reversible
  schema-rollback promise; any future teardown is a separately-approved forward-fix/destructive migration.
  Do NOT re-run 0048 (non-idempotent ALTER).

## 14. M&A / enterprise readiness note
The production schema foundation for governance is now live — `workspaces` + `workspace_members` (roles) +
nullable project-ownership link — applied as a single controlled, reviewed, evidence-backed migration that
changed no user-facing behaviour (schema-only, empty tables) and preserved all legacy `user_key` data. Bridge
/ claim / invite-share / audit / endpoints remain separate, gated stages; broad launch stays blocked.

## 15. Explicit non-actions (NONE performed)
No deploy, no additional migration, no production data backfill, no legacy `user_key` mutation, no workspace/
member row creation, no project claim, no destructive cleanup, no user creation, no sign-up/sign-in, no auth
rollback, no env/secret change, no `AUTH_SIGNUP_MODE` change, no OAuth, no DNS/domain, no CORS prod change, no
payment, no MCP/npm publish, no broad launch, no code change on main, no dogfood PR #121~130 change.

## 16. Recommended next stage
**Stage 253 — Workspace Membership Schema Post-Apply Observation / Bridge Readiness Gate** (observation/
planning only). Plan the userKey → auth-user bridge (overlay, no auto-claim) on top of the now-live schema.
Readiness phrase: `"Workspace membership post-apply bridge readiness approved."` Broad launch remains blocked.

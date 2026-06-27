# Stage 250 — PR #173 Merge Gate / Main Sync / Post-Merge Verification

Date: 2026-06-27 · Type: merge + verification. No deploy / D1 apply / mutation. **Schema additive, NOT applied to prod.**

## 1. Approval phrase observed
`"PR #173 merge approved."` — present (direct, standalone). Authorizes merging PR #173 into main ONLY. Does
NOT authorize production D1 apply/mutation, deploy, cleanup, new users, sign-up/sign-in, auth rollback,
env/secret change, `AUTH_SIGNUP_MODE` change, OAuth, DNS/CORS, payment, MCP/npm publish, or broad/invite/
workspace launch.

## 2. PR #173 status before merge
- base `main`, head `feat/stage-249-workspace-membership-schema`, latest commit `5475173`, OPEN, MERGEABLE,
  CLEAN. CI `typecheck-build (20)` + `(22)` both pass; no pending/failed.

## 3. Final diff summary
Exactly 5 NEW files under `apps/central-plane` (no existing file modified):
`migrations/0048_workspace_membership_foundation.sql`, `src/workspace-membership.ts`,
`test/workspace-membership-migration.test.mjs`, `test/workspace-membership.test.mjs`,
`docs/workspace-membership-schema.md`. No `wrangler.toml` / prod env / deploy workflow / auth-activation /
`AUTH_SIGNUP_MODE` / dashboard / payment / OAuth / DNS / CORS / userKey-migration / claim / invite change.

## 4. Migration / schema review (on main `8203210`)
- `0048`: `CREATE TABLE IF NOT EXISTS workspaces` + `CREATE TABLE IF NOT EXISTS workspace_members` (roles
  owner|admin|member|viewer [CHECK], status active|invited|removed [CHECK], type personal|team [CHECK]) +
  `ALTER TABLE workspace_projects ADD COLUMN workspace_id TEXT` (NULLABLE) + 5 indexes (`IF NOT EXISTS`).
  Additive only — no DROP/DELETE/UPDATE/backfill; `workspace_projects.user_key` untouched; does not redefine
  the 0047 auth tables; no `workspace_invites`/`audit_events` (docs-only future).

## 5. Helper / types review
- `src/workspace-membership.ts` (pure): role/status/type constants + unions, `DEFAULT_INVITED_ROLE = "member"`,
  `isWorkspaceRole`/`isWorkspaceMemberStatus`/`isWorkspaceType`, `roleAtLeast`. No DB writes, no endpoint/auth
  behaviour change.

## 6. Pre-merge verification results (PR branch `5475173`)
- central-plane build pass · auth + new workspace tests **52/52** · helper smoke 7/7 · route smoke 8/8 ·
  dashboard build + tests 10/10 · `pnpm verify` green.

## 7. Merge result
PR #173 squash-merged → main. Merge commit `8203210` "Stage 249 — Workspace membership schema foundation
code readiness", mergedAt 2026-06-27T14:39:36Z, state MERGED. Remote + local feature branch deleted.

## 8. main HEAD after merge
`82032108c4c38a17862e98c227e3a5a97693193a`. HEAD == origin/main; tracked worktree clean.

## 9. Changed files confirmed on main
`0048_workspace_membership_foundation.sql` present (workspaces + workspace_members + ADD COLUMN
workspace_id), `src/workspace-membership.ts` present, 2 tests + docs present. `user_key` untouched.

## 10. Post-merge verification results (on main)
- central-plane build + auth/workspace tests **52/52** · route smoke **8/8** · dashboard auth-client tests
  5/5 · `pnpm verify` green.

## 11. Production impact confirmation (live read-only)
- `app.trysimsa.com/api/auth/ok` → 200 `{"ok":true}`; `app/api/auth/sign-up/email` → 403 `signup_disabled`;
  Worker `/health` → 200; D1 user/session/account/verification = **1/1/1/0**. **Production UNCHANGED.**

## 12. Production 0048 apply status
- **NOT applied.** Read-only check on production D1: `SELECT COUNT(*) … name IN ('workspaces',
  'workspace_members')` = **0** (the new tables do not exist in production). The merge applied no migration.

## 13. M&A / enterprise readiness note
The enterprise governance schema foundation (workspace + membership roles + nullable project-ownership link)
is now on main — additive, with a single role-vocabulary source of truth — without applying it to production
or migrating legacy anonymous `user_key` data. Apply, bridge, claim, invite/share, and audit remain separate,
gated, reversible steps.

## 14. Rollback note
Additive + revertible: `git revert 8203210` on a branch → PR. Production unaffected (0048 not applied).
If ever applied, teardown of the new tables/column is a separately-approved destructive op affecting only new
additive objects (never legacy data).

## 15. Explicit non-actions (NONE performed)
No deploy, no central-plane/dashboard deploy, no production D1 apply/mutation, no destructive cleanup, no
user creation, no sign-up/sign-in, no auth rollback, no env/secret change, no `AUTH_SIGNUP_MODE` change, no
OAuth, no DNS/domain, no CORS prod change, no payment, no MCP/npm publish, no broad/invite/workspace launch,
no code change on main beyond the merge, no dogfood PR #121~130 change.

## 16. Recommended next stage
**Stage 251 — Workspace Membership Schema Apply Readiness Gate** (planning/readiness only). Plan the
production D1 apply (backup / verification / rollback). Readiness phrase: `"Workspace membership schema apply
readiness approved."`; actual production apply remains separate: `"Workspace membership schema production
apply approved."` (targeted `d1 execute --remote --file`, with the `ALTER … ADD COLUMN` idempotency caveat).

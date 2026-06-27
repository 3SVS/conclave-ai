# Stage 249 — Workspace Membership Schema Code-Readiness PR

Date: 2026-06-27 · Branch `feat/stage-249-workspace-membership-schema` · PR #173 (OPEN, not merged).
**Code-readiness only. Additive schema, NOT applied to production. No deploy / mutation. Legacy userKey preserved.**

## 1. Approval phrase observed
`"Workspace membership schema code readiness approved."` — present (direct). Authorizes a code-readiness PR
(additive schema + helpers + tests + docs) ONLY. No production D1 apply, no deploy, no D1 mutation, no user
creation, no sign-up/sign-in, no auth/env/secret change, no `AUTH_SIGNUP_MODE` change, no userKey migration,
no claim, no invite/share, no broad launch.

## 2. Branch / HEAD
- Base main `8f0edcc`. Feature branch pushed; PR #173 opened. Report on checkpoint branch only.

## 3. Production baseline (read-only)
- `app/api/auth/ok` → 200 `{"ok":true}`; `app/api/auth/sign-up/email` → 403 `signup_disabled`; D1 = 1/1/1/0.
  Auth secrets present; `AUTH_SIGNUP_MODE` absent; OAuth unset. Unchanged.

## 4. Migration number and file
- Latest existing = `0047`. New = **`0048_workspace_membership_foundation.sql`** (next sequential number,
  repo `00XX_<snake>.sql` convention).

## 5. Schema implementation summary (additive)
- `CREATE TABLE IF NOT EXISTS workspaces` (id PK, name, type personal|team [CHECK], created_by_auth_user_id,
  legacy_user_key nullable, created_at/updated_at, archived_at nullable).
- `CREATE TABLE IF NOT EXISTS workspace_members` (PK (workspace_id, auth_user_id), role
  owner|admin|member|viewer [CHECK], status active|invited|removed [CHECK], invited_by_auth_user_id nullable,
  joined_at nullable, timestamps).
- `ALTER TABLE workspace_projects ADD COLUMN workspace_id TEXT` — **NULLABLE**, additive; `user_key` untouched.
- 5 indexes (`IF NOT EXISTS`). No DROP/DELETE/UPDATE/backfill; does not redefine the 0047 auth tables.
  snake_case repo convention; no FK enforcement (logical `user(id)` refs in comments, no cascade).

## 6. Helper / types summary
- `src/workspace-membership.ts` (pure): `WORKSPACE_ROLES`/`WORKSPACE_MEMBER_STATUSES`/`WORKSPACE_TYPES`
  constants + unions, `DEFAULT_INVITED_ROLE = "member"`, `isWorkspaceRole`/`isWorkspaceMemberStatus`/
  `isWorkspaceType` guards, `roleAtLeast` (owner>admin>member>viewer). No DB access, no endpoint behaviour.

## 7. Docs added/updated
- `docs/workspace-membership-schema.md`: purpose, table summary, role semantics, legacy userKey
  compatibility, no-auto-claim rule, production apply safety (targeted file; `ADD COLUMN` not idempotent →
  pre-check column), future claim/invite/audit stages, broad launch blocked.

## 8. Legacy userKey compatibility
- `workspace_projects.user_key` untouched; `workspace_id` nullable + NULL for all legacy rows. No auto-claim,
  no cross-device merge, no ownership migration, no data backfill, no forced auth gate. Verified by the
  migration shape test (only one `workspace_projects` ALTER = the additive ADD COLUMN; no `user_key` touch).

## 9. Tests / build / typecheck / verify
- build pass · new tests **10/10** (7 `workspace-membership-migration` additive/shape + 3 `workspace-membership`
  helpers) · central-plane full suite **1237/1237** (auth regression 46/46 within) · helper smoke 7/7 · route
  smoke 8/8 · `pnpm typecheck` **57/57** · `pnpm verify` green · pre-push hook verify passed.
- (Note: a first test-iteration over-asserted "no `user_key` string" / matched a `"user"` inline comment;
  fixed by stripping inline comments + scoping the ALTER assertion — final 10/10.)

## 10. Safety scan
- 5 NEW files under `apps/central-plane` only; no existing file modified. No real secrets/tokens, no
  destructive SQL (DROP/DELETE/TRUNCATE/UPDATE), no `AUTH_ENABLED` value, no `wrangler.toml`/`.env` change.

## 11. Production impact
- Zero. PR not merged, migration not applied. Production Worker `8f0edcc`, dashboard `dpl_AfxYFmY6…`, D1
  1/1/1/0, sign-up 403, auth 200 — all unchanged. The schema goes live only on a future, separately-approved apply.

## 12. M&A / enterprise readiness note
Establishes the governance backbone (workspace + membership roles + nullable project ownership link)
additively, with a single source of truth for the role vocabulary, without migrating legacy anonymous data —
each future step (apply → bridge → claim → invite/share → audit) gated, additive, reversible, broad-launch-blocked.

## 13. Rollback note
Additive + revertible: `git revert` the squash commit. Production unaffected (not applied). If ever applied,
teardown of the new tables/column is a separately-approved destructive op affecting only new additive objects.

## 14. Recommended next stage
**Stage 250 — PR Merge Gate for Stage 249**, only after `"PR #173 merge approved."` Production D1 apply
remains a separate, later gate (targeted `d1 execute --remote --file`; NOT bundled with the merge).

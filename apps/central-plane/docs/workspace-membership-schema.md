# Workspace membership schema (Stage 249)

Status: **code-readiness DRAFT.** The migration `0048_workspace_membership_foundation.sql` is on main but
**NOT applied to production** by this stage. It is additive and changes no behaviour until a separately
approved apply + endpoint work. Broad user-facing launch remains blocked.

## Purpose
The additive backbone for enterprise governance: **auth user → workspace → membership role → project
ownership** (with invite/share/audit as later stages). It introduces ownership WITHOUT migrating or mutating
the existing anonymous `user_key`-scoped data.

## Tables
| Object | Summary |
|---|---|
| `workspaces` | `id` PK, `name`, `type` (`personal`\|`team`), `created_by_auth_user_id` (logical → Better Auth `user.id`), `legacy_user_key` (nullable), `created_at`/`updated_at`, `archived_at` (nullable). |
| `workspace_members` | PK `(workspace_id, auth_user_id)`, `role` (`owner`\|`admin`\|`member`\|`viewer`), `status` (`active`\|`invited`\|`removed`), `invited_by_auth_user_id` (nullable), `joined_at` (nullable), timestamps. |
| `workspace_projects.workspace_id` | NEW nullable column (`ALTER TABLE … ADD COLUMN`). `NULL` = legacy `user_key`-scoped (unchanged). |

Indexes: `idx_workspaces_created_by_auth_user_id`, `idx_workspaces_legacy_user_key`,
`idx_workspace_members_auth_user_id`, `idx_workspace_members_role`, `idx_workspace_projects_workspace_id`.

Convention: snake_case (repo `workspace_*` style); plain `TEXT` ids with **no FK enforcement** — references to
`user("id")` are logical (documented in comments), with **no `ON DELETE CASCADE`** to the auth user. Role/
status/type vocabularies mirror `src/workspace-membership.ts` (single source of truth).

## Role semantics (initial)
- **owner** — workspace settings, members, ownership transfer, delete/archive, project access, audit.
- **admin** — invite/remove members (except owner), manage projects/sharing, most audit.
- **member** — create/use projects (if policy allows), run checks/fixes/reviews, view assigned/shared.
- **viewer** — read-only (schema value present; product UI may use it later).

## Legacy userKey compatibility (non-destructive)
- `workspace_projects.user_key` is untouched; `workspace_id` is nullable and stays `NULL` for all legacy rows.
- Signed-out users keep using `user_key`. Authenticated users do **not** auto-claim local `user_key` projects.
- Cross-device auto-merge is forbidden. No legacy rows are deleted/updated. No access is granted merely
  because an auth email matches.

## No auto-claim rule
A project's `workspace_id` is assigned **only** by a future explicit, user-confirmed (or admin-reviewed)
claim flow — never automatically on sign-in. Rollback leaves the legacy `user_key` reference intact.

## Production apply safety (future, separately approved)
- Targeted single-file apply only (`d1 execute --remote --file`), **never** bulk `migrations apply`.
- Local/dry-run apply first; read-only pre/post checks (table/index/column existence).
- `CREATE … IF NOT EXISTS` is idempotent; **`ALTER … ADD COLUMN workspace_id` is NOT idempotent** in
  SQLite/D1 — pre-check the column's absence before apply (or accept the error on re-run). No data backfill.
- Rollback note: dropping the new tables / added column is destructive and affects only the new additive
  objects — never legacy data; coordinate via a separately-approved teardown if ever needed.

## Future stages (not in this PR)
- Project claim flow (explicit, audited); `workspace_invites` + `audit_events` tables; membership endpoints;
  userKey → auth-user bridge; invite/share permissions. Broad launch stays blocked until these land.

# Stage 251 — Workspace Membership Schema Apply Readiness Gate

Date: 2026-06-27 · Type: planning / readiness memo + runbook only. **Nothing applied; production untouched.**

## 1. Approval phrase observed
`"Workspace membership schema apply readiness approved."` — present (direct). Authorizes a readiness memo +
apply runbook ONLY. Does NOT authorize production D1 apply/mutation, deploy, cleanup, new users, sign-up/
sign-in, auth rollback, env/secret change, `AUTH_SIGNUP_MODE` change, OAuth, DNS/CORS, payment, MCP/npm
publish, broad/invite/workspace launch. No `--remote` schema mutation / deploy / D1-write was run (only
read-only introspection + local build/test).

## 2. Branch / HEAD
- main `8203210` (Stage 249 merged); HEAD == origin/main; worktree clean.
  `migrations/0048_workspace_membership_foundation.sql` present on main. No prod D1 apply since Stage 250; no
  deploy since Stage 246; no D1 mutation since Stage 238; no env/secret change since Stage 244;
  `AUTH_ENABLED=true`; `AUTH_SIGNUP_MODE` unset.

## 3. Current production state
- Auth ACTIVE; public sign-up CLOSED (403); controlled `/account` live; D1 auth = 1/1/1/0; 0048 NOT applied.

## 4. Production baseline checks (read-only)
- `app.trysimsa.com/account` → 200; `app/api/auth/ok` → 200 `{"ok":true}`; `app/api/auth/sign-up/email` →
  403 `signup_disabled`; Worker `/health` → 200. D1 user/session/account/verification = 1/1/1/0. Secrets:
  `AUTH_ENABLED` present, `AUTH_SIGNUP_MODE` absent, `BETTER_AUTH_*` present, OAuth unset.

## 5. Production 0048 pre-state (read-only D1 introspection)
- `sqlite_master` for the 0048 objects: ONLY `workspace_projects` (table) exists. **`workspaces` absent,
  `workspace_members` absent, all 5 indexes absent.**
- `pragma_table_info('workspace_projects')`: `id` + `user_key` present, **`workspace_id` ABSENT.**
- → Exactly the expected clean pre-state. No drift. (If any of these had already existed, this stage would
  STOP / report Option C — they did not.)

## 6. 0048 migration review (`migrations/0048_workspace_membership_foundation.sql`)
- `CREATE TABLE IF NOT EXISTS workspaces` + `CREATE TABLE IF NOT EXISTS workspace_members` (role/status/type
  `CHECK` constraints) + `ALTER TABLE workspace_projects ADD COLUMN workspace_id TEXT` (**NULLABLE**) + 5
  `CREATE INDEX IF NOT EXISTS`. No DROP/DELETE/TRUNCATE/UPDATE (none outside comments); no backfill; no
  mutation of existing `user_key` values; does not redefine the 0047 auth tables; no invite/audit
  implementation (docs-only future).
- ★ **Idempotency caveat (differs from 0047):** the two CREATEs and 5 indexes use `IF NOT EXISTS` (idempotent),
  but `ALTER TABLE … ADD COLUMN workspace_id` is **NOT idempotent** in SQLite/D1 — a second run errors with
  "duplicate column". So 0048 must be applied **exactly once**, gated on a pre-check that `workspace_id` is
  absent (confirmed absent in §5; re-confirm at apply time). Do NOT run an idempotency re-run (unlike Stage 224's 0047).

## 7. Local dry-run / verification results
- central-plane build pass · `workspace-membership` + `workspace-membership-migration` + auth tests **52/52** ·
  helper smoke 7/7 · route smoke 8/8 · dashboard build + tests 10/10 · `pnpm typecheck` 57/57 · `pnpm verify` green.

## 8. Future production apply command — DOCUMENTED, NOT EXECUTED
Run ONLY after `"Workspace membership schema production apply approved."` Targeted single-file execute
(mirrors the Stage 224 0047 apply that worked), from repo root:
```
WRANGLER_SEND_METRICS=false CI=1 \
  pnpm --filter @conclave-ai/central-plane exec \
  wrangler d1 execute conclave-ai --remote \
  --file=./migrations/0048_workspace_membership_foundation.sql
```
- `--file` is relative to the central-plane package dir (where `pnpm --filter … exec` runs). Target
  `conclave-ai` (`28be7ec4…`). **NOT** `wrangler d1 migrations apply`. No deploy, no backfill, no legacy row
  mutation, no auth/env/secret change, no user creation, no cleanup.

## 9. Future pre-apply checklist (Stage 252)
- Exact phrase `"Workspace membership schema production apply approved."` present.
- main HEAD `8203210`+; worktree clean; 0048 file unchanged from the reviewed version.
- Production baseline healthy: `/api/auth/ok` 200, sign-up 403, `/health` 200, D1 auth 1/1/1/0.
- Production 0048 pre-state: `workspaces` absent, `workspace_members` absent,
  `workspace_projects.workspace_id` absent, `user_key` present (re-confirm read-only at apply time).
- Targeted command confirmed; **ALTER ADD COLUMN idempotency caveat acknowledged** (apply once; no re-run).
- Rollback limitations acknowledged (§11).

## 10. Future post-apply verification plan (Stage 252, read-only)
- Schema: `workspaces` exists; `workspace_members` exists; `workspace_projects.workspace_id` exists +
  nullable; `workspace_projects.user_key` still exists; the 5 indexes exist.
- Data: `workspaces` count = 0; `workspace_members` count = 0; existing `workspace_projects` rows' `user_key`
  values unchanged (no rows updated); auth rows still 1/1/1/0.
- Runtime: `app.trysimsa.com/account` → 200; `/api/auth/ok` → 200; sign-up → 403 `signup_disabled`; `/health` → 200.
- Do not create workspaces/members, backfill, or claim projects.

## 11. Rollback / containment plan (D1 reality)
- If apply succeeds + runtime healthy: **no rollback** — leave the additive tables/column in place.
- If apply partially fails: capture the exact error + read-only schema state; **do NOT rerun blindly** (the
  ALTER is non-idempotent); prepare a custom forward-fix migration only after approval.
- If runtime breaks after an additive schema apply: unexpected (additive) — inspect; consider central-plane/
  dashboard rollback only if a deployed code path is implicated; do NOT drop tables/columns without an
  explicit destructive-migration approval.
- ★ **Rollback warning:** SQLite/D1 cannot safely `DROP COLUMN` in all cases; production schema rollback may
  require a forward-fix migration. **Do not promise reversible schema rollback.** No manual data cleanup
  without approval.

## 12. Risks / holds
| Risk | Mitigation |
|---|---|
| `ALTER ADD COLUMN` non-idempotency | Apply once; pre-check `workspace_id` absent; no idempotency re-run. |
| `workspaces`/`workspace_members` created before an ALTER failure (partial) | CREATEs are `IF NOT EXISTS` (safe to coexist); on failure, read-only inspect + forward-fix, don't blind-rerun. |
| Wrong DB target / wrong file path | Pin `conclave-ai`; `--file` relative to central-plane; confirm at apply time (Stage 224 precedent). |
| Accidental bulk `migrations apply --remote` | Forbidden; targeted single-file only. |
| Applying to local / wrong remote | `--remote conclave-ai` explicit; verify target echo. |
| Legacy `user_key` flow breakage | `user_key` untouched; `workspace_id` nullable; post-apply read-only re-check. |
| Indexes missing | Post-apply checks the 5 indexes exist. |
| Auth runtime drift | Post-apply asserts `/api/auth/ok` 200, sign-up 403. |
| Broad launch misconception | Schema-only; no endpoints/UI; broad launch stays blocked. |
| Schema-only until later code | No backfill/claim; feature inert until bridge/endpoint stages. |
| D1 rollback limits | Documented; forward-fix only; no reversibility promise. |

## 13. M&A / enterprise readiness note
Schema evolution treated as a controlled governance release: a single reviewed migration, read-only pre/post
checks, no legacy mutation, an explicit apply gate, documented (limited) rollback, and post-apply evidence —
the apply changes no user-facing behaviour (schema-only) and broad launch remains blocked.

## 14. Explicit non-actions (NONE performed)
No production D1 apply/mutation, no deploy, no destructive cleanup, no user creation, no sign-up/sign-in, no
auth rollback, no env/secret change, no `AUTH_SIGNUP_MODE` change, no OAuth, no DNS/domain, no CORS prod
change, no payment, no MCP/npm publish, no broad launch, no code change on main, no dogfood PR #121~130 change.

## 15. Recommendation / recommended next stage
**Option A — Workspace membership schema apply readiness complete; ready for explicit production apply
approval.** Production pre-state is exactly as expected (additive objects absent, `user_key` present), the
0048 migration is reviewed + additive, local verification passes, the targeted apply command is clear, and
the post-apply + rollback (with D1 limits + ALTER non-idempotency) are documented. **Recommended next stage:
Stage 252 — Workspace Membership Schema Production Apply Gate**, only after `"Workspace membership schema
production apply approved."`

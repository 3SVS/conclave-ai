# Stage 248 — Workspace Membership Schema Readiness Gate

Date: 2026-06-27 · Type: planning / readiness memo only. **No code, no PR, no deploy, no production D1 change.**

## 1. Approval phrase observed
`"Workspace membership schema readiness approved."` — present (direct). Authorizes a schema-design memo
ONLY. Does NOT authorize code, a PR, deploy, D1 migration/mutation, cleanup, new users, sign-up/sign-in,
auth rollback, env/secret change, `AUTH_SIGNUP_MODE` change, OAuth, DNS/CORS, payment, MCP/npm publish, or
broad/invite/workspace launch.

## 2. Branch / HEAD
- main `8f0edcc`; HEAD == origin/main; worktree clean. No deploy since Stage 246; no D1 mutation since Stage
  238; no env/secret change since Stage 244; `AUTH_ENABLED=true`; `AUTH_SIGNUP_MODE` unset.

## 3. Current production state
- Auth ACTIVE; public sign-up CLOSED (403); controlled `/account` UX live; workspace/project data scoped by
  `user_key`; no membership/roles/invite tables; broad launch blocked.

## 4. Production baseline checks (read-only)
- `app.trysimsa.com/account` → 200 (controlled UX, no public sign-up); `app/api/auth/ok` → 200 `{"ok":true}`;
  `app/api/auth/sign-up/email` → 403 `signup_disabled`; Worker `/health` → 200. D1 = 1/1/1/0.
- Secrets: `AUTH_ENABLED` present; `AUTH_SIGNUP_MODE` absent; `BETTER_AUTH_*` present; OAuth unset.

## 5. Existing schema / user_key inventory (from migrations)
- Auth-owned (0047, camelCase, Better Auth): `user`, `session`, `account`, `verification`.
- Product data (snake_case, `user_key`-scoped): `workspace_projects` (id TEXT PK = client `proj_…`,
  `user_key` NOT NULL indexed, title/idea/spec/items JSON, timestamps), `workspace_items`,
  `workspace_check_runs`, `workspace_fix_suggestions`, `workspace_pr_review_runs`, `workspace_pr_comments`,
  `workspace_project_repos`, `workspace_project_pull_requests`, `workspace_agent_workflow_records`,
  `workspace_agent_experiments` (+ candidates), `workspace_agent_benchmarks`,
  `workspace_evolution_action_packs`, `workspace_credit_*` (balances/ledger/topup), `workspace_usage_events`,
  `workspace_notifications`/`_settings`, `workspace_github_connections`, etc. (~30 `workspace_*` tables; ~16
  migrations reference `user_key`).
- Global/admin or unrelated subsystems (NOT membership-scoped): `installs`, `saas_*`, `gh_*`, `jobs`,
  `episodic_*`, `external_*`, `promoted_seeds`, `prompt_variant*`, `spawned_agent*`, `usage_meters`,
  `billing_orders`, `demo_rate_limit`, `telegram_links`, etc.
- **Findings:** `workspace_*` tables are `user_key`-scoped; child tables reference `project_id` (e.g.
  `workspace_project_repos.project_id`) and/or carry `user_key`. None reference an auth `user.id`. Access for
  child rows can inherit through the project's workspace. First membership migration should touch ONLY
  `workspace_projects` (the ownership anchor) + the two new tables; leave child + global/admin tables alone.

## 6. Target schema options
- **Option A — Additive minimal membership schema (RECOMMENDED).** New `workspaces` + `workspace_members`
  tables + a nullable `workspace_id` on `workspace_projects` (ADD COLUMN). Legacy `user_key` rows untouched;
  personal-workspace-per-user for future auth users; explicit claim later; minimal risk.
- **Option B — Full workspace cutover.** Require `workspace_id` on all projects + migrate legacy `user_key`
  rows. Higher risk; needs backup + claim flow first. Not recommended now.
- **Option C — Bridge-only (auth_user_id overlay, no membership tables).** Lower schema complexity but weak
  governance/M&A story; not a long-term foundation.

## 7. Recommended schema strategy
**Option A.** Add `workspaces` + `workspace_members`, and link projects via a nullable
`workspace_projects.workspace_id` (ADD COLUMN — D1/SQLite supports additive `ALTER TABLE ADD COLUMN`;
default NULL, legacy rows keep `user_key`). Prefer a direct nullable column over a link table because
`workspace_projects` has a single clean PK and project ownership is 1:1 with a workspace; child tables
inherit access through the project. Defer `workspace_invites` + `audit_events` to later stages.

## 8. Proposed table / field design (snake_case, repo convention; TEXT ids + TEXT timestamps)
```
workspaces:
  id                    TEXT PK            -- e.g. ws_<rand>
  name                  TEXT NOT NULL
  type                  TEXT NOT NULL      -- 'personal' | 'team'
  created_by_auth_user_id TEXT NOT NULL    -- → user(id) (Better Auth)
  legacy_user_key       TEXT               -- nullable; set when a personal ws is bound to a claimed user_key
  created_at            TEXT NOT NULL
  updated_at            TEXT NOT NULL
  archived_at           TEXT               -- nullable
  -- index: (created_by_auth_user_id), (legacy_user_key)

workspace_members:
  workspace_id          TEXT NOT NULL      -- → workspaces(id)
  auth_user_id          TEXT NOT NULL      -- → user(id)
  role                  TEXT NOT NULL      -- 'owner' | 'admin' | 'member' | 'viewer'
  status                TEXT NOT NULL      -- 'active' | 'invited' | 'removed'
  invited_by_auth_user_id TEXT             -- nullable
  joined_at             TEXT               -- nullable
  created_at            TEXT NOT NULL
  updated_at            TEXT NOT NULL
  -- PRIMARY KEY (workspace_id, auth_user_id); index (auth_user_id)

workspace_projects:  (ALTER, additive)
  + workspace_id        TEXT               -- nullable; NULL = legacy user_key-scoped (unchanged)
  -- index: (workspace_id)
```
Deferred (later stages):
```
workspace_invites:  id, workspace_id, email, role, token_hash, status, invited_by_auth_user_id, expires_at, accepted_at, created_at
audit_events:       id, workspace_id, project_id?, actor_auth_user_id?, actor_user_key?, action, target_type, target_id, metadata_json, created_at
```

## 9. Role semantics (initial)
- **owner:** manage workspace settings, manage members, transfer ownership, delete/archive workspace, manage
  project access, view audit.
- **admin:** invite/remove members (except owner), create/manage projects, manage sharing, view most audit.
- **member:** create/use projects (if workspace policy allows), run checks/fixes/reviews, view assigned/shared projects.
- **viewer:** read-only project visibility (optional later; not required for the first migration).
- **Unresolved (Bae decisions for Stage 249):** can `member` create projects? auto personal workspace per
  user? multiple owners allowed? can a sole owner leave? include `viewer` in first migration? default role for
  invited users (suggest `member`)?

## 10. Legacy userKey compatibility plan (non-destructive)
- Signed-out users keep using `user_key`. Existing legacy projects stay `user_key`-scoped (workspace_id NULL).
- Authenticated users do NOT auto-claim local `user_key` projects. Cross-device auto-merge forbidden. Project
  claim = explicit user action or admin-reviewed migration. Claim preserves rollback by leaving the original
  `user_key` reference intact. No legacy rows deleted in the first migration. No access granted merely because
  an auth email matches.

## 11. Claim / ownership transition plan (planning only — not implemented)
1. User signs in. 2. Dashboard detects local `user_key` projects. 3. Controlled prompt: "claim local projects
to this account/workspace". 4. User chooses target personal workspace. 5. Backend records a claim event.
6. Projects receive `workspace_id` (or a link row). 7. `audit_events` records actor auth user id + `user_key`
+ project ids + timestamp. 8. Rollback removes the link/claim while preserving legacy `user_key` rows.

## 12. Migration / readiness sequence (each separately approved)
- **Stage 249 — Workspace Membership Schema Code-Readiness PR:** add the D1 migration file (additive) +
  schema helpers/types + tests; NO production apply, NO deploy. (`"Workspace membership schema code readiness approved."`)
- **Stage 250 — Workspace Membership Schema Apply Readiness Gate:** plan the production D1 apply (backup /
  verification / rollback). Planning only.
- **Stage 251 — Workspace Membership Schema Production Apply Gate:** targeted production migration only
  (`d1 execute --remote --file`, NOT bulk `migrations apply`); no deploy unless separately approved.
- **Stage 252 — UserKey → Auth User Bridge Code-Readiness PR:** non-breaking overlay; preserve `user_key`; no auto-claim.
- **Stage 253 — Controlled Project Claim UX Readiness Gate:** plan the explicit claim flow.
- **Stage 254 — Invite / Share Permission Model Readiness Gate:** invite/share semantics + role inheritance.

## 13. Production D1 migration safety requirements (for any future apply)
- Targeted single-file migration only; **NO bulk `wrangler d1 migrations apply --remote`** (Stage 223
  warning). Local/dry-run apply first. `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`; the
  `ALTER TABLE … ADD COLUMN` for `workspace_id` is additive (D1/SQLite-supported) but NOT idempotent — guard
  by checking column absence first (or accept the error on re-run). Read-only pre/post checks (table/index/
  column existence). **No legacy row mutation, no data backfill** in the first migration. Document rollback
  noting D1 schema-rollback limits (DROP the new tables / drop the added column is destructive — only the new
  additive objects, never legacy data).

## 14. Stage 249 PR acceptance criteria
- A migration file with **additive schema only** (`workspaces`, `workspace_members`, `workspace_projects.workspace_id`).
- No production apply, no deploy. Tests for migration shape (additive-only; no DROP/destructive; references
  correct). Role types/helpers (pure). No endpoint behaviour change unless explicitly scoped. No forced auth
  gate. No `user_key` migration. No invite implementation. Docs explaining legacy compatibility. Local verification green.

## 15. Risks / holds
- Accidental destructive migration → additive-only + safety test + targeted apply. `workspace_id` nullability
  mistakes → keep nullable, default NULL. Breaking legacy `user_key` flows → no ALTER of `user_key`; child
  tables untouched. Auto-claim / account-takeover → explicit confirmed claim only. Cross-device merge confusion
  → no auto-link. Insufficient audit fields → `audit_events` shape drafted (deferred but planned). Too many
  roles too early → 4 roles, viewer optional. Invite before membership stable → sequenced after. Public launch
  before ownership → blocked. D1 rollback limits → documented. M&A: identity not tied to permissions/audit →
  this sequence wires it.

## 16. M&A / enterprise readiness note
This is where Simsa becomes a governance platform: auth user → workspace membership → project ownership →
permissions → audit. The recommended additive schema introduces that backbone WITHOUT migrating legacy data
or breaking the anonymous `user_key` flow — each step gated, additive, reversible, and broad-launch-blocked
until membership + permissions + audit are real.

## 17. Explicit non-actions (NONE performed)
No code, no PR, no deploy, no production D1 migration/mutation, no destructive cleanup, no user creation, no
sign-up/sign-in, no auth rollback, no env/secret change, no `AUTH_SIGNUP_MODE` change, no OAuth, no DNS/domain,
no CORS prod change, no payment, no MCP/npm publish, no broad launch, no code change on main, no dogfood PR
#121~130 change.

## 18. Recommendation / recommended next stage
**Option A — Workspace membership schema readiness complete; proceed to schema code-readiness PR.** The
existing `user_key` scope is understood, the additive strategy (`workspaces` + `workspace_members` + nullable
`workspace_projects.workspace_id`) is clear, role semantics are clear enough for a first PR (with a few
flagged Bae decisions), legacy compatibility is non-destructive, and migration-safety requirements are
defined. **Recommended next stage: Stage 249 — Workspace Membership Schema Code-Readiness PR**, only after
`"Workspace membership schema code readiness approved."` Broad user-facing launch remains blocked.

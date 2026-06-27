# Stage 253 — Workspace Membership Schema Post-Apply Observation / Bridge Readiness Gate

Date: 2026-06-28 · Type: observation + planning/readiness memo only. **No code / PR / deploy / D1 mutation.**

## 1. Approval phrase observed
`"Workspace membership post-apply bridge readiness approved."` — present (direct). Authorizes read-only
observation + a bridge-readiness memo ONLY. Does NOT authorize code, a PR, deploy, D1 schema/data mutation,
workspace/member row creation, project claim, userKey migration, cleanup, new users, sign-up/sign-in, auth
rollback, env/secret change, `AUTH_SIGNUP_MODE` change, OAuth, DNS/CORS, payment, MCP/npm publish, or broad/
invite/workspace launch.

## 2. Branch / HEAD
- main `8203210`; HEAD == origin/main; worktree clean. 0048 on main + applied once (Stage 252). No D1 mutation
  since Stage 252; no deploy since Stage 246; no env/secret change since Stage 244; `AUTH_ENABLED=true`;
  `AUTH_SIGNUP_MODE` unset.

## 3. Current production state
- Auth ACTIVE; public sign-up CLOSED (403); controlled `/account` live; workspace membership SCHEMA applied
  (empty); no bridge code; no workspace/member rows; broad launch blocked.

## 4. Post-apply runtime observation (read-only)
- `app.trysimsa.com/account` → 200; `app/api/auth/ok` → 200 `{"ok":true}`; `app/api/auth/sign-up/email` →
  403 `signup_disabled`; Worker `/health` → 200. Unchanged.

## 5. Post-apply schema observation (read-only)
- `workspaces` table exists; `workspace_members` table exists; the 5 new indexes exist (within 39
  `idx_workspace%` total); `workspace_projects.workspace_id` exists (nullable); `workspace_projects.user_key`
  still exists; Better Auth 0047 tables (`user`/`session`/`account`/`verification`) intact. No drift.

## 6. Post-apply data drift check (read-only)
- `workspaces` = 0; `workspace_members` = 0; `workspace_projects` = 3 (unchanged); `workspace_id` IS NULL for
  3/3 legacy rows; `user_key` retained 3/3; auth = 1/1/1/0. No runtime-created workspace/member rows; legacy
  data untouched.

## 7. Env / secret / auth metadata (value-free)
- `AUTH_ENABLED` present (ACTIVE); `AUTH_SIGNUP_MODE` absent; `BETTER_AUTH_SECRET` / `BETTER_AUTH_BASE_URL` /
  `BETTER_AUTH_TRUSTED_ORIGINS` present; OAuth unset.

## 8. Bridge readiness code-surface findings
- **Dashboard auth session read:** already live — `getAuthSession` (`src/lib/auth-client.mjs`, GET
  `/api/auth/get-session`) returns the session or null. `getUserKey` (`workflow-store.ts:90`, localStorage
  `uk_…`) is the legacy scope. Both are available bridge inputs.
- **Central-plane auth session read (server-side):** build the runtime via `createBetterAuthRuntime(c.env)`
  and call `auth.api.getSession({ headers: c.req.raw.headers })` (Better Auth's documented server API). The
  existing route only delegates `auth.handler` — a bridge endpoint would add a session read.
- **Workspace API naming convention:** `/workspace/<resource>` (e.g. `/workspace/agent-workflows`,
  `/workspace/admin/...`). A bridge endpoint fits as **`/workspace/membership/me`**.
- **APIs requiring `user_key` today:** all `workspace_*` reads/writes (projects, items, runs, benchmarks,
  experiments, workflows, credits, usage). These should remain `user_key`-compatible.
- **First table to receive bridge behaviour:** `workspaces` + `workspace_members` (create a personal
  workspace + owner row) — NOT `workspace_projects` (no claim in the first bridge).
- **Must remain untouched in the first bridge PR:** `workspace_projects` (incl. `user_key` + `workspace_id`),
  all legacy `user_key` flows, auth route/gate, sign-up guard, AUTH_* env.

## 9. Bridge options
- **Option A — personal workspace on first authenticated visit:** an authenticated `/workspace/membership/me`
  (or `/account` call) creates a personal `workspace` + owner `workspace_members` row if none exists. Does
  not touch `workspace_projects`; no auto-claim. Good near-term foundation; requires careful create-once tests.
- **Option B — read-only bridge endpoint (no creation):** `/workspace/membership/me` reports the current
  auth/userKey state + whether a personal workspace exists (initially none). No rows created. Safest immediate PR.
- **Option C — full claim bridge:** authenticated user claims local `user_key` projects into a personal
  workspace (creates workspace + UPDATEs `workspace_projects.workspace_id`). Higher risk. NOT the first PR.

## 10. Recommended bridge strategy
**Option B first** (read-only `/workspace/membership/me`), then Option A (personal-workspace creation) as its
own gated stage once the read path is proven. Rationale: keeps the next code-readiness PR free of any
production write logic; the schema is already applied + empty, so a read-only bridge is the safest first wiring.
NO automatic legacy project claim in the first (or second) bridge PR — claim is Stage 259.

## 11. Stage 254 scope recommendation
**Stage 254 — Auth User Workspace Bridge Code-Readiness PR** (`"Auth user workspace bridge code readiness
approved."`): a **read-only** central-plane endpoint `GET /workspace/membership/me` that reports
`{ authenticated, authUserId?, email?, userKey?, hasPersonalWorkspace:false, workspaces:[] }` from the Better
Auth session (server-side `auth.api.getSession`) + the client-supplied `user_key`, WITHOUT creating any rows.
Optional dashboard wiring on `/account` to display it. No `workspace_projects` change; no claim; no migration.

## 12. Stage 254 PR acceptance criteria
- Code-readiness branch only; no prod deploy; no prod D1 mutation; no new migration. Read-only endpoint/helper
  bridging auth-user context → workspace readiness. Legacy `user_key` preserved; signed-out compatibility;
  authenticated smoke-user handling; **no automatic claim; no `workspace_projects` UPDATE**; no invite/share;
  no broad-launch copy. Tests for signed-out/signed-in + legacy-flow-unchanged. Build/typecheck/verify green; docs updated.

## 13. Future production rollout path (each separately approved)
254 Bridge code-readiness PR → 255 PR merge gate → 256 bridge deploy readiness → 257 bridge production deploy →
258 controlled internal workspace smoke → 259 project claim readiness → 260 invite/share permission model. All
production deploy/data-mutation gates remain separate.

## 14. Launch blocker update
**Done:** auth API active · public sign-up closed · `/account` controlled UX live · **workspace schema applied**.
**Still blocked:** auth-user→workspace bridge (254) · personal workspace creation/read (254/A) · membership
runtime enforcement · userKey→auth-user claim flow (259) · project ownership claim · invite/share (260) ·
`audit_events` schema/runtime · admin/support visibility · smoke-account cleanup policy · privacy/account
deletion · billing policy · rate-limiting/abuse review · public launch copy/onboarding.

## 15. Rollback / containment criteria
- Do NOT rollback 0048 if runtime is healthy; do NOT rerun 0048 (non-idempotent ALTER). If schema drift
  appears: read-only inspect + forward-fix only after approval. If runtime breaks: investigate deploy/runtime
  first (0048 is additive). If D1 data changes unexpectedly: preserve evidence, stop, no destructive cleanup
  without approval. D1 schema rollback is limited — prefer forward-fix.

## 16. Risks / holds
- Schema exists but no runtime bridge yet (inert). Future bridge: accidental workspace-row creation (mitigate:
  read-only first / create-once tests); project-claim/account-takeover (explicit confirmed claim only,
  Stage 259); cross-device auto-merge (forbidden); ambiguous personal-workspace creation timing (decide in
  Stage 254/A); userKey compatibility regression (legacy flows untouched + tested); `workspace_id` nullable
  handling; missing audit trail for future claims (audit stage); broad launch before enforcement; invite/share
  before role enforcement; D1 rollback limits; smoke account still present (cleanup policy gate).

## 17. M&A / enterprise readiness note
The schema milestone is now a controlled governance roadmap: legacy `user_key` scope → authenticated personal
workspace → explicit project claim → role-based membership → invite/share → audit. The next step is a
read-only bridge (no production writes), keeping every mutation behind its own gate — additive, reversible
(within D1 limits), and broad-launch-blocked.

## 18. Explicit non-actions (NONE performed)
No code, no PR, no deploy, no production D1 schema/data mutation, no workspace/member row creation, no project
claim, no userKey migration, no destructive cleanup, no user creation, no sign-up/sign-in, no auth rollback,
no env/secret change, no `AUTH_SIGNUP_MODE` change, no OAuth, no DNS/domain, no CORS prod change, no payment,
no MCP/npm publish, no broad launch, no code change on main, no dogfood PR #121~130 change.

## 19. Recommendation / recommended next stage
**Option A — Post-apply observation clean; proceed to auth user workspace bridge code-readiness PR.** The 0048
schema is present + stable, runtime is healthy (sign-up 403, auth 200), D1 data is exactly as expected (0
workspace/member rows, 3 legacy projects untouched), and the bridge surfaces (session read client + server,
`/workspace/membership/me` naming) are understood with a clear read-only-first strategy.
**Recommended next stage: Stage 254 — Auth User Workspace Bridge Code-Readiness PR**, only after
`"Auth user workspace bridge code readiness approved."` Broad user-facing launch remains blocked.

# Stage 247 — Account UX Post-Deploy Observation / Workspace Membership Readiness Gate

Date: 2026-06-27 · Type: observation + planning/readiness memo only. **No deploy / D1 mutation / cleanup / launch.**

## 1. Approval phrase observed
`"Account UX post-deploy workspace readiness approved."` — present (direct). Authorizes read-only
observation + a workspace-readiness memo ONLY. Does NOT authorize deploy, D1 migration/mutation, cleanup,
new users, successful sign-up/sign-in, auth rollback, env/secret change, `AUTH_SIGNUP_MODE` change, OAuth,
DNS/CORS, payment, MCP/npm publish, or broad/invite/workspace launch.

## 2. Branch / HEAD
- main `8f0edcc`; HEAD == origin/main; worktree clean. central-plane Worker `8f0edcc` (sign-up guard live);
  dashboard prod `dpl_AfxYFmY6xU6sC5enA58bVZrngcVQ` (/account controlled UX live). No D1 mutation since Stage
  238; no env/secret change since Stage 244; `AUTH_ENABLED=true`; `AUTH_SIGNUP_MODE` unset.

## 3. Current production state
- Auth backend ACTIVE; public sign-up CLOSED (403); controlled `/account` UX live; workspace membership not
  implemented; `userKey` = browser-local project/workspace scope; invite/share not implemented; broad launch blocked.

## 4. Post-deploy production observation (read-only)
- `app.trysimsa.com/` → 307; `/account` → 200; `app/api/auth/ok` → 200 `{"ok":true}`; `app/api/auth/sign-up/email`
  → 403 `signup_disabled`; Worker `/api/auth/sign-up/email` → 403; Worker `/health` → 200.

## 5. Live /account UX observation
- Served HTML shows the controlled section: "Authentication" + "Controlled preview — not a public sign-up.
  Sign-in is invite/internal only for now." NO sign-up / create-account / register affordance; no forced
  auth gate; no project-ownership claim; no userKey-migration prompt; no invite/share; no OAuth UI; no
  billing; no broad-launch copy. Loading `/account` triggers no auth mutation.

## 6. D1 drift check (read-only)
- auth objects = **7**; user/session/account/verification = **1/1/1/0** — unchanged. Loading `/account` and
  the blocked sign-up probes created no rows. Only the Stage 238 smoke account exists.

## 7. Env / secret / auth metadata (value-free)
- `AUTH_ENABLED` present (ACTIVE); `AUTH_SIGNUP_MODE` absent; `BETTER_AUTH_SECRET` / `BETTER_AUTH_BASE_URL` /
  `BETTER_AUTH_TRUSTED_ORIGINS` present; OAuth unset. No values revealed; nothing changed.

## 8. Workspace / userKey surface findings (from code)
- **16 migrations reference `user_key`** — `workspace_projects`, agent workflow records, experiments,
  benchmarks, builder_pack_outcomes, credit/usage tables — all client-`user_key`-scoped.
- **No `workspace_members` / roles / invite / share table**; no owner/admin/member role model (admin =
  `x-admin-key` header). Workspace/project rows tie to `user_key`, NOT an auth user id.
- **Auth route (`routes/auth-spike.ts`) touches `user_key`/workspace = 0** — the Better Auth `user/session/
  account/verification` (0047) tables are fully separate. Latest migration = `0047` (no membership migration exists).
- **`getUserKey()`** (dashboard `workflow-store.ts`) generates `uk_<base36 time><random>` in `localStorage`
  → anonymous, browser-bound, NOT cross-device. Every workspace dashboard flow + `*-api.ts` call uses it.
- **Endpoints needing auth-user identity later:** workspace/project ownership, admin, audit. **Should stay
  legacy-userKey-compatible:** existing read/write of `user_key`-scoped data (no break on sign-out).
- **Bridgeable without schema now:** auth-identity overlay in the dashboard (already live read-only). Adding
  real membership/ownership requires schema (`workspace`, `workspace_members`, project ownership).

## 9. Workspace membership readiness model (planning only)
- A personal workspace per authenticated user. New tables: `workspace` (id, owner_user_id, name, created_at),
  `workspace_members` (workspace_id, user_id, role, created_at), and project ownership by `workspace_id`
  (additive, alongside legacy `user_key`). Roles: **owner · admin · member · viewer** (viewer later).
- Project belongs to a workspace. Legacy `user_key` projects remain untouched until an explicit claim. A
  signed-in user can create new workspace/project after the bridge lands. Invite/share attaches to
  workspace/project (not raw `user_key`). Audit logs record auth user id where available.

## 10. userKey → auth-user bridge plan (non-destructive)
- Keep `user_key` as the legacy/anonymous scope; add an auth-identity overlay. Do NOT auto-merge cross-device
  projects; do NOT auto-claim `user_key` projects just because a user is signed in; introduce an explicit
  claim flow later; rollback = leave `user_key` data unchanged; ownership transfer requires explicit user
  action or admin-reviewed migration.
- **Signed-out users:** unchanged — `user_key`-scoped local projects, no auth required.
- **Signed-in users with existing local `user_key` projects:** see their projects via `user_key` as before;
  a future explicit claim links the `user_key` scope to their account (with confirmation).
- **Different browser/device:** a new `user_key` (different scope); no auto-link. Account identity is the same
  (auth), but local project scope differs until claim/sync is designed.
- **Must NOT auto-link:** any `user_key` scope to an auth user without explicit confirmation.
- **Audit:** record actor auth user id + the claimed `user_key` + timestamp on any ownership assignment.

## 11. Next implementation sequence (each separately approved)
- **Stage 248 — Workspace Membership Schema Readiness Gate** — design `workspace`/`workspace_members`/roles/
  ownership/audit; planning only, no production apply. (`"Workspace membership schema readiness approved."`)
- **Stage 249 — Workspace Membership Schema Code-Readiness PR** — migrations + code on a branch; tests only; no prod apply.
- **Stage 250 — UserKey → Auth User Bridge Code-Readiness PR** — additive overlay; preserve legacy `user_key`; no destructive migration.
- **Stage 251 — Invite / Share Permission Model Readiness Gate** — invite/share semantics + role inheritance.
- **Stage 252 — Controlled Internal Workspace Deploy Gate** — deploy only after explicit approval; still not broad launch.
- Alternative if more urgent: **Stage 248 — Smoke Account Cleanup Policy Gate** (handle the smoke account first).

## 12. Launch blocker matrix
| Area | Current state | Before controlled internal use | Before public launch | Risk if skipped | Stage |
|---|---|---|---|---|---|
| Auth API | active (200) | ✓ | ✓ | — | — |
| Public sign-up exposure | CLOSED (403) | ✓ | ✓ | — | — |
| Account UX | controlled live | ✓ | full account UX | — | — |
| Session/logout UX | status + sign-out live | basic | full | stuck sessions | 250 |
| Workspace membership | none (userKey) | schema + roles | required | no team/ownership | 248/249 |
| userKey bridge | none | overlay | claim flow | ownership ambiguity | 250 |
| Project ownership | userKey only | workspace-owned | required | unclear access | 249 |
| Invite/share perms | none | optional | required | unsafe sharing | 251 |
| Audit logs (actor) | userKey only | recommended | required | weak governance | 249/250 |
| Admin/support controls | x-admin-key only | recommended | required | can't support users | 248 |
| Smoke account cleanup | 1 row remains | policy decided | cleaned/labeled | test data in prod | cleanup gate |
| Privacy/account deletion | none | n/a | required | compliance | 251+ |
| Billing | decoupled | ok | define if paid | — | later |
| MCP/public exposure | unpublished | ok | reassess | premature | later |
| Rate limiting / abuse | Worker defaults | review auth endpoints | hardened | sign-in/abuse risk | 248/250 |

## 13. Risks / holds
- Account UX live may be mistaken for launch → controlled-preview copy, no sign-up affordance.
- Sign-up disabled but auth API active; direct sign-in surface exists for existing users (only the smoke
  account today) → acceptable pre-launch; monitor D1 row counts.
- Smoke session remains in production → cleanup-policy gate.
- No workspace membership; userKey ownership ambiguity; cross-device confusion; project-claim/account-takeover
  risk → soft-bridge + explicit confirmed claim only (Stage 250).
- Invite/share before roles → sequence 248/249 before 251.
- No audit trail for governance; no admin/support controls; no privacy/account-deletion → gated above.
- Broad launch before permissions → blocked until §12 satisfied.
- M&A: identity exists but is not yet tied to workspace governance → 248–250 wire it.

## 14. Rollback / containment criteria
- **Dashboard rollback** (to `dpl_6AGwib8CD9mU4utSXko4yUnJoZFf`) ONLY if `/account` exposes public sign-up,
  creates rows, breaks dashboard load, breaks userKey/project flows, or shows unsafe launch copy.
- **central-plane Worker rollback** (to `043331b`) ONLY if `/api/auth/ok` breaks, sign-up reopens via Worker
  drift, or `/health` fails.
- **Auth disable** (`wrangler secret delete AUTH_ENABLED`) ONLY if auth itself is unsafe / repeated 5xx / row
  drift / uncontrollable sign-up exposure.
- Not executed — all checks clean.

## 15. M&A / enterprise readiness note
Simsa now has a live, controlled identity surface with public sign-up closed and no governance coupling yet.
The roadmap (membership schema → userKey bridge → permissions → audit → controlled internal deploy) converts
this into enterprise governance with each step gated, additive, and reversible — broad launch stays blocked
behind a concrete, auditable checklist.

## 16. Explicit non-actions (NONE performed)
No deploy, no central-plane/dashboard deploy, no D1 migration/mutation, no destructive cleanup, no user
creation, no sign-up/sign-in, no auth rollback, no env/secret change, no `AUTH_SIGNUP_MODE` change, no OAuth,
no DNS/domain, no CORS prod change, no payment, no MCP/npm publish, no broad launch, no code change on main,
no dogfood PR #121~130 change.

## 17. Recommendation / recommended next stage
**Option A — Post-deploy account UX observation clean; proceed to workspace membership schema readiness.**
`/account` controlled UX is safe and live, sign-up remains 403, `/api/auth/ok` remains 200, D1 stays 1/1/1/0,
and the workspace/userKey surfaces are understood with a clear non-destructive bridge path.
**Recommended next stage: Stage 248 — Workspace Membership Schema Readiness Gate**, only after
`"Workspace membership schema readiness approved."` Broad user-facing launch remains blocked.

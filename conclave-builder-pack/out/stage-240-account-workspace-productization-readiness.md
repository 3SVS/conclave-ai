# Stage 240 — Account UX / Workspace Membership Readiness Gate

Date: 2026-06-27 · Type: planning / readiness memo only. **No code, no deploy, no production mutation.**

## 1. Approval phrase observed
`"Account workspace productization readiness approved."` — present (direct). Authorizes a readiness memo
ONLY. Does NOT authorize deploy, D1 migration/mutation, smoke-account cleanup, new users, OAuth, payment,
MCP/npm publish, broad launch, destructive changes, `AUTH_ENABLED` change, secret rotation, or DNS/CORS
change. Only read-only checks + repo inspection were performed.

## 2. Branch / HEAD
- main `e8d42cc`; HEAD == origin/main; worktree clean. No deploy since Stage 235; no D1 schema mutation
  since Stage 224; no auth change since Stage 238; Stage 239 observation is the latest production evidence.

## 3. Current production auth state
- `AUTH_ENABLED=true` (ACTIVE). `app.trysimsa.com/api/auth/ok` → 200 `{"ok":true}`; Worker `/health` → 200.
  Topology env set to `https://app.trysimsa.com`; OAuth unset.

## 4. Production baseline checks (read-only)
- `app.trysimsa.com/api/auth/ok` → 200 `{"ok":true}`; Worker `/health` → 200.
- D1: user=1, account=1, session=1, verification=0 — only the marked smoke account
  (`simsa-auth-smoke-20260626172247@example.com`). No drift.

## 5. Dashboard auth / product surface findings
- **Better Auth client: NOT imported.** `better-auth` is NOT a dashboard dependency; no `createAuthClient`
  / `signIn` / `signUp` / `useSession`.
- **Sign-in/Sign-up UI: NONE. Logout UI: NONE. Session read: NONE.** The live auth route has no dashboard consumer.
- **`/account`: local stub** (Stage 170) — `account-preferences.mjs` over `localStorage` (display name +
  locale); connected-accounts/delete are placeholders; no real auth/session data.
- **userKey:** `getUserKey()` in `src/lib/workflow-store.ts` generates `uk_<base36 time><random>` and stores
  it in `localStorage` (`USER_KEY_STORAGE`). → **anonymous, browser-bound, NOT stable across browsers/devices.**
- **userKey flow:** passed as the tenant key into central-plane via `src/lib/*-api.ts` calls (workspace,
  benchmark, experiment, workflow, admin, credits). Essentially every workspace feature assumes this
  anonymous/local userKey.

## 6. Central-plane user / workspace / project model findings
- **16 migrations reference `user_key`** — `workspace_projects`, agent workflow records, experiments (+
  candidates), benchmarks, builder_pack_outcomes, credit/usage tables, etc. are all keyed by client `user_key`.
- **No membership table; no owner/admin/member role model; no invite/share model.** (The only `role` column
  is in `workspace_agent_experiments_candidates` — an agent role like builder/reviewer, NOT auth membership.)
- **Workspace/project rows are tied to `user_key`, NOT to an auth user id.** Admin access is a separate
  `x-admin-key` header, not a user role.
- **The Better Auth tables (0047: `user`/`session`/`account`/`verification`) are fully separate** — the
  `/api/auth/*` route does not touch `user_key`/workspace at all.
- **Schema changes required later:** `workspace`/`workspace_members` (+roles), project ownership by auth
  user id (or a `user_key → user_id` link), invite/share tables.
- **Bridgeable without schema now:** overlay an authenticated user identity in the dashboard alongside the
  existing `user_key`, without changing how data is scoped yet.

## 7. Identity transition options
- **Option A — Soft bridge (recommended near-term):** keep `user_key` as the legacy tenant/session key; add
  real auth identity alongside; where a signed-in user is present, associate it with the current `user_key`
  (display only); do not change data scoping or break existing projects; defer hard membership.
- **Option B — Hard cutover (NOT recommended now):** require an auth user for all access and migrate all
  `user_key`-owned data to auth user id. High risk; needs a migration + backup plan first.
- **Option C — Hybrid workspace model (best long-term):** add `workspace` + `workspace_members` (owner/
  admin/member roles) + project ownership; map each existing `user_key`'s projects into a default personal
  workspace. Requires schema + code stages.

## 8. Recommended identity strategy
**Option A now → Option C later.** Add an auth-identity overlay (account UI, session, logout) without
changing `user_key` scoping; introduce the hybrid workspace/membership schema as its own later, separately
approved stage with a backfill that maps `user_key` data into a default personal workspace. Avoid automatic
cross-device merging.

## 9. Account UX requirements (minimum before any broad launch)
Required: controlled sign-up/sign-in entry (or invite-only path) · current session display · logout ·
account email display · auth status indicator · disabled/maintenance fallback (handle 503 `auth_disabled`/
errors gracefully) · no accidental "public launch" copy · smoke/test accounts visibly separable in any admin
view. Later (optional): profile edit · password reset · email verification · OAuth login · avatar · team settings.

## 10. Workspace membership policy draft
Roles: **owner · admin · member · viewer** (viewer optional later). Define: who can create a workspace
(any authenticated user → one personal workspace by default); migrated `user_key` projects are owned by the
claiming user's personal workspace; workspace exists implicitly before project creation (personal default);
project visibility defaults to workspace-private; invite/share attaches at workspace and/or project scope;
PR-review artifacts + builder packs inherit the project's access; audit logs record the acting auth user id
(not just `user_key`).

## 11. userKey → real-user transition plan
- `user_key` is anonymous + browser-bound + NOT stable cross-device. A different browser → a different
  `user_key` → a different data scope.
- Plan: keep the `user_key` flow intact; add auth identity as an **overlay** (no auto data move). Introduce
  an explicit **project claim / owner-assignment** flow later so a signed-in user can attach a legacy
  `user_key` scope to their account WITH confirmation. Never auto-link across devices, and never auto-merge
  two scopes without explicit user action. Rollback: the overlay is additive; if a mapping is wrong, unlink
  (no destructive change to `user_key` data).

## 12. Next implementation stage sequence (each separately approved)
- **Stage 241 — Account UX Code Readiness PR:** add the dashboard auth client (if needed) + account/session
  UI scaffold + logout; handle `auth_disabled`/errors; NO broad-launch copy; NO production deploy until separate approval.
- **Stage 242 — Workspace Membership Schema Readiness Gate:** design `workspace`/`workspace_members`/roles/
  ownership schema + migration plan only (no production apply unless separately approved).
- **Stage 243 — UserKey → Auth User Bridge Code Readiness PR:** additive identity overlay; preserve legacy
  `user_key`; no destructive migration.
- **Stage 244 — Invite / Share Permission Model Readiness Gate:** define project sharing + role rules.
- **Stage 245 — Controlled Internal Auth UX Deploy Gate:** deploy only after explicit approval; limited internal use only.
(Adjust ordering if a schema decision must precede the Account UX PR.)

## 13. Launch blocker matrix
| Area | Current state | Before internal use | Before public launch | Risk if skipped | Stage |
|---|---|---|---|---|---|
| Auth API | active (200) | ✓ done | ✓ | — | — |
| Account UI | none (stub) | session + logout + email | full account UX | users can't manage auth | 241 |
| Session/logout | none | required | required | stuck sessions | 241 |
| Workspace membership | userKey only | optional | required | no team/ownership model | 242 |
| userKey bridge | none | overlay only | claim flow | ownership ambiguity | 243 |
| Invite/share perms | none | optional | required | unsafe sharing | 244 |
| Audit log (actor=user) | userKey only | recommended | required | weak governance | 242/243 |
| Support/admin visibility | x-admin-key only | recommended | required | can't support users | 242 |
| Smoke account cleanup | 1 row remains | policy decided | cleaned/labeled | test data in prod | cleanup gate |
| Privacy/account deletion | none | n/a | required | compliance risk | 244+ |
| Billing coupling | none (decoupled) | ok | define if paid | — | later |
| MCP/public exposure | unpublished | ok | reassess | premature exposure | later |

## 14. Risks / holds
- Auth API is active without any UI → **direct API sign-up is publicly possible at `app.trysimsa.com/api/auth/*`**
  (rate-limited by Worker defaults, but open). Mitigate: decide invite-only vs open, add rate limiting /
  disabled fallback before promoting any UI; `AUTH_ENABLED` rollback remains instant.
- userKey/project ownership ambiguity · cross-device identity confusion · accidental account takeover via
  wrong mapping → soft bridge + explicit claim only.
- Invite/share before membership policy → sequence 242 before 244.
- Smoke account left in production → cleanup policy gate.
- No account-deletion/privacy handling · no admin/support controls · broad launch before logout/session UX
  → all gated above.
- M&A: auth exists but is not yet integrated into the governance/audit layer (actor identity is still
  `user_key`) → 242/243 wire real-user audit.

## 15. M&A / enterprise readiness note
Production auth is technically live and observably disciplined, but it is NOT a launched product surface:
no UI consumes it, data is still anonymous-`user_key`-scoped, and there is no membership/permission/audit
identity layer. The plan converts "auth active" into an enterprise productization roadmap (account UX →
membership schema → userKey bridge → permissions → controlled deploy) with each step gated and reversible.

## 16. Explicit non-actions (NONE performed)
No deploy, no production D1 mutation, no destructive cleanup, no user creation, no `AUTH_ENABLED` rollback,
no env/secret change, no OAuth, no DNS, no CORS prod change, no payment, no MCP/npm publish, no broad launch,
no code change on main, no dogfood PR #121~130 change.

## 17. Recommendation / recommended next stage
**Option A — Account/workspace productization readiness complete; proceed to Account UX code-readiness PR.**
Dashboard + central-plane surfaces are understood, the soft-bridge identity strategy is clear, account UX
requirements + membership draft + userKey transition + launch-blocker matrix are documented, and no
production safety issue blocks planning (auth is active + healthy + drift-free).
**Recommended next stage: Stage 241 — Account UX Code Readiness PR**, only after explicit approval to start a
code-readiness branch. Broad user-facing launch remains blocked behind §13. (Alternative first: a Smoke
Account Cleanup Policy gate, if Bae prefers to resolve the test row before UX work.)

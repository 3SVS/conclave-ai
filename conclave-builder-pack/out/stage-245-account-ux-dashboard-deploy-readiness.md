# Stage 245 — Account UX Dashboard Deploy Readiness Gate

Date: 2026-06-27 · Type: planning / readiness memo + runbook only. **Nothing deployed; production untouched.**

## 1. Approval phrase observed
`"Account UX dashboard deploy readiness approved."` — present (direct). Authorizes a readiness memo + deploy
runbook ONLY. Does NOT authorize dashboard/Vercel deploy, central-plane deploy, D1 migration/mutation,
cleanup, new users, auth rollback, env/secret change, `AUTH_SIGNUP_MODE` change, OAuth, DNS/CORS, payment,
MCP/npm publish, broad launch, invite/share, or workspace-membership launch. No deploy/mutation command was run.

## 2. Branch / HEAD
- main `8f0edcc`; HEAD == origin/main; worktree clean. central-plane Worker already deployed from `8f0edcc`
  (Stage 244 — sign-up guard live). Dashboard production still `dpl_6AGwib8CD9mU4utSXko4yUnJoZFf` (e8d42cc build).

## 3. Current production state
- `AUTH_ENABLED=true`; `AUTH_SIGNUP_MODE` unset. Auth API active; public sign-up CLOSED (403). Dashboard
  account UX NOT live yet. D1 = 1/1/1/0 (smoke account only). Workspace still userKey-based; no broad launch.

## 4. Production baseline checks (read-only)
- `app.trysimsa.com/api/auth/ok` → 200 `{"ok":true}`; `app.trysimsa.com/api/auth/sign-up/email` → 403
  `signup_disabled`; Worker `/api/auth/ok` → 200; `app.trysimsa.com/` → 307; `app.trysimsa.com/account` → 200
  (current = Stage 170 localStorage stub; no auth-preview section yet).
- D1: user/session/account/verification = 1/1/1/0. Secrets: `AUTH_ENABLED` + `BETTER_AUTH_*` present;
  `AUTH_SIGNUP_MODE` absent; OAuth unset.

## 5. Dashboard deploy surface findings
- Vercel project **`conclave-dashboard`** (`prj_mAOqO6RIHIQRYNfnfgpe4cMrg4j9`, `orgId team_9JrxlaW0a7Suwqtks3uS4KX6`),
  linked via `.vercel/project.json`. Root Directory = `apps/dashboard`; production domain `app.trysimsa.com`.
  Manual deploy (no `vercel.json`, no Actions auto-deploy). Deploy from repo root: `vercel deploy --prod --yes`.
- Affects dashboard/Vercel only — no central-plane deploy, no D1/env/secret/DNS change. Includes the Stage
  241 account UX from main; the `/api/auth/*` rewrite behaviour is unchanged (only the dashboard build version updates).
- ★ Delta vs the LIVE build (`e8d42cc` → `8f0edcc`, apps/dashboard) = **account UX only** (6 files, +222):
  `app/account/page.tsx`, `i18n/dictionary.mjs`+`.d.mts`, `lib/auth-client.mjs`+`.d.mts`, `test/auth-client.test.mjs`.
  No non-account-UX dashboard change → a clean, account-UX-only deploy.

## 6. Account UX behavior findings (on main `8f0edcc`)
- `/account` adds a controlled "Authentication (controlled preview)" section: read-only session status
  (loading / signed out / signed in as <email> / error) + sign-out when signed in (fail-safe fetch client
  over same-origin `/api/auth/*`). No public sign-up UI; no forced auth gate; "not a public sign-up" copy.
- No project-ownership claim, no userKey migration, no workspace-membership mutation, no invite/share UI, no
  OAuth UI, no billing coupling, no broad-launch copy. Existing dashboard flows remain userKey-based
  (`getUserKey`/`workflow-store.ts` unchanged).

## 7. Expected future live behavior (after the dashboard deploy)
- `app.trysimsa.com` loads/redirects normally; `/account` shows the controlled auth-status UI. With no
  session cookie present, it shows the signed-out/controlled-readiness state.
- Public sign-up stays unavailable (central-plane guard → 403 `signup_disabled`). `app/api/auth/ok` → 200;
  `app/api/auth/sign-up/email` → 403; Worker `/health` → 200; D1 stays 1/1/1/0; loading `/account` creates no
  user. Existing project/userKey flows still work; broad launch remains blocked.

## 8. Local verification results
- dashboard build pass · dashboard auth tests (auth-client + auth-rewrite) **10/10** · central-plane
  signup-policy + route guard tests **16/16** · route smoke **8/8** · `pnpm verify` green. (Full set:
  central-plane auth 46/46, smokes 7/7 + 8/8, dashboard total tests, typecheck 57/57.)

## 9. Future deploy command / workflow — DOCUMENTED, NOT EXECUTED
Run ONLY after `"Account UX dashboard production deploy approved."` Dashboard/Vercel only:
```
vercel deploy --prod --yes    # from repo root (.vercel → conclave-dashboard, Root Dir apps/dashboard)
```
- Ships main `8f0edcc` dashboard (account UX). NO central-plane deploy, NO D1 mutation, NO `AUTH_SIGNUP_MODE`/
  `AUTH_ENABLED`/secret/env change, NO OAuth, NO user creation, NO smoke cleanup, NO broad launch.

## 10. Future post-deploy verification plan
1. `app.trysimsa.com` → loads/redirects (307). 2. `app.trysimsa.com/account` → controlled account UI loads
   (no public sign-up UI, no forced gate, no userKey migration/claim). 3. `app/api/auth/ok` → 200. 4.
   `app/api/auth/sign-up/email` → 403 `signup_disabled`. 5. Worker `/api/auth/ok` → 200. 6. Worker
   `/api/auth/sign-up/email` → 403. 7. Worker `/health` → 200. 8. D1 = 1/1/1/0. 9. Existing userKey-based
   project flow still works (no auth requirement introduced). No successful sign-up; no user creation; no cleanup.

## 11. Rollback / containment plan
- If the dashboard breaks: `vercel rollback` to the previous `conclave-dashboard` production deployment
  (`dpl_6AGwib8CD9mU4utSXko4yUnJoZFf` / prior known-good). Do NOT roll back central-plane unless the auth API
  breaks independently. Keep `AUTH_ENABLED=true`, `AUTH_SIGNUP_MODE` unset; do NOT mutate D1.
- If `/account` exposes public sign-up or broad-launch copy: roll back the Vercel deployment; keep the
  central-plane sign-up guard active; do NOT change `AUTH_SIGNUP_MODE` without separate approval.
- If `/api/auth/sign-up/email` becomes open again: likely central-plane/env drift (not dashboard) — confirm
  `AUTH_SIGNUP_MODE` absent + deployed Worker SHA `8f0edcc`+; set `AUTH_SIGNUP_MODE=disabled` only under
  incident/separate approval. If D1 rows change unexpectedly: stop, investigate, do not delete rows.

## 12. Risks / holds
| Risk | Mitigation |
|---|---|
| Dashboard deploy mistaken for public auth launch | Account UX is controlled-preview (no sign-up UI / no gate / "not a public sign-up" copy); sign-up stays 403. |
| `/account` confuses users because sign-up is disabled | Copy states controlled/invite-internal; no sign-up affordance shown. |
| Smoke session cookie shows misleading "signed in" on an operator browser | The Stage 238 smoke used curl (no browser cookie persisted) → `/account` shows signed-out by default. |
| Sign-out UI behavior uncertainty | Fail-safe client (returns false on error, shows error copy); no destructive effect. |
| userKey flow accidentally broken | `getUserKey`/`workflow-store.ts`/`*-api.ts` unchanged (delta is account UX only). |
| Dashboard route/build regression | Account-UX-only delta; dashboard build + tests pass; rollback = Vercel previous deploy. |
| central-plane auth API still active | Intended; sign-up guarded; broad launch separate. |
| Sign-up disabled but no invite flow yet | invite_only/invite enforcement is a later stage. |
| No workspace membership connection yet | userKey bridge + membership are separate later stages. |
| Smoke account remains · privacy/account-deletion unresolved · broad launch blocked | Tracked; gated to later stages. |

## 13. M&A / enterprise readiness note
Turns the activated, exposure-closed auth backend into a controlled user-facing account surface — without
introducing workspace membership, invite/share, billing, or public launch. The deploy is account-UX-only,
reversible (Vercel rollback), and keeps sign-up closed; deployment and broad launch remain distinct, auditable gates.

## 14. Explicit non-actions (NONE performed)
No dashboard/Vercel deploy, no central-plane deploy, no D1 migration/mutation, no destructive cleanup, no
user creation, no auth rollback, no env/secret change, no `AUTH_SIGNUP_MODE` change, no OAuth, no DNS/domain,
no CORS prod change, no payment, no MCP/npm publish, no broad launch, no code change on main, no dogfood PR
#121~130 change.

## 15. Recommendation / recommended next stage
**Option A — Account UX dashboard deploy readiness complete; ready for explicit dashboard production deploy
approval.** Deploy surface is clear (`conclave-dashboard`, `vercel deploy --prod --yes` from repo root, Root
Dir `apps/dashboard`), account UX behaviour is controlled (no public sign-up / no forced gate / userKey
preserved), public sign-up remains 403, the delta is account-UX-only, local verification passes, and
post-deploy + rollback plans are concrete. Only the human deploy approval remains.
**Recommended next stage: Stage 246 — Account UX Dashboard Production Deploy Gate**, only after
`"Account UX dashboard production deploy approved."`

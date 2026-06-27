# Stage 242 — PR #172 Merge Gate / Main Sync / Post-Merge Verification

Date: 2026-06-27 · Type: merge + verification. No deploy / env / secret / D1 change. **Non-live.**

## 1. Approval phrase observed
`"PR #172 merge approved."` — present (direct, standalone). Authorizes merging PR #172 into main ONLY.
Does NOT authorize deploy, D1 migration/mutation, cleanup, new users, auth rollback, env/secret change,
OAuth, DNS/CORS, payment, MCP/npm publish, or broad launch.

## 2. PR #172 status before merge
- base `main`, head `feat/stage-241-account-ux-auth-exposure-guard`, latest commit `96f7af4`, OPEN,
  MERGEABLE, CLEAN. CI `typecheck-build (20)` + `(22)` both pass; no pending/failed.

## 3. Final diff summary
Exactly 12 files (5 new, 7 modified) under `apps/central-plane` + `apps/dashboard`:
- central-plane: `src/auth-signup-policy.ts` (A), `src/env.ts` (M), `src/routes/auth-spike.ts` (M),
  `scripts/smoke-auth-route-d1.mjs` (M), `test/auth-signup-policy.test.mjs` (A), `test/auth-spike-route.test.mjs` (M).
- dashboard: `src/lib/auth-client.mjs` (A) + `.d.mts` (A), `src/app/account/page.tsx` (M),
  `src/i18n/dictionary.mjs` (M) + `dictionary.d.mts` (M), `test/auth-client.test.mjs` (A).
- No `wrangler.toml` / migration / `.env` / secret / OAuth / DNS / CORS / Vercel change. No broad-launch
  copy, no forced auth gate, no userKey/project migration.

## 4. Guard behavior review (verified on main `8f0edcc`)
- `AUTH_SIGNUP_MODE` is **fail-closed default `disabled`**; `POST /api/auth/sign-up/*` → 403 `signup_disabled`
  unless mode is `open`. `invite_only` also blocks public sign-up (invite enforcement deferred — no false
  implication). `open` is explicit, never the default.
- Sign-in / `get-session` / sign-out are NOT blocked by the guard (tested). `/api/auth/ok` stays active when
  `AUTH_ENABLED=true`. `AUTH_ENABLED` remains the activation flag. No new production env is required for
  fail-closed blocking after deploy (unset → disabled).

## 5. Account UX review
- No public sign-up launch copy. `/account` shows a controlled auth-readiness section (loading / signed
  out / signed in as <email> / error) + sign-out when signed in (fetch-based client, fail-safe). No forced
  auth gate across the dashboard; no OAuth UI; no billing coupling; existing userKey + project flows
  unchanged; no workspace/project ownership claim.

## 6. Pre-merge verification results (PR branch `96f7af4`)
- dashboard build pass · dashboard auth tests 10/10 · central-plane build + auth tests (7 files incl.
  signup-policy) 46/46 · helper smoke 7/7 · route smoke 8/8 · `pnpm verify` green.

## 7. Merge result
PR #172 squash-merged → main. Merge commit `8f0edcc` "Stage 241 — Account UX auth exposure guard code
readiness", mergedAt 2026-06-27T07:16:55Z, state MERGED. Remote + local feature branch deleted.

## 8. main HEAD after merge
`8f0edcc9115167c11b67b475ac4e8f45e1adda0b`. HEAD == origin/main; tracked worktree clean.

## 9. Changed files confirmed on main
`src/auth-signup-policy.ts` + `src/lib/auth-client.mjs` present; `AUTH_SIGNUP_MODE` referenced in
`env.ts` + `routes/auth-spike.ts`. All 12 files on main.

## 10. Post-merge verification results (on main)
- central-plane build + auth tests **46/46** · dashboard build + tests **10/10** · helper smoke **7/7** ·
  route smoke **8/8** · `pnpm verify` green.

## 11. Production impact confirmation (live read-only)
- `app.trysimsa.com/api/auth/ok` → 200 `{"ok":true}`; Worker `/health` → 200; D1 user/session/account/
  verification = **1/1/1/0** (smoke account only). **Production UNCHANGED.** The sign-up guard is on main but
  NOT deployed — the live worker (`043331b`) still allows open public sign-up. Exposure is closed only on a
  future, separately-approved central-plane deploy.

## 12. M&A / enterprise readiness note
Merge advances Simsa from "auth API exposed" toward a "controlled identity surface": a fail-closed sign-up
policy and a controlled account UX are now on main, ready to ship — required before broad user-facing launch
or enterprise trust positioning. Deployment + the `AUTH_SIGNUP_MODE` value remain explicit, separate gates.

## 13. Rollback note
Additive + revertible: `git revert 8f0edcc` on a branch → PR. Production unaffected (not deployed). When
later deployed, the guard is env-reversible (`AUTH_SIGNUP_MODE=open`) and `AUTH_ENABLED` rollback remains.

## 14. Explicit non-actions (NONE performed)
No deploy, no central-plane/dashboard deploy, no production D1 mutation, no destructive cleanup, no user
creation, no auth rollback, no env/secret change, no OAuth, no DNS/domain, no CORS prod change, no payment,
no MCP/npm publish, no broad launch, no code change on main beyond the merge, no dogfood PR #121~130 change.

## 15. Recommended next stage
**Stage 243 — Auth Sign-up Guard Production Deploy Readiness Gate** (planning/readiness only). The next
deploy is a central-plane Worker deploy (not dashboard); it ships the fail-closed sign-up guard and closes
the production sign-up exposure. Readiness phrase: `"Auth sign-up guard deploy readiness approved."`; actual
deploy remains separate: `"Auth sign-up guard production deploy approved."` (with an `AUTH_SIGNUP_MODE` value decision).

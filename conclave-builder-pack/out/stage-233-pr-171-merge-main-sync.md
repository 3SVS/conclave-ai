# Stage 233 — PR #171 Merge Gate / Main Sync / Post-Merge Verification

Date: 2026-06-26 · Type: merge + verification. No deploy, no env/secret/D1/activation change. **Non-live.**

## 1. Approval phrase observed
`"PR #171 merge approved."` — present (direct, standalone). Authorizes merging PR #171 into main ONLY.
Does NOT authorize dashboard/Vercel deploy, central-plane deploy, `AUTH_ENABLED` activation, env/secret
change, production Vercel rewrite deploy, DNS, CORS prod, OAuth, production D1 mutation, payment, MCP/npm publish.

## 2. PR #171 status before merge
- base `main`, head `feat/stage-232-same-origin-auth-rewrite`, latest commit `7b9667c`, OPEN, MERGEABLE, CLEAN.

## 3. CI/check status before merge
- `typecheck-build (20)` → pass (3m17s); `typecheck-build (22)` → pass (3m14s); no pending/failed/cancelled.

## 4. Final diff summary
Exactly 5 files, all under `apps/dashboard` (1 modified, 4 new):
- `next.config.ts` (M), `src/lib/auth-rewrite.mjs` (A), `src/lib/auth-rewrite.d.mts` (A),
  `test/auth-rewrite.test.mjs` (A), `docs/auth-same-origin-rewrite.md` (A).
- Scope: `/api/auth/:path*` rewrite + server-side origin helper (`CENTRAL_PLANE_AUTH_ORIGIN`, default =
  documented production Worker origin `https://conclave-ai.seunghunbae.workers.dev`, non-secret/documented).
  No central-plane / `wrangler.toml` / migration / `.env` / secret / OAuth / DNS change. Rewrite scoped to
  `/api/auth/:path*` only — no shadowing (dashboard has no `/api/auth` handler). Missing/blank/invalid
  origin → fail-safe default (tested). Matches the Stage 232 report (no difference).

## 5. Pre-merge verification results (PR branch `7b9667c`)
- dashboard build pass · auth-rewrite tests 5/5 · central-plane build + auth tests (6 files) 38/38 ·
  `pnpm verify` (typecheck+build+lint) green.

## 6. Merge result
PR #171 squash-merged → main. Merge commit `e8d42cc` "Stage 232 — Same-origin auth rewrite code readiness",
mergedAt 2026-06-26T14:25:08Z, state MERGED. Remote + local feature branch deleted.

## 7. main HEAD after merge
`e8d42cc81e9309a79eebca6ec9d2059d65b8add7`. HEAD == origin/main; tracked worktree clean.

## 8. Changed files confirmed on main
The 5 dashboard files above present on main (`next.config.ts` carries `buildAuthRewrites` + `/api/auth/:path*`;
`src/lib/auth-rewrite.mjs` present).

## 9. Rewrite code-readiness review (on main)
- `next.config.ts` `async rewrites()` → `buildAuthRewrites(resolveCentralPlaneAuthOrigin(process.env))` →
  one rule `/api/auth/:path*` → `${origin}/api/auth/:path*`. Server-side origin only (not `NEXT_PUBLIC`).
  Fail-safe + scoped. Code-readiness only — NOT live until a dashboard deploy.

## 10. Central-plane auth invariant review
- Unchanged by this PR (dashboard-only). Worker route still: `AUTH_ENABLED` unset → 503 `auth_disabled`;
  no secret → `auth_not_configured`; no DB → `auth_db_unavailable`; all gates → handler. Auth tests 38/38.

## 11. Post-merge verification results (on main)
- dashboard build pass · auth-rewrite 5/5 · central-plane build + auth tests 38/38 · `pnpm verify` green.

## 12. Live production impact confirmation (read-only boundary check)
- `https://app.trysimsa.com/api/auth/ok` → **404** (rewrite NOT live — merge did not auto-deploy; dashboard
  deploys manually). UNCHANGED from Stage 231.
- Worker `https://conclave-ai.seunghunbae.workers.dev/api/auth/ok` → **503 `auth_disabled`** (unchanged).
- Worker `/health` → **200** (unchanged).
- → **Zero live behavior change.** The rewrite goes live only on a future, separately-approved dashboard deploy.

## 13. M&A / enterprise readiness note
Rollout discipline preserved: code-readiness first (merged, non-live), deploy later (separate gate),
activation last (separate gate). First-party auth routing is staged and auditable with no production exposure.

## 14. Rollback note
Additive + revertible: `git revert e8d42cc` on a branch → PR. Production unaffected (rewrite not deployed;
no env/activation). Nothing to roll back in production. (When later deployed, rewrite rollback = redeploy
dashboard without it; activation rollback = unset `AUTH_ENABLED`.)

## 15. Explicit non-actions (NONE performed)
No `AUTH_ENABLED` activation, no env/secret change, no dashboard/Vercel deploy, no central-plane deploy, no
production Vercel rewrite deploy, no production D1 mutation, no OAuth, no DNS/domain, no CORS prod change, no
live dashboard behavior change, no successful sign-up/sign-in, no payment/billing, no MCP/npm publish, no
code change on main beyond the merge, no dogfood PR #121~130 change.

## 16. Recommended next stage
**Stage 234 — Same-Origin Rewrite Deploy Readiness Gate** (planning/readiness only). The dashboard deploy
that makes the rewrite live (still auth-disabled) requires `"Auth same-origin rewrite deploy approved."`;
production auth activation remains separate (`"Production auth activation approved."`).

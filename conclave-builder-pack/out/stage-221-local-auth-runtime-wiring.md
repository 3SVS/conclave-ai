# Stage 221 — Local-only Auth Runtime Wiring

Date: 2026-06-26 · Branch `feat/stage-221-local-auth-runtime-wiring` · PR #169 (OPEN, not merged)

## 1. Approval phrase observed
`"Auth local runtime wiring branch approved."` — present (direct). Authorizes a LOCAL-only
implementation branch for gated auth runtime wiring. Does NOT authorize production migration,
deploy, OAuth, production env, CORS/Vercel/DNS, payment/billing, MCP/npm publish, or dashboard change.

## 2. Branch / HEAD
- Base: main `772c040`.
- Feature branch `feat/stage-221-local-auth-runtime-wiring`, pushed; PR #169 opened against main.
- Report committed to local checkpoint branch only (not pushed, not on main/PR).

## 3. Files changed (PR #169 — 10 files +1 deletion)
- `src/better-auth-spike.ts` — `resolveAuthRuntimeGate` + `createBetterAuthRuntime` (replaces stateless `createBetterAuthSpike`)
- `src/routes/auth-spike.ts` — gate-first 503 ladder → DB-backed handler
- `src/router.ts` — mount comment updated
- `src/better-auth-d1.ts` — stale doc comment corrected (helper is now wired behind gates)
- `test/better-auth-spike.test.mjs` — gate + runtime tests
- `test/auth-spike-route.test.mjs` — +`auth_db_unavailable` gate test
- `test/auth-route-gated-wiring.test.mjs` — NEW invariant guard (replaces `auth-route-unwired.test.mjs`)
- `test/auth-route-unwired.test.mjs` — DELETED (obsolete "0 refs" assertion; route is now wired)
- `scripts/smoke-auth-route-d1.mjs` — NEW route-level local smoke
- `scripts/smoke-better-auth-d1.mjs` — doc/message corrected (renamed symbol)
- `package.json` — `smoke:auth-route-d1` script

## 4. Route gating behavior (resolveAuthRuntimeGate)
- "disabled" → 503 `auth_disabled` · "not_configured" → 503 `auth_not_configured`
- "db_unavailable" → 503 `auth_db_unavailable` · "ready" → `createBetterAuthRuntime` → Better Auth handler
Runtime is constructed per-request, lazily, and ONLY when all gates pass.

## 5. Default disabled behavior
`AUTH_ENABLED` unset / `!= "true"` → 503 `auth_disabled`, no runtime constructed. Unchanged from
prior production behaviour. Verified via createApp() (unit + route smoke).

## 6. Missing secret behavior
`AUTH_ENABLED === "true"` + no `BETTER_AUTH_SECRET` → 503 `auth_not_configured`. Secret never echoed.

## 7. Missing DB behavior
`AUTH_ENABLED === "true"` + secret + no `env.DB` → 503 `auth_db_unavailable` (new explicit safe error;
no handler attempt, no 500-leak).

## 8. Local DB-backed route behavior
`AUTH_ENABLED === "true"` + secret + `env.DB` → through the real router: sign-up 200 → user +
credential account + session rows persisted in local D1 (0047 schema); sign-in 200.

## 9. Tests added/updated
- `better-auth-spike.test.mjs`: `resolveAuthRuntimeGate` mapping (disabled/not_configured/db_unavailable/ready),
  `createBetterAuthRuntime` null unless ready, builds only when all gates present.
- `auth-spike-route.test.mjs`: added the `auth_db_unavailable` case; secret-no-leak across all 503s.
- `auth-route-gated-wiring.test.mjs` (replaces `auth-route-unwired.test.mjs`): behavioural (default→auth_disabled,
  runtime null unless all gates) + structural (betterAuth constructed inside the function past the ready gate,
  never at import time; route checks the gate before constructing).

## 10. Smoke result
- `smoke:better-auth-d1` (helper-level) → 7/7 (exit 0, direct/in-package)
- `smoke:auth-route-d1` (route-level, NEW) → 8/8 (exit 0): default-disabled + db_unavailable + sign-up/sign-in persist
- Both use isolated in-memory D1 (persist:false, minimal D1-only config, no containers/DO), throwaway
  labelled secret, no network, no committed `.wrangler` state.

## 11. Verification result
- `pnpm --filter @conclave-ai/central-plane build` → pass
- central-plane full suite → **1210/1210**; auth subset (5 files) → 29/29
- `pnpm typecheck` (monorepo) → **57/57**
- `pnpm verify` (typecheck+build+lint) → green; pre-push hook verify passed

## 12. Production safety
No production deploy, no central-plane deploy, no production migration, no local migration apply
beyond the isolated in-memory smoke, no persistent local D1 state committed, no real secrets/tokens,
no `.env`, no `wrangler.toml`/binding change, no OAuth, no CORS/Vercel/DNS, no dashboard/live change,
no payment/billing, no MCP/npm publish. Production remains deploy `9b645af`; `AUTH_ENABLED` unset in prod.

## 13. Known issues
- Better Auth logs "Base URL is not set" — intentional: `baseURL` is not hardcoded (production cookie/CORS
  topology is a separate Stage 220 gate); locally the origin derives from the request. Functionally PASS.
- `pnpm --filter <pkg> run smoke:*` can crash on Windows (`0xC0000409`) during workerd teardown under
  pnpm's recursive runner — environmental, not a logic failure; run smokes directly / in-package.

## 14. Rollback plan
Additive + revertible. `git revert` the squash commit on a branch → PR. Production is unaffected
(route dormant: `AUTH_ENABLED` unset, no prod migration, no deploy). Nothing to roll back in production.

## 15. Out-of-scope confirmation
None performed: production deploy, payment/Stripe/billing, hosted execution, central-plane deploy,
production migration, MCP/npm publish, OAuth/token, domain/DNS, server-write-to-production,
persistence-to-production, Vercel rewrite, CORS-code change, live dashboard behavior, dogfood PRs #121~130.

## 16. Recommended next stage
**Stage 222 — PR Merge Gate for Stage 221**, only after `"PR #169 merge approved."` Production migration
and deploy remain separate, later gates (`"Production auth migration approved."`, `"Dashboard deploy approved."`).

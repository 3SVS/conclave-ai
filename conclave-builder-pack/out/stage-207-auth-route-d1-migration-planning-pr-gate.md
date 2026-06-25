# Stage 207 — Auth Route + D1 Migration Planning / PR Gate

**Date:** 2026-06-25
**Type:** planning + PR prep + review gate (no merge, no implementation, no migration, no deploy). **No route code, no auth handler wiring, no migration file/run, no OAuth, no Vercel rewrite, no CORS code, no production env, no `.env`, no DNS/domain, no deploy, no live-dashboard change, no token/secret. Stale dogfood PRs #121~130 not touched.**

## 1. Branch / HEAD
`docs/stage-207-auth-route-d1-migration-planning` @ **`6535b12`** (base `main` @ `c20a99f`). One
docs commit. Working tree clean.

## 2. Files changed (1, +163 / −0)
- `conclave-builder-pack/out/stage-207-auth-local-route-d1-migration-planning.md`
**Docs-only.** No `package.json`/lockfile, no route code, no auth handler, no migration, no `.sql`,
no CORS, no Vercel config, no env files, no dashboard change.

## 3. Planning summary
Plans the next executable slice for the Better Auth spike (now on main), grounded in the verified
baseline: **D1 binding `DB`** already in `wrangler.toml` (reuse `env.DB`); `router.ts` composes Hono
modules (`app.route("/", createXxxRoutes(...))`) so a future auth route = `createAuthSpikeRoutes()`
mounted the same way, **gated by `AUTH_ENABLED`** (503 `auth_disabled` when off); **`/api/auth/*`**
avoids the existing `/auth/github/callback`; next migration number = **`0047`**. Covers the route
plan, D1 migration draft plan (generator output human-reviewed, additive-only, `userKey` preserved),
D1 binding plan, env/cookie/CORS relationship (Stage 198 — no Vercel rewrite/CORS yet), test/safety/
rollback plans, and stop conditions.

## 4. Approval gate summary (exact, separate, non-transferable)
- Local migration draft → **"Local auth migration draft approved."**
- Local auth route / handler → **"Better Auth implementation approved."**
- Production migration → **"Production auth migration approved."**
- Deploy → **"Dashboard deploy approved."**
- Vercel rewrite / subdomain / DNS → a separate explicit approval.
**PR merge approval does NOT imply any of these.** Stage 208 executes only with at least one of the
first two phrases (one → that scope only; both → both; neither → planning continues).

## 5. Safety diff review
`git diff main...6535b12` = exactly the single planning doc; **non-doc changes = 0**. Confirmed
absent: `package.json`/lockfile changes · route code · auth handler code · migrations · `.sql` ·
CORS code · Vercel rewrites · env files · dashboard UI changes · secrets/tokens · deployment config.

## 6. Verification results
- `pnpm --filter @conclave-ai/central-plane build` — **ok**.
- `node --test … better-auth-spike.test.mjs` — **7/7 pass**.
- `pnpm typecheck` (monorepo) — **57/57**.
- `pre-push verify` — **passed**.

## 7. Push result
Pushed `docs/stage-207-auth-route-d1-migration-planning` → origin (new branch, **non-force**).
Pre-push `pnpm verify` passed.

## 8. PR number / URL
**PR #163** — https://github.com/3SVS/conclave-ai/pull/163

## 9. PR status
OPEN · base `main` · head `docs/stage-207-auth-route-d1-migration-planning` @ `6535b12` ·
**MERGEABLE** · mergeStateStatus **UNSTABLE** (CI `typecheck-build (20)/(22)` **pending** — just
triggered; not failing) · 1 file, +163 / −0. Docs-only scope.

## 10. Stage 207 decision — **Option A: planning ready for review**
Grounded planning + PR opened, verification green, docs-only, no safety blockers. **Not merged, no
implementation, no migration.**

## 11. Out-of-scope confirmation
No production deploy · no payment/Stripe/billing · no hosted execution · no central-plane deploy · no
migration · no MCP publish · no npm publish · no OAuth · no token/secret · no domain/DNS · no
production server write · no production persistence · no Vercel rewrite · no CORS code · no
live-dashboard change.

## 12. Recommended next stage
**Stage 208 — Better Auth Local Route + Local Migration Draft Execution Bundle** — **only** if Bae
explicitly provides at least one of **"Local auth migration draft approved."** / **"Better Auth
implementation approved."** (one → that scope only; both → both; neither → planning only). Or, if Bae
approves merging this PR first, a **merge gate** stage. **PR merge approval does not approve
migration, route registration, production deploy, Vercel rewrite, OAuth, or real auth rollout.**

# Stage 227 — Auth Cookie / CORS / Topology Code Readiness

Date: 2026-06-26 · Branch `feat/stage-227-auth-cookie-cors-topology` · PR #170 (OPEN, not merged).
Code-readiness only. **No production env / deploy / activation.**

## 1. Approval phrase observed
`"Auth cookie/CORS topology approved."` — present (direct). Authorizes a code-readiness branch for auth
topology config support ONLY. Does NOT authorize deploy, `AUTH_ENABLED` activation, production env/secret
change, OAuth, Vercel production rewrite, CORS prod change, DNS/domain, production D1 mutation, payment,
MCP/npm publish, or live dashboard change.

## 2. Branch / HEAD
- Base main `28652f9`. Feature branch `feat/stage-227-auth-cookie-cors-topology`, pushed; PR #170 opened.
- Report committed to local checkpoint branch only (not pushed, not on main/PR).

## 3. Code / package findings (from installed types, not guessed)
- Better Auth option names verified in `@better-auth/core@1.6.20` `dist/types/init-options.d.mts`:
  - `baseURL?: BaseURLConfig` where `BaseURLConfig = string | { allowedHosts, fallback }` → accepts a plain string.
  - `trustedOrigins?: string[] | ((req?) => …)` → accepts a plain string array.
  - `basePath?: string` (default `/api/auth` — matches our route).
  - `advanced?: BetterAuthAdvancedOptions` (cookie options) — DEFERRED this stage.
- Pre-stage code (`createBetterAuthRuntime`) passed only `{ secret, database, emailAndPassword }` — no
  baseURL/trustedOrigins (confirmed Stage 225). This stage adds optional env-driven support for the two.

## 4. Topology env names added
- `BETTER_AUTH_BASE_URL` (→ Better Auth `baseURL: string`).
- `BETTER_AUTH_TRUSTED_ORIGINS` (comma-separated → `trustedOrigins: string[]`).
- Both OPTIONAL, default unset; declared in `src/env.ts`. No production values set anywhere.

## 5. Better Auth config support findings
- `baseURL` + `trustedOrigins` are cleanly supported as plain string / string[]; safe to pass through.
- Cookie/`advanced.cookies` (domain/secure/sameSite) deferred — same-origin needs no special cookie
  config; the subdomain fallback would need it (a later, separate decision). Documented, not forced.

## 6. Route gating invariant (unchanged)
- `AUTH_ENABLED` absent/false → 503 `auth_disabled` · no secret → 503 `auth_not_configured` · no DB →
  503 `auth_db_unavailable` · all gates → DB-backed handler.
- Topology env alone NEVER constructs a runtime (tested: topology env without `AUTH_ENABLED` → null /
  503 `auth_disabled`). With no topology env, options are byte-for-byte unchanged (conditional spread).

## 7. Same-origin rewrite recommendation
- Preferred: `app.trysimsa.com/api/auth/*` → worker (Vercel rewrite) for first-party cookies + minimal
  CORS; set `BETTER_AUTH_BASE_URL`/`BETTER_AUTH_TRUSTED_ORIGINS` to `https://app.trysimsa.com`.
- workers.dev cross-site NOT primary (SameSite=None/CORS-credentials fragility). Subdomain = fallback
  (needs deferred cookie-domain config + DNS). Full plan in `apps/central-plane/docs/auth-topology.md`.

## 8. Tests added/updated
- `test/auth-topology.test.mjs` (new): no env → `{}`; baseURL trimmed/empty-ignored; `parseTrustedOrigins`
  comma/whitespace/empty handling; combined config; never throws on odd input.
- `test/better-auth-spike.test.mjs`: topology env without `AUTH_ENABLED` → null; builds with topology + all gates.
- `test/auth-spike-route.test.mjs`: topology env present + `AUTH_ENABLED` absent → 503 `auth_disabled`.

## 9. Verification results
- build pass · central-plane full suite **1219/1219** · auth subset (6 files) 38/38 · typecheck **57/57** ·
  `pnpm verify` green · pre-push hook verify passed.
- helper smoke `smoke:better-auth-d1` → **7/7** (exit 0, direct); route smoke `smoke:auth-route-d1` → **8/8**
  (exit 0, direct; default-disabled preserved). Windows note: root `pnpm --filter <pkg> run smoke:*` can
  crash on `0xC0000409` (workerd teardown) — environmental, not a logic failure; direct/in-package PASS.

## 10. Safety scan
- Changed files (7): `src/env.ts`, `src/auth-topology.ts` (new), `src/better-auth-spike.ts`,
  `test/auth-topology.test.mjs` (new), `test/better-auth-spike.test.mjs`, `test/auth-spike-route.test.mjs`,
  `docs/auth-topology.md` (new).
- No real secrets/tokens, no `.env`, no production env value, no `AUTH_ENABLED=true`, no `wrangler.toml`,
  no migration, no `.wrangler`/`.sqlite`, no OAuth, no Vercel/CORS/DNS change, no dashboard change.
  `app.trysimsa.com` appears only as documentation/example text.

## 11. Production impact
- Zero. PR not merged, not deployed. Production deploy still `9b645af`; `AUTH_ENABLED` unset; topology env
  unset. Even if deployed, behaviour is identical until both topology env AND `AUTH_ENABLED` are set
  (separate gates).

## 12. M&A / enterprise readiness note
- Auth topology is now a configurable, auditable, env-driven surface (verified option names, fail-closed
  parsing, decoupled from activation/deploy, documented rollout plan + explicit gates) rather than a
  hardcoded one-off.

## 13. Rollback plan
- Additive + revertible: `git revert` the squash commit on a branch → PR. Production unaffected (route
  dormant; no env set). Nothing to roll back in production.

## 14. Out-of-scope confirmation (NONE performed)
No production deploy, dashboard/central-plane deploy, production D1 mutation, `AUTH_ENABLED` activation,
production env/secret change, OAuth/token, Vercel production rewrite, CORS production config, DNS/domain,
server-write-to-production, persistence-to-production, payment/billing, MCP/npm publish, live dashboard
change, dogfood PR #121~130 change.

## 15. Recommended next stage
**Stage 228 — PR Merge Gate for Stage 227**, only after `"PR #170 merge approved."` Production deploy
(`"Dashboard deploy approved."`), Vercel rewrite (separate approval), and auth activation
(`"Production auth activation approved."`) remain separate and must not be bundled.

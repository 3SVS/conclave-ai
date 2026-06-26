# Stage 235 — Same-Origin Rewrite Production Deploy Gate

Date: 2026-06-26 · Type: dashboard/Vercel production deploy (same-origin rewrite) + verification.
**Auth remains disabled. No activation, no env/secret change, no central-plane deploy, no D1 mutation.**

## 1. Approval phrase observed
`"Auth same-origin rewrite deploy approved."` — present (direct, standalone). Authorizes deploying the
dashboard/Vercel production build containing the same-origin `/api/auth/*` rewrite ONLY. Does NOT authorize
`AUTH_ENABLED` activation, central-plane deploy, env/secret change, production D1 mutation, OAuth, DNS, CORS
prod, successful sign-up/sign-in, payment, MCP/npm publish, or unrelated dashboard changes.

## 2. Branch / HEAD
- main `e8d42cc` (Stage 232); HEAD == origin/main; worktree clean. No central-plane deploy since Stage 230,
  no `AUTH_ENABLED` activation, no env/secret change since Stage 226, no D1 mutation since Stage 224.

## 3. Pre-deploy live boundary (read-only)
- `app.trysimsa.com/api/auth/ok` → **404** (rewrite not live yet).
- Worker `/api/auth/ok` → **503 `auth_disabled`**; `/api/auth/sign-up/email` → **503**; `/health` → **200**.

## 4. Pre-deploy D1 dormancy (read-only)
- auth objects = 7; user/session/account/verification row counts = 0/0/0/0.

## 5. Pre-deploy env/secret metadata (value-free)
- `BETTER_AUTH_SECRET` present. `AUTH_ENABLED` / `BETTER_AUTH_BASE_URL` / `BETTER_AUTH_TRUSTED_ORIGINS` not
  secrets and not in `wrangler.toml [vars]` → unset. OAuth unset.

## 6. Local verification results
- dashboard build pass · auth-rewrite tests 5/5 · central-plane build + auth tests (6 files) 38/38 ·
  `pnpm typecheck` 57/57 · `pnpm verify` green.

## 7. Vercel deploy target (confirmed)
- Authenticated as `seunghunbae-3svs`; project `seunghunbae-3svs-projects/conclave-dashboard`
  (`prj_mAOqO6RIHIQRYNfnfgpe4cMrg4j9`); target production; Root Directory `apps/dashboard`; build from main
  `e8d42cc` (includes the `/api/auth/:path*` rewrite). No env passed; no DNS change; no central-plane deploy.
- Previous production deployment (rollback target): `conclave-dashboard-koizhx3bu-seunghunbae-3svs-projects.vercel.app`.

## 8. Deploy command used
```
vercel deploy --prod --yes   # from repo root (.vercel linked → conclave-dashboard)
```

## 9. Deploy result / deployment URL/id
- **READY**, target production. Deployment id `dpl_6AGwib8CD9mU4utSXko4yUnJoZFf`,
  URL `https://conclave-dashboard-nrov3w40b-seunghunbae-3svs-projects.vercel.app`, **aliased to
  `https://app.trysimsa.com`**. Inspector:
  `https://vercel.com/seunghunbae-3svs-projects/conclave-dashboard/6AGwib8CD9mU4utSXko4yUnJoZFf`.

## 10. Post-deploy disabled auth verification (rewrite now LIVE)
- `https://app.trysimsa.com/api/auth/ok` → **503 `{"error":"auth_disabled"}`** (now proxied to the Worker;
  was 404 pre-deploy).
- `https://app.trysimsa.com/api/auth/sign-up/email` (POST) → **503 `auth_disabled`** (no sign-up).
- Worker direct `…workers.dev/api/auth/ok` → **503 `auth_disabled`** (unchanged).
- Worker `/health` → **200**. No 2xx on any auth endpoint.

## 11. Post-deploy dashboard verification
- `https://app.trysimsa.com/` → **307** (normal redirect; dashboard loads as before). Rewrite scoped to
  `/api/auth/*` — no other route affected.

## 12. Post-deploy D1 dormancy verification (read-only)
- auth objects = **7**; user/session/account/verification = **0/0/0/0**. No rows created by the deploy or
  the 503 probes. No production D1 mutation occurred.

## 13. Env / auth status
- `AUTH_ENABLED` remains UNSET (secret count 0). `BETTER_AUTH_SECRET` present. `BETTER_AUTH_BASE_URL` /
  `BETTER_AUTH_TRUSTED_ORIGINS` remain unset. OAuth unset. central-plane Worker unchanged — `/health`
  reports `0.13.15` / `production` (still the Stage 230 `043331b` deploy; no central-plane deploy occurred).

## 14. Rollback / containment note
- Not needed (verification clean). If the dashboard breaks or `app.trysimsa.com/api/auth/*` ever returns
  2xx: roll back Vercel to the previous `conclave-dashboard` production deployment
  (`conclave-dashboard-koizhx3bu-…`, via `vercel rollback` / promote prior). First confirm `AUTH_ENABLED`
  unset + D1 rows 0. Keep `AUTH_ENABLED` unset; do NOT rotate/delete `BETTER_AUTH_SECRET`; do NOT drop 0047.

## 15. M&A / enterprise readiness note
Controlled production exposure achieved: the first-party auth route is now live on `app.trysimsa.com`
yet provably disabled (503 + zero D1 rows), with deployment and activation kept as distinct, auditable,
reversible steps. Rewrite-only delta; central-plane, env, secrets, and D1 untouched.

## 16. Explicit non-actions (NONE performed)
No `AUTH_ENABLED` activation, no env/secret change or rotation, no central-plane deploy, no production D1
mutation/write, no OAuth, no DNS/domain, no CORS prod change, no successful sign-up/sign-in, no payment/
billing, no MCP/npm publish, no code change on main, no dogfood PR #121~130 change. Only the approved
dashboard rewrite deploy was performed.

## 17. Recommended next stage
**Stage 236 — Production Auth Activation Readiness Gate** (planning/readiness only). Production auth
activation requires `"Production auth activation approved."` — and before flipping `AUTH_ENABLED`, the
topology env (`BETTER_AUTH_BASE_URL` = `https://app.trysimsa.com`, `BETTER_AUTH_TRUSTED_ORIGINS`) should be
set on the Worker and re-verified disabled, with a rollback (unset `AUTH_ENABLED`) ready.

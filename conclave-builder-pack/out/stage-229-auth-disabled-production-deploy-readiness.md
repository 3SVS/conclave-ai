# Stage 229 — Auth-Disabled Production Deploy Readiness Gate

Date: 2026-06-26 · Type: planning / readiness memo + runbook only. **Nothing deployed; production untouched.**

## 1. Approval phrase observed
`"Auth disabled production deploy readiness gate approved."` — present (direct). Authorizes a readiness
memo + runbook ONLY. Does NOT authorize any deploy, `AUTH_ENABLED` activation, env/secret change, OAuth,
Vercel rewrite, CORS, DNS, production D1 mutation, payment, MCP/npm publish, or dashboard change. No
deploy / secret / env / remote-D1 command was run in this stage (only local build/test + read-only git).

## 2. Branch / HEAD
- main `043331b` (Stage 227 — Auth cookie CORS topology code readiness); HEAD == origin/main; worktree clean.

## 3. Current production / main state
- Production reference deploy: `9b645af` (Stage 182~183). `AUTH_ENABLED` unset; `BETTER_AUTH_SECRET`
  provisioned (Stage 226, dormant); `BETTER_AUTH_BASE_URL` / `BETTER_AUTH_TRUSTED_ORIGINS` unset.
- Production D1 has the 0047 auth schema (Stage 224), dormant. main `043331b` to be deployed later.

## 4. Deploy surface findings (from workflows/scripts, not assumption)
- **Auth route code lives in the central-plane Worker**, not the dashboard. Shipping it = a central-plane
  Worker deploy.
- **central-plane deploy** = `.github/workflows/deploy-central-plane.yml` (Actions → Run workflow,
  workflow_dispatch on main). Inputs: `confirm` (must equal `deploy`) + `apply-migrations` (default
  `'true'`). Steps: if `apply-migrations != 'false'` → `npx wrangler d1 migrations apply --remote
  conclave-ai`, then `npx wrangler deploy`. (Local `pnpm ship` = `wrangler deploy` exists but the
  Containers Worker should deploy via the workflow, not a laptop — see CF Containers caution.)
- **dashboard deploy** = manual `vercel deploy --prod` (Vercel project, Root Dir `apps/dashboard`); there
  is no root deploy script / no `vercel.json`. The dashboard does NOT contain the auth route.
- **release.yml** = npm package publish (26 packages) — NOT an app deploy; irrelevant here.
- **Routing today:** dashboard `app.trysimsa.com` calls the worker cross-origin
  (`conclave-ai.seunghunbae.workers.dev`); no Vercel rewrite. So after a worker deploy the gated auth
  route is reachable at the WORKER host `…workers.dev/api/auth/*`, and `app.trysimsa.com` is unchanged.
- **Code delta since `9b645af` (central-plane/src):** exactly 7 auth files
  (`auth-spike-config.ts`, `auth-topology.ts`, `better-auth-d1.ts`, `better-auth-spike.ts`, `env.ts`,
  `router.ts`, `routes/auth-spike.ts`), +287 lines — ALL auth-related and gated. `wrangler.toml`
  unchanged (bindings/containers/crons identical); only migration added is `0047` (already applied).
- **Disabled deploy needs NO new migration** → use `apply-migrations=false` (0047 applied via targeted
  `d1 execute` in Stage 224; the workflow default `migrations apply` is the bulk apply Stage 223 warned
  against — do not use it here).
- **Topology env / Vercel rewrite NOT required for a disabled deploy** — both stay unset/deferred.

## 5. Auth-disabled invariant (from code + tests)
- `AUTH_ENABLED` absent/false → 503 `auth_disabled`, no runtime constructed.
- Topology env alone (`BETTER_AUTH_BASE_URL`/`BETTER_AUTH_TRUSTED_ORIGINS`) cannot activate auth.
- `BETTER_AUTH_SECRET` alone cannot activate auth (flag still off).
- Production D1 schema presence alone cannot activate auth.
- Route activates ONLY when `AUTH_ENABLED=true` AND secret AND `env.DB`. Default-disabled is unit- +
  smoke-tested (`auth-route-gated-wiring`, `auth-spike-route`, route smoke).

## 6. Local verification results
- build pass · auth tests (6 files) 38/38 · helper smoke 7/7 · route smoke 8/8 · typecheck 57/57.
- Windows note: root `pnpm --filter <pkg> run smoke:*` may crash `0xC0000409` (workerd teardown) —
  environmental, not a logic failure; direct/in-package run is deterministic PASS (as above).

## 7. Future deploy command / workflow — DOCUMENTED, NOT EXECUTED
Run ONLY after `"Dashboard deploy approved."` (see §13 naming note). Ship main `043331b`'s central-plane
Worker with the gated auth route, auth-disabled, NO new migration:
```
GitHub → Actions → "deploy-central-plane" → Run workflow (branch: main)
  confirm           = deploy
  apply-migrations  = false      # ★ 0047 already applied (Stage 224); do NOT bulk-apply
```
- This runs `npx wrangler deploy` for the central-plane Worker only. It does NOT set `AUTH_ENABLED`, does
  NOT set topology env, does NOT change `wrangler.toml`, does NOT touch the dashboard or DNS.
- A dashboard (Vercel) deploy is SEPARATE and NOT required to ship the disabled auth route. (If a
  dashboard deploy is later wanted, it would ship the dashboard delta since its last prod build — review
  separately; not part of auth-disabled deploy.)

## 8. Pre-deploy checklist
| Item | Value / requirement |
|---|---|
| main SHA to deploy | `043331b` (re-confirm at deploy time) |
| production reference SHA | `9b645af` |
| code delta (central-plane/src) | 7 auth files, +287, all gated; no unrelated worker code change |
| `wrangler.toml` change | none since `9b645af` (bindings/containers/crons identical) |
| auth schema | `0047` applied + verified (Stage 224) → `apply-migrations=false` |
| `BETTER_AUTH_SECRET` | provisioned (Stage 226), dormant |
| `AUTH_ENABLED` | remains UNSET (do not set) |
| `BETTER_AUTH_BASE_URL` | remains UNSET unless separately approved |
| `BETTER_AUTH_TRUSTED_ORIGINS` | remains UNSET unless separately approved |
| OAuth | remains UNSET |
| no D1 mutation bundled | `apply-migrations=false` |
| no env / activation bundled | confirm only `confirm=deploy` |
| rollback target | prior deployed Worker version (Cloudflare `wrangler rollback` / re-deploy reverted main) |
| owner approval phrase | `"Dashboard deploy approved."` (central-plane Worker deploy — see §13) |

## 9. Post-deploy auth-disabled verification plan
After a future disabled deploy, verify (read-only):
1. Worker health/app loads; existing endpoints behave as before (no regression).
2. `GET https://conclave-ai.seunghunbae.workers.dev/api/auth/ok` → **503 `{"error":"auth_disabled"}`**.
3. A `POST …/api/auth/sign-up/email` likewise → 503 `auth_disabled` (no handler built; no sign-up active).
4. `app.trysimsa.com` (dashboard) behavior unchanged; no `/account` change beyond current stub.
5. Read-only production D1:
   - `SELECT COUNT(*) … WHERE name IN ('user','session','account','verification', + 3 indexes)` = **7**
     (schema present).
   - `SELECT COUNT(*) FROM "user" / "session" / "account" / "verification"` = **0** each (no auth rows
     written — confirms dormancy). Read-only; no app-data writes.
6. `wrangler secret list` (names only) still shows `BETTER_AUTH_SECRET`; `AUTH_ENABLED` not added.

## 10. Rollback / containment plan
- If the worker deploy causes unexpected behavior: roll back to the prior deployed Worker version
  (`wrangler rollback`, or re-run deploy-central-plane on a `git revert`ed main). `apply-migrations=false`
  means the deploy makes no schema change to roll back.
- Keep `AUTH_ENABLED` unset throughout. Do NOT rotate/delete `BETTER_AUTH_SECRET` (separate approval).
- Production D1 0047 is additive + dormant; no destructive schema rollback unless separately planned.
- If the auth route were ever found active unexpectedly: unset `AUTH_ENABLED` first (instant 503), then
  roll back the deploy if needed.

## 11. Risks and holds
| Risk | Mitigation |
|---|---|
| Deploy accidentally bundles activation | Workflow has no `AUTH_ENABLED` input; activation is a separate gate; checklist forbids setting it. |
| Bulk `migrations apply` applies unintended migrations | Use `apply-migrations=false` (0047 already applied via targeted execute). |
| central-plane vs dashboard boundary confusion | Auth code is in the Worker; ship via deploy-central-plane; dashboard deploy is separate/optional. |
| `app.trysimsa.com` routing differs from expected | No rewrite yet → auth route lives at the workers.dev host; dashboard unaffected by the worker deploy. |
| workers.dev cross-origin remains | Fine while disabled; same-origin rewrite is a later gate (Stage 227 doc) needed only for activation. |
| Auth endpoint returns non-503 due to env drift | Post-deploy check #2/#3 asserts 503 `auth_disabled`; if not, halt + investigate before any activation. |
| Dashboard delta since `9b645af` if a Vercel deploy is also run | Out of scope here; review dashboard delta separately before any dashboard deploy. |
| Rollback command unclear | Documented: `wrangler rollback` / re-deploy reverted main; no schema rollback needed. |

## 12. M&A / enterprise readiness note
Demonstrates ship-while-disabled discipline: code ships behind a runtime gate, activation is fully
decoupled from deployment, the migration is already applied and verified separately, and production
behavior is verifiable WITHOUT turning auth on (503 `auth_disabled` + zero auth rows). Evidence and
rollback are explicit and auditable.

## 13. Explicit non-actions + naming note
- This stage performed NO deploy, NO `AUTH_ENABLED`/topology/secret/env change, NO D1 mutation, NO OAuth,
  NO Vercel/CORS/DNS change, NO dashboard change, NO MCP/npm publish, NO dogfood PR #121~130 change.
- **Naming note for Bae:** the deploy that ships the (disabled) auth route is the **central-plane Worker
  deploy** (deploy-central-plane.yml). The gate phrase `"Dashboard deploy approved."` will be treated as
  authorizing that central-plane Worker deploy; a separate Vercel dashboard deploy is NOT required for
  auth and is out of scope unless explicitly requested.

## 14. Recommendation / recommended next stage
**Option A — Auth-disabled production deploy readiness memo complete; ready for explicit deploy approval.**
Deploy surface is clear (deploy-central-plane.yml, `confirm=deploy`, `apply-migrations=false`),
`AUTH_ENABLED` unset guarantees dormant behavior (tested), the verification + rollback plans are concrete,
and the code delta is auth-only and gated. Only the human deploy approval remains.
**Recommended next stage: Stage 230 — Auth-Disabled Production Deploy Gate**, only after
`"Dashboard deploy approved."` Production auth activation remains separate
(`"Production auth activation approved."`); a same-origin Vercel rewrite remains its own separate approval.

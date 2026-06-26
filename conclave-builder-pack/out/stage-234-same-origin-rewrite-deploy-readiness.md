# Stage 234 — Same-Origin Rewrite Deploy Readiness Gate

Date: 2026-06-26 · Type: planning / readiness memo + runbook only. **Nothing deployed; production untouched.**

## 1. Approval phrase observed
`"Auth same-origin rewrite deploy readiness approved."` — present (direct). Authorizes a readiness memo +
deploy runbook ONLY. Does NOT authorize dashboard/Vercel deploy, central-plane deploy, `AUTH_ENABLED`
activation, env/secret change, production D1 mutation, OAuth, DNS, CORS prod, payment, MCP/npm publish. No
deploy / env / secret / D1-mutation command was run (only local build/test + read-only HTTP + read-only D1).

## 2. Branch / HEAD
- main `e8d42cc` (Stage 232 — Same-origin auth rewrite code readiness); HEAD == origin/main; worktree clean.

## 3. Current production state
- central-plane Worker `043331b` deployed (auth-disabled). dashboard (Vercel) NOT redeployed after PR #171.
- `AUTH_ENABLED` unset; `BETTER_AUTH_SECRET` provisioned; topology env unset; D1 0047 dormant (0 auth rows).

## 4. Dashboard deploy surface findings (from repo facts)
- Vercel project: **`conclave-dashboard`** (`projectId prj_mAOqO6RIHIQRYNfnfgpe4cMrg4j9`, `orgId team_9JrxlaW0a7Suwqtks3uS4KX6`),
  linked via `.vercel/project.json` (gitignored) at repo root and `apps/dashboard`.
- Deploy is **manual** (no `vercel.json`, no GitHub Actions deploys the dashboard) → merging changed nothing
  live; only a manual `vercel deploy --prod` makes the rewrite live.
- Vercel project Root Directory = `apps/dashboard` (Stage 53/63 convention); `next build` runs there and
  includes `apps/dashboard/next.config.ts` (the `/api/auth/:path*` rewrite). Deploying main `e8d42cc`
  therefore ships the rewrite.
- Rewrite destination resolves to the documented production Worker origin
  `https://conclave-ai.seunghunbae.workers.dev` by default; `CENTRAL_PLANE_AUTH_ORIGIN` is OPTIONAL with a
  safe default → **no production env change required** for this disabled rewrite deploy.
- Rewrite scoped to `/api/auth/:path*` only (dashboard has no `/api/auth` handler → no shadowing). No
  central-plane deploy needed.
- ★ Dashboard delta since the production reference `9b645af` (apps/dashboard) = **only the 5 Stage 232
  rewrite files** (+184/-1) — Stages 184~231 did not touch the dashboard. So a deploy is effectively
  rewrite-only (minimal "unrelated UI" risk). NOTE: the exact live Vercel build SHA cannot be read from the
  repo; confirm/accept the shipped delta at deploy time.

## 5. Current live boundary checks (read-only, before any deploy)
- `https://app.trysimsa.com/api/auth/ok` → **404** (rewrite NOT live).
- Worker `https://conclave-ai.seunghunbae.workers.dev/api/auth/ok` → **503 `auth_disabled`**.
- Worker `/health` → **200**. `https://app.trysimsa.com/` → **307** (normal redirect; dashboard loads).

## 6. D1 dormancy verification (read-only)
- auth objects = **7** (4 tables + 3 indexes). user/session/account/verification row counts = **0/0/0/0**.

## 7. Local verification results
- dashboard build pass · auth-rewrite tests 5/5 · central-plane build + auth tests (6 files) 38/38 ·
  `pnpm typecheck` 57/57 · `pnpm verify` green.

## 8. Future deploy command / workflow — DOCUMENTED, NOT EXECUTED
Run ONLY after `"Auth same-origin rewrite deploy approved."` Dashboard/Vercel only:
```
# from repo root (where .vercel links to conclave-dashboard; Vercel Root Directory = apps/dashboard)
vercel deploy --prod
```
- Deploys the `conclave-dashboard` Vercel project from main `e8d42cc` → builds `apps/dashboard` (includes
  the `/api/auth/:path*` rewrite). No `CENTRAL_PLANE_AUTH_ORIGIN` change needed (default already correct).
- Rules: dashboard only; NO central-plane deploy; NO `AUTH_ENABLED`; NO secret set/rotate; NO D1 mutation;
  NO OAuth; NO DNS; NO successful sign-up/sign-in.

## 9. Future post-deploy disabled verification plan
After the future dashboard deploy (auth still disabled):
1. `GET https://app.trysimsa.com/api/auth/ok` → **503 `auth_disabled`** (now proxied to the Worker).
2. `POST https://app.trysimsa.com/api/auth/sign-up/email` → **503 `auth_disabled`** (no sign-up).
3. Worker `…workers.dev/api/auth/ok` → **503 `auth_disabled`** (unchanged).
4. Worker `/health` → **200**. `https://app.trysimsa.com/` → loads/redirects normally.
5. Read-only D1: user/session/account/verification = **0/0/0/0**.
6. Env: `AUTH_ENABLED` unset; `BETTER_AUTH_SECRET` present; `BETTER_AUTH_BASE_URL` /
   `BETTER_AUTH_TRUSTED_ORIGINS` unset (unless separately approved); OAuth unset.
- Any 2xx on an auth endpoint, or any nonzero auth row → HALT + containment (§10).

## 10. Rollback / containment plan
- If the dashboard breaks or `app.trysimsa.com/api/auth/*` returns 2xx unexpectedly: roll back the Vercel
  deployment to the previous `conclave-dashboard` production deployment (`vercel rollback`, or promote the
  prior deployment in the Vercel dashboard). First check `AUTH_ENABLED`/env drift on the Worker.
- Keep `AUTH_ENABLED` unset; do NOT delete/rotate `BETTER_AUTH_SECRET`; do NOT drop 0047. The rewrite only
  exposes the disabled route — rollback target is the previous Vercel dashboard deployment. Not needed now.

## 11. Risks / holds
| Risk | Mitigation |
|---|---|
| Wrong Vercel project/root-dir | Confirmed `conclave-dashboard` + Root Dir `apps/dashboard`; deploy from repo-root `.vercel` link. |
| Rewrite target wrong/stale | Default = documented Worker origin; tested; live Worker confirmed 503. |
| Rewrite loops | Destination = external Worker origin (not the dashboard) → no loop. |
| `/api/auth/*` shadowing dashboard API routes | No `/api/auth` handler exists; scoped to `/api/auth/:path*` (tested). |
| Default Worker origin mismatch | Verified live: `…workers.dev/api/auth/ok` → 503 `auth_disabled`. |
| Central-plane Worker direct route unhealthy | `/health` 200 + `/api/auth/ok` 503 confirmed pre-deploy. |
| `AUTH_ENABLED` env drift | Unset (vars + secrets); post-deploy check #6 re-asserts; halt on any 2xx. |
| D1 rows created unexpectedly | Row-count 0 monitored pre + post; any nonzero → investigate. |
| Dashboard deploy bundling unrelated UI changes | Delta since reference = rewrite-only (§4); confirm at deploy time. |
| Rollback target unclear | Documented: previous Vercel `conclave-dashboard` deployment. |
| Activation confused with rewrite deploy | Rewrite deploy keeps auth disabled; activation is a separate, later gate. |

## 12. M&A / enterprise readiness note
Audit-ready: first-party auth routing can be exposed on the production domain while auth stays disabled and
reversible — verified pre-deploy boundary (404 vs 503), env-driven non-secret target, minimal rewrite-only
delta, concrete post-deploy disabled checks, and a Vercel-deployment rollback. Deploy and activation remain
distinct, explicitly-gated steps.

## 13. Explicit non-actions (NONE performed)
No dashboard/Vercel deploy, no central-plane deploy, no `AUTH_ENABLED` activation, no env/secret change, no
production D1 mutation/write, no OAuth, no DNS/domain, no production Vercel rewrite deploy, no CORS prod
change, no live dashboard behavior change, no successful sign-up/sign-in, no payment/billing, no MCP/npm
publish, no code change on main, no dogfood PR #121~130 change.

## 14. Recommendation / recommended next stage
**Option A — Same-origin rewrite deploy readiness complete; ready for explicit dashboard rewrite deploy
approval.** Deploy surface is clear (`conclave-dashboard`, manual `vercel deploy --prod` from repo root,
Root Dir `apps/dashboard`), the future command + post-deploy disabled verification + rollback are concrete,
D1 dormancy is 0 rows, the delta is rewrite-only, and local verification passes. Only the human deploy
approval remains.
**Recommended next stage: Stage 235 — Same-Origin Rewrite Production Deploy Gate**, only after
`"Auth same-origin rewrite deploy approved."` Production auth activation remains separate
(`"Production auth activation approved."`).

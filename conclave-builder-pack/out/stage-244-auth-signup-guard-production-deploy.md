# Stage 244 — Auth Sign-up Guard Production Deploy Gate

Date: 2026-06-27 · Type: production central-plane Worker deploy (guard-only) + verification.
**Public sign-up now CLOSED by default. Auth still active. No migration / env / secret / D1 / dashboard change.**

## 1. Approval phrase observed
`"Auth sign-up guard production deploy approved."` — present (direct, standalone). Authorizes the
central-plane Worker deploy of current main with `apply-migrations=false`, keeping `AUTH_ENABLED=true` and
`AUTH_SIGNUP_MODE` unset. Does NOT authorize dashboard/Vercel deploy, D1 migration/mutation, cleanup, new
users, auth rollback, env/secret change, setting `AUTH_SIGNUP_MODE`, OAuth, DNS/CORS, payment, MCP/npm
publish, or broad launch.

## 2. Branch / HEAD
- main `8f0edcc` (Stage 241 — Account UX auth exposure guard); HEAD == origin/main; worktree clean.

## 3. Deploy result
- Workflow `deploy-central-plane.yml` run **28283032768** (https://github.com/3SVS/conclave-ai/actions/runs/28283032768),
  headSha `8f0edcc`, conclusion **success**. Steps: "Confirm deploy intent" → skipped (confirm=deploy);
  "Apply D1 migrations" → **skipped** (apply-migrations=false); "Deploy Worker" (`wrangler deploy`) → success;
  "Smoke test deployed endpoints" → success. **No migration applied.**

## 4. Deployed SHA / version
- central-plane Worker now serves main `8f0edcc` (guard-only delta vs prior `043331b` = the 3 sign-up-guard
  files). `/health` reports environment `production`. Dashboard (Vercel) NOT deployed — remains `dpl_6AGwib8…`.

## 5. Pre-deploy production baseline (read-only)
- HTTP: app + worker `/api/auth/ok` → 200 `{"ok":true}`; `/health` → 200; `app.trysimsa.com/` → 307.
- D1: user/session/account/verification = 1/1/1/0. Secrets: `AUTH_ENABLED`/`BETTER_AUTH_*` present;
  `AUTH_SIGNUP_MODE` absent; OAuth unset. (Pre-deploy, the worker `043331b` still allowed open sign-up.)

## 6. Local verification (pre-deploy)
- central-plane build pass · sign-up-policy + route guard tests 16/16 · route smoke 8/8 · `pnpm verify` green.
  (Full Stage 243 set: central-plane auth 46/46, smokes 7/7 + 8/8, dashboard 10/10, typecheck 57/57.)

## 7. Post-deploy `/api/auth/ok` verification (auth stays active)
- `app.trysimsa.com/api/auth/ok` → **200 `{"ok":true}`**; Worker `/api/auth/ok` → **200 `{"ok":true}`**.
  `/health` → 200; `app.trysimsa.com/` → 307. Auth is unaffected by the guard.

## 8. Post-deploy sign-up guard verification (exposure CLOSED)
- `app.trysimsa.com/api/auth/sign-up/email` (POST) → **403 `{"error":"signup_disabled"}`** (first-party origin).
- Worker `…/api/auth/sign-up/email` (POST) → **403 `{"error":"signup_disabled"}`** (worker host).
- → Public sign-up is now blocked by the fail-closed default (`AUTH_SIGNUP_MODE` absent → disabled). Both
  requests were blocked BEFORE the Better Auth handler, so no user was created.

## 9. Post-deploy D1 verification (read-only)
- user/session/account/verification = **1/1/1/0** — unchanged. The blocked sign-up probes created no rows.
  Only the Stage 238 smoke account exists. No tokens read, no rows deleted/mutated.

## 10. Env / secret / auth status
- `AUTH_ENABLED` present (auth ACTIVE). `AUTH_SIGNUP_MODE` **absent** (count 0) → guard defaults to disabled.
  `BETTER_AUTH_SECRET` / `BETTER_AUTH_BASE_URL` / `BETTER_AUTH_TRUSTED_ORIGINS` present. OAuth unset. No env
  or secret was set/rotated/deleted in this stage.

## 11. Dashboard / account UX live boundary
- No dashboard/Vercel deploy. `app.trysimsa.com` still serves `dpl_6AGwib8…`. The Stage 241 account UX code
  is on main but **NOT live** (it goes live only on a future, separately-approved dashboard deploy). This
  stage changed central-plane Worker behaviour only.

## 12. Rollback decision / status
- **No rollback.** All checks clean (auth active 200, sign-up 403, D1 1/1/1/0). Guard kept live.
- Instant rollback if ever needed: `wrangler rollback` the Worker to `043331b`; keep `AUTH_ENABLED=true`
  (delete it only if auth itself is unsafe). Do not mutate D1, delete the smoke account, or remove
  `BETTER_AUTH_SECRET`/topology env / 0047.

## 13. M&A / enterprise readiness note
An exposed production auth surface (open public sign-up) was CLOSED through a single controlled, guard-only
Worker deploy — without disabling auth, migrating data, touching env/secrets, breaking sign-in/session, or
broad-launching account UX. Fail-closed by default (no env value needed); deployment and any future "open"
decision remain distinct, auditable gates.

## 14. Explicit non-actions (NONE performed)
No dashboard/Vercel deploy, no D1 migration/mutation, no destructive cleanup, no user creation (sign-up
blocked → 0 rows), no auth rollback, no env/secret change, no `AUTH_SIGNUP_MODE` set, no OAuth, no DNS/domain,
no CORS prod change, no payment, no MCP/npm publish, no broad launch, no code change on main, no dogfood PR
#121~130 change.

## 15. Recommended next stage
**Stage 245 — Account UX Dashboard Deploy Readiness Gate** (planning/readiness only). The account UX (Stage
241 dashboard code) goes live only via a future dashboard/Vercel deploy. Readiness phrase:
`"Account UX dashboard deploy readiness approved."`; actual dashboard deploy remains separate:
`"Account UX dashboard production deploy approved."` Workspace membership / userKey bridge / invite remain separate stages.

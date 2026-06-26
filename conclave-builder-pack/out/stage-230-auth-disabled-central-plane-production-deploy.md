# Stage 230 — Auth-Disabled Central-Plane Production Deploy Gate

Date: 2026-06-26 · Type: production central-plane Worker deploy (auth disabled) + verification.
**Auth remains dormant. No dashboard deploy, no migration, no env/secret mutation, no activation.**

## 1. Approval phrase observed
`"Auth-disabled central-plane deploy approved."` — present (direct, standalone). Authorizes deploying the
central-plane Worker to production with auth disabled ONLY. Does NOT authorize dashboard/Vercel deploy,
`AUTH_ENABLED` activation, topology env, secret rotation, production D1 mutation, bulk migration apply,
OAuth, DNS, Vercel rewrite, CORS, payment, MCP/npm publish, or live dashboard change.

## 2. Branch / HEAD
- main `043331b` (Stage 227); HEAD == origin/main; worktree clean. No env mutation since Stage 226, no D1
  mutation since Stage 224, no dashboard deploy since Stage 229.

## 3. Deploy surface confirmed (from workflow, not memory)
- `.github/workflows/deploy-central-plane.yml`, `workflow_dispatch` on main. Inputs: `confirm` (must equal
  `deploy`) + `apply-migrations` (default `'true'`). The "Apply D1 migrations" step is gated `if:
  inputs.apply-migrations != 'false'`; the "Deploy Worker" step runs `npx wrangler deploy` with only
  `CLOUDFLARE_API_TOKEN`/`ACCOUNT_ID` env — it injects NO `AUTH_ENABLED` / topology env. Deploys the
  central-plane Worker only (no dashboard/Vercel).

## 4. Pre-deploy safety checks
- `AUTH_ENABLED` / `BETTER_AUTH_BASE_URL` / `BETTER_AUTH_TRUSTED_ORIGINS` / `AUTH_PROVIDER` absent from
  `wrangler.toml [vars]` → unset in production after deploy.
- D1 binding unchanged: `DB` → `conclave-ai` → `28be7ec4-9c46-4b78-8d07-11f344021dd0`.
- Code delta since `9b645af` (central-plane/src) = 7 auth files only, gated; `wrangler.toml` unchanged.
- Migration not applied in this deploy (`apply-migrations=false`).

## 5. Pre-deploy local verification
- build pass · auth tests (6 files) 38/38 · helper smoke 7/7 · route smoke 8/8 · typecheck 57/57.

## 6. Pre-deploy remote read-only checks
- Worker secrets (names only): `BETTER_AUTH_SECRET` present; `AUTH_ENABLED` NOT a secret.
- D1: auth objects = 7 (4 tables + 3 indexes); user/session/account/verification row counts = 0 (pre-deploy dormant).

## 7. Workflow command / input used
```
gh workflow run deploy-central-plane.yml --ref main -f confirm=deploy -f apply-migrations=false
```

## 8. Workflow run URL / run id
- Run id `28226196653` · https://github.com/3SVS/conclave-ai/actions/runs/28226196653 · headSha `043331b`.

## 9. Deploy result
- Job conclusion: **success**. Steps: "Confirm deploy intent" → skipped (confirm=deploy, so the refuse-guard
  did not fire); "Apply D1 migrations" → **skipped** (apply-migrations=false); "Deploy Worker" (`wrangler
  deploy`) → success; "Smoke test deployed endpoints" → success. **No migration applied.**

## 10. Deployed SHA
- central-plane Worker now serves main `043331b` (health reports version `0.13.15`, environment
  `production`). Dashboard (`app.trysimsa.com`, Vercel) NOT deployed — remains its prior build.

## 11. Post-deploy HTTP verification (worker host `https://conclave-ai.seunghunbae.workers.dev`)
- `GET /api/auth/ok` → **HTTP 503 `{"error":"auth_disabled"}`** (gated route now deployed + disabled).
- `POST /api/auth/sign-up/email` → **HTTP 503 `{"error":"auth_disabled"}`** (no handler built; no sign-up active).
- `GET /health` → **HTTP 200** `{"ok":true,"service":"conclave-central-plane","version":"0.13.15","environment":"production"}`.

## 12. Post-deploy D1 dormancy verification (read-only)
- auth objects = **7** (4 tables + 3 indexes still present).
- user/session/account/verification row counts = **0 / 0 / 0 / 0** — no app data written by the deploy or
  the 503 probes. Schema present + dormant.

## 13. Env / deploy state confirmation
- `AUTH_ENABLED` remains UNSET (not in vars, not a secret — confirmed count 0). `BETTER_AUTH_SECRET`
  remains present. `BETTER_AUTH_BASE_URL` / `BETTER_AUTH_TRUSTED_ORIGINS` remain UNSET. OAuth unset.
- No DNS/domain change, no Vercel rewrite change, no production CORS change.

## 14. Dashboard / Vercel status
- Not deployed this stage. `app.trysimsa.com` dashboard behavior unchanged (the auth route is in the
  Worker, not the dashboard; today's routing is cross-origin, no rewrite). Dashboard remains at its prior build.

## 15. Rollback / containment note
- If worker behavior is wrong: `wrangler rollback` (or re-run deploy-central-plane on a `git revert`ed
  main). `apply-migrations=false` means there is no schema change to roll back.
- Keep `AUTH_ENABLED` unset; do NOT rotate/delete `BETTER_AUTH_SECRET`; do NOT drop `0047`. If auth ever
  activates unexpectedly, unset `AUTH_ENABLED` first (instant 503), then roll back the worker if needed.
- Not needed now — verification clean.

## 16. M&A / enterprise readiness note
Demonstrated ship-while-disabled discipline end-to-end: schema (Stage 224), secret (Stage 226), and code
(this stage) shipped in independent, approved steps; activation + topology remain decoupled and unshipped;
production behavior verified disabled (503 + zero auth rows). Auditable, reversible, no live behavior change.

## 17. Explicit non-actions (NONE performed)
No dashboard/Vercel deploy, no `AUTH_ENABLED` activation, no topology env, no secret rotation, no production
D1 mutation, no bulk migration apply, no OAuth, no DNS/domain, no Vercel rewrite, no CORS prod change, no
payment/billing, no MCP/npm publish, no live dashboard change, no dogfood PR #121~130 change, no code change
on main, no local D1 state committed.

## 18. Recommended next stage
**Stage 231 — Auth-Disabled Production Observation / Activation Readiness Gate** (planning/readiness only).
Auth activation requires `"Production auth activation approved."`; a same-origin Vercel rewrite requires its
own separate approval.

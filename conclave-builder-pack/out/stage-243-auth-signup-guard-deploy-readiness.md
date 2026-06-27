# Stage 243 — Auth Sign-up Guard Production Deploy Readiness Gate

Date: 2026-06-27 · Type: planning / readiness memo + runbook only. **Nothing deployed; production untouched.**

## 1. Approval phrase observed
`"Auth sign-up guard deploy readiness approved."` — present (direct). Authorizes a readiness memo + deploy
runbook ONLY. Does NOT authorize deploy, D1 migration/mutation, cleanup, new users, auth rollback, env/secret
change, OAuth, DNS/CORS, payment, MCP/npm publish, or broad launch. No deploy / env / secret / D1-mutation
command was run (only local build/test + read-only HTTP/D1/secret-metadata).

## 2. Branch / HEAD
- main `8f0edcc` (Stage 241 — Account UX auth exposure guard); HEAD == origin/main; worktree clean.
  Production Worker still `043331b`; no deploy since Stage 235; no D1 mutation since the Stage 238 smoke;
  no env/secret change since Stage 238/237; `AUTH_SIGNUP_MODE` not set in production.

## 3. Current production state
- `AUTH_ENABLED=true` (ACTIVE). `app.trysimsa.com/api/auth/ok` → 200 `{"ok":true}`; Worker `/api/auth/ok` →
  200; `/health` → 200; `app.trysimsa.com/` → 307. D1 user/session/account/verification = **1/1/1/0**.
- Worker `043331b` has NO sign-up guard → public `POST /api/auth/sign-up/email` is currently OPEN in prod.

## 4. Deploy surface findings (from workflow, not memory)
- `.github/workflows/deploy-central-plane.yml`, `workflow_dispatch` on main. Inputs `confirm` (must equal
  `deploy`) + `apply-migrations` (default `'true'`). "Apply D1 migrations" step gated `if: apply-migrations
  != 'false'`; "Deploy Worker" runs `npx wrangler deploy` with only `CLOUDFLARE_*` env — it injects NO
  `AUTH_SIGNUP_MODE` / `AUTH_ENABLED`. **Central-plane Worker only** (no dashboard/Vercel).
- ★ Deploy delta (central-plane/src, deployed `043331b` → main `8f0edcc`) = ONLY the 3 guard files
  (`auth-signup-policy.ts` +45, `env.ts` +9, `routes/auth-spike.ts` +10; +64 total). No migration /
  `wrangler.toml` change → a clean, **guard-only** deploy with `apply-migrations=false`.

## 5. Guard behavior findings (on main `8f0edcc`)
- `AUTH_SIGNUP_MODE` is **fail-closed**: `resolveSignupMode` returns `disabled` when unset/unknown
  (`auth-signup-policy.ts:25`). The route blocks `POST /api/auth/sign-up/*` with **403 `signup_disabled`**
  unless mode is `open` (`routes/auth-spike.ts:52-53`). `invite_only` also blocks public sign-up (no false
  allow). `open` is explicit, never default.
- Sign-in / `get-session` / sign-out are NOT blocked (path-scoped guard). `/api/auth/ok` stays active when
  `AUTH_ENABLED=true`. **No new production env value is required to close sign-up** — `AUTH_SIGNUP_MODE`
  absent in prod → after deploy the guard defaults to disabled. Existing `AUTH_ENABLED`/topology secrets are sufficient.

## 6. Pre-deploy production baseline (read-only)
- HTTP: app + worker `/api/auth/ok` → 200 `{"ok":true}`; `/health` → 200; `app.trysimsa.com/` → 307.
- D1: user=1, account=1, session=1, verification=0 (smoke account only).
- Secrets: `AUTH_ENABLED`, `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_TRUSTED_ORIGINS`
  present; **`AUTH_SIGNUP_MODE` absent**; OAuth unset.

## 7. Local verification results
- central-plane build pass · auth tests (7 files incl. signup-policy) **46/46** · helper smoke **7/7** ·
  route smoke **8/8** · dashboard build + tests **10/10** · `pnpm typecheck` 57/57 · `pnpm verify` green.

## 8. Future deploy command / workflow — DOCUMENTED, NOT EXECUTED
Run ONLY after `"Auth sign-up guard production deploy approved."` Central-plane Worker only, guard-only,
no migration:
```
gh workflow run deploy-central-plane.yml --ref main -f confirm=deploy -f apply-migrations=false
```
- Ships main `8f0edcc` central-plane Worker (adds the sign-up guard). `apply-migrations=false` (0047 already
  applied; no migration in the delta). Does NOT deploy dashboard, set `AUTH_SIGNUP_MODE`/`AUTH_ENABLED`,
  rotate secrets, mutate D1, configure OAuth, or create users.

## 9. Future post-deploy verification plan
After the future deploy (auth stays active, sign-up closes):
1. `app.trysimsa.com/api/auth/ok` → **200 `{"ok":true}`**; Worker `/api/auth/ok` → **200 `{"ok":true}`**.
2. `app.trysimsa.com/api/auth/sign-up/email` → **403 `signup_disabled`**.
3. Worker `…/api/auth/sign-up/email` → **403 `signup_disabled`**.
4. Worker `/health` → **200**; `app.trysimsa.com/` → loads/redirects (307).
5. Read-only D1: user/session/account/verification = **1/1/1/0** (unchanged; sign-up is blocked so no rows).
6. Secrets metadata: `AUTH_ENABLED` present; `AUTH_SIGNUP_MODE` **still absent**; topology secrets present;
   OAuth unset.
- Do NOT run a successful sign-up; do not create users; do not clean up the smoke account. (Sign-in for the
  existing smoke account is NOT blocked by the guard — optional confirm only, no new rows.)

## 10. Rollback / containment plan
- If the deploy breaks auth generally: `wrangler rollback` the central-plane Worker to the previous
  deployment (`043331b`/prior known-good). Keep `AUTH_ENABLED=true` unless auth itself is unsafe (then
  `wrangler secret delete AUTH_ENABLED` → disabled). Do NOT delete `BETTER_AUTH_SECRET`/topology env; do NOT
  drop 0047.
- If sign-up remains OPEN after deploy: confirm the deployed SHA and that `AUTH_SIGNUP_MODE` is absent; if
  incident response requires, set `AUTH_SIGNUP_MODE=disabled` as emergency containment (only with approval
  or active incident); otherwise roll back the Worker and report.
- If sign-in/session breaks: roll back the central-plane Worker; do NOT mutate D1 / delete the smoke account.
- Not executed in this readiness stage.

## 11. Risks / holds
| Risk | Mitigation |
|---|---|
| Sign-up still open because the Worker wasn't actually updated | Post-deploy check #2/#3 asserts 403; confirm deployed SHA; rollback/redeploy if not. |
| `AUTH_SIGNUP_MODE` accidentally set to `open` | Do not set it at deploy; verify it remains absent post-deploy (#6). |
| Guard blocks sign-in/session by mistake | Path-scoped to sign-up; tested (sign-in/session/sign-out unaffected); post-deploy /api/auth/ok 200. |
| `/api/auth/ok` changes unexpectedly | Post-deploy check #1 asserts 200 `{"ok":true}`. |
| D1 rows created during verification | Verification is read-only + 403 sign-up; no successful sign-up run. |
| Bulk migrations accidentally run | `apply-migrations=false`; delta has no migration anyway. |
| Dashboard deploy confusion | This is a central-plane Worker deploy ONLY; account UX goes live only on a future dashboard deploy. |
| Broad launch mistaken for guard deploy | Guard deploy CLOSES exposure; it is not a launch. Account UX still not live. |
| Auth API active + sign-up blocked still exposes session endpoints | get-session returns null without a cookie; sign-in still works for existing users by design; acceptable pre-launch. |
| No invite flow yet | invite_only currently blocks; invite enforcement is a later stage. |

## 12. M&A / enterprise readiness note
Evidence that Simsa can CLOSE an exposed auth surface through a single controlled, guard-only Worker deploy
— without disabling auth, migrating data, touching env/secrets, or breaking session/sign-in routes. The
fail-closed default means no env value is needed to secure sign-up; deployment and any future "open" decision
stay distinct, auditable gates.

## 13. Explicit non-actions (NONE performed)
No production/central-plane/dashboard deploy, no D1 migration/mutation, no destructive cleanup, no user
creation, no auth rollback, no env/secret change, no OAuth, no DNS/domain, no CORS prod change, no payment,
no MCP/npm publish, no broad launch, no code change on main, no dogfood PR #121~130 change.

## 14. Recommendation / recommended next stage
**Option A — Auth sign-up guard deploy readiness complete; ready for explicit production deploy approval.**
Deploy surface is clear (deploy-central-plane.yml, `confirm=deploy`, `apply-migrations=false`), the guard is
fail-closed (absent `AUTH_SIGNUP_MODE` → sign-up disabled after deploy), the delta is guard-only, local
verification passes, and the post-deploy + rollback plans are concrete. Only the human deploy approval remains.
**Recommended next stage: Stage 244 — Auth Sign-up Guard Production Deploy Gate**, only after
`"Auth sign-up guard production deploy approved."`

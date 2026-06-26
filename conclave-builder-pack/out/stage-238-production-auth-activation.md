# Stage 238 — Production Auth Activation Gate

Date: 2026-06-27 (smoke email stamped UTC 20260626172247) · Type: production auth ACTIVATION
(`AUTH_ENABLED=true`) + minimal marked smoke. **No deploy, no migration, no OAuth, no broad launch.**

## 1. Approval phrase observed
`"Production auth activation approved."` — present (direct, standalone). Authorizes setting
`AUTH_ENABLED=true` on the production Worker + one minimal marked production smoke ONLY. Does NOT authorize
central-plane/dashboard deploy, D1 migration, OAuth, DNS, CORS prod, payment, MCP/npm publish, broad
user-facing launch, deleting D1 rows, rotating `BETTER_AUTH_SECRET`, or removing topology env.

## 2. Branch / HEAD
- main `e8d42cc`; HEAD == origin/main; worktree clean. central-plane Worker code remains `043331b`
  (secret-put rebinds the existing script — no code deploy); dashboard rewrite remains live.

## 3. Pre-activation HTTP baseline
- `app.trysimsa.com/api/auth/ok` → 503 `auth_disabled`; `…/sign-up/email` → 503; Worker `/api/auth/ok` →
  503 `auth_disabled`; Worker `/health` → 200; `app.trysimsa.com/` → 307.

## 4. Pre-activation D1 baseline (read-only)
- auth objects = 7; user/session/account/verification = **0/0/0/0**.

## 5. Pre-activation env/secret metadata (value-free)
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_TRUSTED_ORIGINS` present; `AUTH_ENABLED` count
  = 0 (unset); OAuth unset.

## 6. Local verification results
- dashboard build pass · auth-rewrite tests 5/5 · central-plane build + auth tests (6 files) 38/38 ·
  `pnpm typecheck` 57/57 · `pnpm verify` green.

## 7. Smoke account identifier
- Email: `simsa-auth-smoke-20260626172247@example.com` (clearly marked, non-real `example.com` domain).
- Password: generated locally with `crypto.randomBytes(18)` (base64url), used ephemerally in-command,
  NOT pasted to chat, NOT committed, NOT persisted.

## 8. AUTH_ENABLED provisioning result
- `printf "true\n" | wrangler secret put AUTH_ENABLED` → "✨ Success! Uploaded secret AUTH_ENABLED" on
  Worker **conclave-ai** (production). Single env change; no deploy/migration/secret-rotation bundled.

## 9. Post-activation metadata check (value-free)
- Worker secrets now: `AUTH_ENABLED`, `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_TRUSTED_ORIGINS` (4 auth-related). OAuth unset. No secret VALUE displayed.

## 10. Route readiness check
- Worker `/api/auth/ok` → **200 `{"ok":true}`** (no longer `503 auth_disabled` — Better Auth's readiness
  endpoint is now served → activation took effect).
- `app.trysimsa.com/api/auth/ok` → **200 `{"ok":true}`** (served through the first-party same-origin rewrite).
- Worker `/health` → 200.

## 11. Sign-up smoke result
- `POST https://app.trysimsa.com/api/auth/sign-up/email` (Origin `https://app.trysimsa.com`, marked
  account) → **HTTP 200** with **Set-Cookie present** (first-party session cookie). The trustedOrigins
  config accepted the `app.trysimsa.com` Origin; the same-origin rewrite proxied to the Worker.

## 12. Sign-in smoke result
- **Skipped (documented).** The ephemeral test password was generated in-command and not persisted (secret
  hygiene), so it could not be reused; re-running would require creating a SECOND account (disallowed —
  "do not create multiple users"). Sign-up already proved the authenticated flow end-to-end (HTTP 200 +
  Set-Cookie + a `session` row created via auto sign-in).

## 13. Post-smoke D1 row delta (read-only)
- Before: user/session/account/verification = 0/0/0/0. After: **user=1, account=1 (providerId `credential`),
  session=1, verification=0** — exactly the expected single-account smoke delta; no unexpected rows.
- Smoke user: email `simsa-auth-smoke-20260626172247@example.com`, `emailVerified=0`. No tokens/secrets read.

## 14. Dashboard / health verification
- Post-activation re-check: `app.trysimsa.com/api/auth/ok` → 200 `{"ok":true}`; `app.trysimsa.com/` → 307
  (dashboard loads/redirects normally); Worker `/health` → 200; D1 still exactly **1 user** (no extra
  accounts from re-checks).

## 15. Rollback decision and status
- **No rollback.** All checks clean. `AUTH_ENABLED=true` kept; production auth is ACTIVE.
- Instant rollback if ever needed: `wrangler secret delete AUTH_ENABLED` (or overwrite with a non-`"true"`
  value) → route returns to `503 auth_disabled` with no code deploy. Topology env + `BETTER_AUTH_SECRET`
  + 0047 schema all retained. Smoke row NOT deleted (no cleanup approval).

## 16. M&A / enterprise readiness note
Production auth was activated through a single explicit env flag, with minimal evidence-based smoke (one
marked account, exact +1/+1/+1 D1 delta, first-party session cookie) and an instant deploy-free rollback —
no code deploy, no migration, no OAuth, no broad launch. The full chain (schema → secret → code deploy →
rewrite → topology → activation) was executed as discrete, auditable, separately-approved gates.

## 17. Explicit non-actions (NONE performed)
No central-plane/dashboard deploy, no D1 schema migration, no OAuth, no DNS/domain, no CORS prod change, no
`BETTER_AUTH_SECRET` rotation/deletion, no topology env removal, no destructive D1 cleanup, no payment/
billing, no MCP/npm publish, no broad user-facing/workspace launch, no code change on main, no dogfood PR
#121~130 change. Exactly one marked smoke account created (approved).

## 18. Recommended next stage
**Stage 239 — Post-Activation Observation / Productization Gate** (observation + planning only). Broad
user-facing auth launch must wait for `/account` UX readiness, workspace-membership policy, the userKey →
real-user transition plan, and the invite/share permission model. Production smoke account
`simsa-auth-smoke-20260626172247@example.com` remains (cleanup needs separate approval).

# Stage 246 — Account UX Dashboard Production Deploy Gate

Date: 2026-06-27 · Type: dashboard/Vercel production deploy (controlled /account UX) + verification.
**Account UX now LIVE. Auth active. Public sign-up still closed. central-plane / D1 / env / secret unchanged.**

## 1. Approval phrase observed
`"Account UX dashboard production deploy approved."` — present (direct, standalone). Authorizes the
dashboard/Vercel production deploy of current main (Stage 241 controlled `/account` UX) ONLY, keeping
central-plane unchanged, auth active, public sign-up disabled. Does NOT authorize central-plane deploy, D1
migration/mutation, cleanup, new users, auth rollback, env/secret change, `AUTH_SIGNUP_MODE` change, OAuth,
DNS/CORS, payment, MCP/npm publish, broad/invite/workspace launch.

## 2. Branch / HEAD
- main `8f0edcc`; HEAD == origin/main; worktree clean. central-plane Worker already `8f0edcc` (sign-up guard live).

## 3. Dashboard deploy result
- `vercel deploy --prod --yes` (repo root, project `conclave-dashboard`, Root Dir `apps/dashboard`) →
  **READY**, target production. **No central-plane deploy, no D1 mutation, no env/secret change.**

## 4. Vercel deployment id / URL
- id `dpl_AfxYFmY6xU6sC5enA58bVZrngcVQ`, URL
  `https://conclave-dashboard-8qshb9snu-seunghunbae-3svs-projects.vercel.app`. Inspector:
  `https://vercel.com/seunghunbae-3svs-projects/conclave-dashboard/AfxYFmY6xU6sC5enA58bVZrngcVQ`.

## 5. Production alias result
- `app.trysimsa.com` now serves the new deployment (production target; previous prod build
  `dpl_6AGwib8CD9mU4utSXko4yUnJoZFf` is the rollback target).

## 6. Pre-deploy production baseline (read-only)
- `app.trysimsa.com/` → 307; `/account` → 200 (Stage 170 stub, pre-deploy); `/api/auth/ok` → 200
  `{"ok":true}`; sign-up → 403 `signup_disabled`. D1 = 1/1/1/0. `AUTH_SIGNUP_MODE` absent; auth secrets present.

## 7. Local verification (pre-deploy)
- dashboard build pass · dashboard auth tests (auth-client + auth-rewrite) **10/10** · `pnpm verify` green.

## 8. Post-deploy dashboard verification
- `app.trysimsa.com/` → **307** (loads/redirects normally). Existing userKey-based dashboard flows intact;
  no mandatory login wall introduced.

## 9. Post-deploy `/account` UX verification
- `app.trysimsa.com/account` → **200**, and the served HTML now contains the Stage 241 section:
  **"Authentication"** + **"Controlled preview — not a public sign-up. Sign-in is invite/internal only for
  now."** → the controlled account UX is **LIVE**.
- No public sign-up UI; no forced auth gate; no project-ownership claim; no userKey migration prompt; no
  invite/share launch; no OAuth UI; no billing coupling; no broad-launch copy.

## 10. Post-deploy auth / API verification
- `app.trysimsa.com/api/auth/ok` → **200 `{"ok":true}`**; `app.trysimsa.com/api/auth/sign-up/email` → **403
  `signup_disabled`**. Worker `/api/auth/ok` → **200**; Worker sign-up → **403 `signup_disabled`**; Worker
  `/health` → **200**. Auth active; public sign-up still closed. No successful sign-up/sign-in run.

## 11. Post-deploy D1 verification (read-only)
- user/session/account/verification = **1/1/1/0** — unchanged. Loading `/account` and the blocked sign-up
  probes created no rows. Only the Stage 238 smoke account exists. No tokens read, no rows mutated/deleted.

## 12. Post-deploy env / secret / auth status
- `AUTH_ENABLED` present (ACTIVE); `AUTH_SIGNUP_MODE` **absent** (count 0) → sign-up disabled by default;
  `BETTER_AUTH_SECRET` / `BETTER_AUTH_BASE_URL` / `BETTER_AUTH_TRUSTED_ORIGINS` present (4 auth secrets total);
  OAuth unset. No env/secret set/rotated/deleted in this stage.

## 13. Rollback decision / status
- **No rollback.** All checks clean (app loads, /account controlled UX live, auth 200, sign-up 403, D1
  1/1/1/0). Instant rollback if ever needed: `vercel rollback` to `dpl_6AGwib8…`; central-plane untouched;
  `AUTH_ENABLED`/`AUTH_SIGNUP_MODE` unchanged; no D1 mutation.

## 14. M&A / enterprise readiness note
Account visibility is now user-facing while launch discipline holds: auth is live, public sign-up is closed
(fail-closed guard), `/account` is a controlled preview (no sign-up affordance, no forced gate, userKey
preserved), and workspace governance / invite / billing remain separate future gates. Deploy is account-UX-
only and reversible.

## 15. Explicit non-actions (NONE performed)
No central-plane deploy, no D1 migration/mutation, no destructive cleanup, no user creation (sign-up blocked,
/account read-only), no auth rollback, no env/secret change, no `AUTH_SIGNUP_MODE` change, no OAuth, no
DNS/domain, no CORS prod change, no payment, no MCP/npm publish, no broad/invite/workspace launch, no code
change on main, no dogfood PR #121~130 change.

## 16. Recommended next stage
**Stage 247 — Account UX Post-Deploy Observation / Workspace Membership Readiness Gate** (observation/planning
only). Broad user-facing launch remains blocked until: workspace membership policy implemented; userKey →
auth-user bridge implemented; invite/share permissions defined; smoke-account cleanup policy exists;
privacy/account-deletion handling exists.

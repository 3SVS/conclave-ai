# Stage 241 — Account UX / Auth Exposure Guard Code Readiness

Date: 2026-06-27 · Branch `feat/stage-241-account-ux-auth-exposure-guard` · PR #172 (OPEN, not merged).
**Code-readiness only. No deploy / env / secret / D1 change. userKey preserved.**

## 1. Approval phrase observed
`"Account UX code readiness approved."` — present (direct). Authorizes a code-readiness branch ONLY. Does
NOT authorize deploy, D1 migration/mutation, smoke-account cleanup, new users, OAuth, payment, MCP/npm
publish, broad launch, `AUTH_ENABLED` change, secret rotation, or DNS/CORS change.

## 2. Branch / HEAD
- Base main `e8d42cc`. Feature branch pushed; PR #172 opened. Report on checkpoint branch only.

## 3. Dashboard auth client findings
- Dashboard does not depend on `better-auth`; no client existed. The same-origin rewrite proxies
  `/api/auth/*`, so a **dependency-free fetch client** is safest. Endpoint shapes verified LIVE (read-only):
  `GET /api/auth/get-session` → 200 `null` (signed out); `POST /api/auth/sign-out` (needs content-type).

## 4. Auth API exposure findings
- `emailAndPassword` sign-up is currently OPEN on the live worker (`043331b`): `POST .../sign-up/email`
  is publicly reachable. There was no route-level sign-up guard and no per-path control. Better Auth's own
  options weren't relied on; a route-level guard keyed off the request path is the smallest safe control and
  doesn't touch sign-in/session.

## 5. Decision
**Option A — Account UX / auth exposure guard code-readiness PR opened.**

## 6. Implementation summary
- **Sign-up exposure guard (central-plane):** env-driven `AUTH_SIGNUP_MODE`, **fail-closed default
  `disabled`**. The route blocks `POST /api/auth/sign-up/*` with 403 `signup_disabled` unless mode is
  `open`; `invite_only` also blocks public sign-up (invite enforcement deferred). Sign-in/session/sign-out
  untouched.
- **Account UX (dashboard):** dependency-free fetch auth client + a controlled `/account` "Authentication
  (controlled preview)" section (status + email + sign-out), no sign-up UI, no forced gate.

## 7. Files changed (12: 7 modified, 5 new)
- central-plane: `src/auth-signup-policy.ts` (A), `src/env.ts` (M), `src/routes/auth-spike.ts` (M),
  `scripts/smoke-auth-route-d1.mjs` (M, opt `open`), `test/auth-signup-policy.test.mjs` (A),
  `test/auth-spike-route.test.mjs` (M, guard tests).
- dashboard: `src/lib/auth-client.mjs` (A) + `.d.mts` (A), `src/app/account/page.tsx` (M),
  `src/i18n/dictionary.mjs` (M, EN+KO `account.auth`), `src/i18n/dictionary.d.mts` (M, type),
  `test/auth-client.test.mjs` (A).
- No `wrangler.toml`, migration, `.env`, or secret change.

## 8. Account UX behavior
- On `/account`, a read-only session status (loading / signed out / signed in as <email>) + a sign-out
  button when signed in, with "Controlled preview — not a public sign-up" copy and "your local projects /
  userKey are unchanged" note. No sign-up form; no route is forced behind auth.

## 9. Auth exposure guard decision
- Implemented now (Option A from the runbook). `AUTH_SIGNUP_MODE` fail-closed default `disabled` →
  when deployed, public sign-up is OFF unless explicitly opened. invite_only currently blocks public
  sign-up (invite-code enforcement is a later stage). Rate-limit guard (runbook Option B) not added — the
  policy guard is the higher-leverage control; Worker default rate limits remain.

## 10. userKey preservation
- No change to `workflow-store.ts` / `getUserKey` or any `*-api.ts` client. `/account` still reads the
  localStorage display name. No auth-user ↔ userKey link, no project claim, no workspace ownership change.

## 11. Tests / build / typecheck / verify
- central-plane auth tests **46/46** (incl. 4 `auth-signup-policy` + 4 route-guard) · route smoke **8/8**
  (sign-up opted `open`) · helper smoke **7/7**.
- dashboard build pass · dashboard **264/264** (incl. 5 `auth-client`) · `pnpm typecheck` **57/57** ·
  `pnpm verify` green · pre-push hook verify passed.

## 12. Safety scan
- 12 files under `apps/central-plane` + `apps/dashboard` only. No real secrets/tokens, no `AUTH_ENABLED`
  value, no `wrangler.toml`/migration/`.env`, no OAuth, no DNS/CORS, no broad-launch copy, no forced gate,
  no userKey/project migration, no dogfood PR change.

## 13. Production impact
- Zero on merge. PR not deployed; the live worker (`043331b`) keeps current behaviour (sign-up still open
  in prod). The guard closes sign-up exposure ONLY upon a future, separately-approved central-plane deploy.

## 14. M&A / enterprise readiness note
Moves Simsa from "auth API exists (and is openly reachable)" toward "controlled identity UX + launch
discipline": a fail-closed sign-up policy (auditable, env-reversible) and a controlled account surface that
shows session/logout without a public sign-up flow or a forced gate — preserving the identity → membership
→ permissions → audit roadmap.

## 15. Rollback plan
- Additive + revertible: `git revert` the squash commit. Production unaffected (not deployed). When later
  deployed, the guard itself is env-reversible (`AUTH_SIGNUP_MODE=open`) and `AUTH_ENABLED` rollback remains.

## 16. Recommended next stage
**Stage 242 — PR Merge Gate for Stage 241**, only after `"PR #172 merge approved."` (still non-live). A
later central-plane deploy gate ships the sign-up guard to production (closing the exposure); the
`AUTH_SIGNUP_MODE` value is an env decision at deploy time. Workspace membership schema / userKey bridge /
invite permissions remain separate stages.

# Stage 225 — Production Auth Env / Cookie Topology Readiness Gate

Date: 2026-06-26 · Type: planning / readiness memo only. **No env/secret/deploy/topology change made.**

## 1. Approval phrase observed
`"Auth production env topology readiness gate approved."` — present (direct). Authorizes a readiness
memo ONLY. Does NOT authorize env/secret provisioning, `AUTH_ENABLED` activation, production/dashboard
deploy, OAuth, Vercel rewrite, CORS code, DNS/domain, live dashboard change, payment/billing, MCP/npm
publish. No `wrangler secret put` / `wrangler deploy` / `vercel deploy` / env-mutation / DNS / OAuth /
remote-D1-mutation command was run.

## 2. Branch / HEAD
- main `28652f9` (Stage 221); HEAD == origin/main; worktree clean. No deploy or env/secret change since Stage 224.

## 3. Production / current main state
- Production URL https://app.trysimsa.com · deploy `9b645af` (Stage 182~183) — UNCHANGED.
- Production D1 has the 0047 auth schema (Stage 224: `user`/`session`/`account`/`verification` + 3 indexes), DORMANT.
- The deployed worker (`9b645af`) does NOT contain the new auth route code; `AUTH_ENABLED`/`BETTER_AUTH_SECRET`
  not provisioned; OAuth not configured; dashboard behavior unchanged.

## 4. Current env / code findings (from code, not assumption)
- Auth env vars declared in `src/env.ts`: **`AUTH_ENABLED?`, `AUTH_PROVIDER?`, `BETTER_AUTH_SECRET?`**
  (all optional strings). NOTE: the secret is named **`BETTER_AUTH_SECRET`** (the readiness runbook's
  "AUTH_SECRET" is shorthand for this exact var).
- `createBetterAuthRuntime` (src/better-auth-spike.ts) passes ONLY `{ secret, database, emailAndPassword:{enabled:true} }`.
  → **`AUTH_ENABLED` is the only activation flag; `BETTER_AUTH_SECRET` is the only required secret** for the
  current email/password runtime.
- ⚠️ **No `baseURL`, no `trustedOrigins`, no cookie/`advanced` config anywhere in `src/`** (grep-confirmed).
  Better Auth currently derives the origin from the incoming request (hence the benign "Base URL not set"
  warning in the smoke). → cookie/baseURL/trusted-origin behavior is **NOT configurable via env today**;
  supporting a specific production topology requires a FUTURE CODE STAGE, not an env value.
- DB binding present in `wrangler.toml` (`binding = "DB"` → `conclave-ai` / `28be7ec4…`); the route reads
  `env.DB`, so the production binding name already matches route expectation. On deploy the binding is present
  → no `auth_db_unavailable` risk from a missing binding.
- Dashboard → backend today: `NEXT_PUBLIC_CENTRAL_PLANE_URL ?? "https://conclave-ai.seunghunbae.workers.dev"`
  (cross-origin). No `vercel.json`; `next.config.ts` has **no rewrites/proxy**. → the current live topology is
  **cross-site** (app.trysimsa.com ↔ workers.dev); same-origin is not yet wired.

## 5. Required env / secrets (before enabling production auth)
- **Required:** `BETTER_AUTH_SECRET` (server-side signing secret; `wrangler secret put`, never in repo/wrangler.toml).
- **Activation:** `AUTH_ENABLED="true"` (hold until everything else is confirmed).
- **Not required by current code:** OAuth client IDs/secrets, email-provider creds (the runtime is
  email/password only, no OAuth/email provider configured).
- **Not yet supported by code (needs a code stage):** `baseURL` / `trustedOrigins` / cookie-domain config
  for production topology.

## 6. Env classification — safe pre-provision vs activation
- **Category A — safe to pre-provision while auth stays disabled:**
  - `BETTER_AUTH_SECRET` — setting it alone does nothing user-facing: the route is gated by `AUTH_ENABLED`
    (unset → 503 `auth_disabled`), and even enabled-without-deploy the live worker `9b645af` lacks the route code.
    Safe to set ahead of time. (No `baseURL`/`trustedOrigins` env exists to pre-provision — those are code, see §4.)
- **Category B — activation (HOLD):**
  - `AUTH_ENABLED="true"` — hold until D1 (done) + secret + topology code + rewrite + deploy are all confirmed.
- **Category C — not yet ready / future (code does not support; document, do not add):**
  - OAuth provider client IDs/secrets, email-provider credentials, production invite/team settings,
    billing/payment-auth coupling. None are wired; adding them is a separate future track.

## 7. Cookie / CORS / topology options
- **Option 1 — same-origin: `app.trysimsa.com/api/auth/*` → worker (Vercel rewrite).** Preferred.
  - Pros: first-party cookies, minimal CORS, safest session behavior.
  - Cons: needs a Vercel rewrite (separate approval) AND a code change to set Better Auth `baseURL =
    https://app.trysimsa.com` + `trustedOrigins` (currently absent — §4); must be tested before activation.
- **Option 2 — auth/API subdomain (e.g. `api.trysimsa.com` / `auth.trysimsa.com`).** Fallback.
  - Pros: clean API isolation.
  - Cons: cookie domain (`.trysimsa.com`) + CORS + trustedOrigins must be carefully configured (code +
    DNS); higher session-bug risk than same-origin.
- **Option 3 — workers.dev direct cross-site.** NOT recommended as primary.
  - Matches today's cross-site dashboard→worker call, but needs SameSite=None;Secure cookies + CORS
    credentials + trustedOrigins — fragile. Use only for temporary diagnostics if explicitly approved.

## 8. Recommended topology path
**Option 1 (same-origin Vercel rewrite)**, consistent with the prior topology decision. Because the
code does not yet set `baseURL`/`trustedOrigins`, the same-origin path has a **code prerequisite**: a
future stage must add production base-URL + trusted-origins (and any cookie) config to
`createBetterAuthRuntime` (env-driven, still gated) BEFORE activation. Keep workers.dev cross-site
(Option 3) out of the primary path.

## 9. Recommended future sequence (gates separate; nothing bundled)
1. **Stage 226 — Auth Production Secret Provisioning Gate** — after `"Auth production secret provisioning approved."`
   - Provision `BETTER_AUTH_SECRET` only (`wrangler secret put`). Keep `AUTH_ENABLED` unset. No deploy.
2. **Stage 227 — Cookie/CORS Topology Code + Plan Gate** — after `"Auth cookie/CORS topology approved."`
   - Add env-driven `baseURL`/`trustedOrigins`(/cookie) config to the runtime (still gated; local-tested)
     and finalize the same-origin Vercel rewrite plan (Option 1) or subdomain fallback. No activation.
   - (This is the code step that §4 shows is currently missing — keep it before deploy/activation.)
3. **Stage 228 — Auth-Disabled Production Deploy Gate** — after `"Dashboard deploy approved."`
   - Deploy main code with `AUTH_ENABLED` still unset/false. Verify `/api/auth/*` → 503 `auth_disabled`
     in production. No activation.
4. **Stage 229 — Auth Activation Gate** — after a new phrase, e.g. `"Production auth activation approved."`
   - Set `AUTH_ENABLED="true"` ONLY once D1 (done) + secret + topology code + rewrite + deploy are confirmed.
   - Verify safe production auth behavior; rollback plan required (unset `AUTH_ENABLED` → instant disable).

## 10. Future approval gates
- `"Auth production secret provisioning approved."` (Stage 226)
- `"Auth cookie/CORS topology approved."` (Stage 227)
- `"Dashboard deploy approved."` (Stage 228 — auth-disabled deploy)
- `"Production auth activation approved."` (Stage 229 — flip `AUTH_ENABLED`)
None executed here.

## 11. Risks and mitigations
| Risk | Mitigation |
|---|---|
| `AUTH_ENABLED` flipped before secret/topology ready | Activation is its own last gate (Stage 229); secret/topology/deploy precede it. |
| Auth route deployed without D1 binding | Binding `DB` already in wrangler.toml; missing binding → safe 503 `auth_db_unavailable`, no 500. |
| Wrong cookie domain | Same-origin (Option 1) avoids cross-domain cookies; subdomain needs explicit `.trysimsa.com` domain config. |
| CORS / trustedOrigins mismatch | Add `trustedOrigins` in the Stage 227 code step; same-origin minimizes CORS surface. |
| Session cookie not set / not sent | Root cause of cross-site pain → choose same-origin; test sign-in/session round-trip pre-activation. |
| Better Auth baseURL mismatch | Code does NOT set baseURL today → MUST add (Stage 227) before activation; else callbacks/redirects unreliable. |
| OAuth added too early | Category C; not wired; out of scope until a dedicated track. |
| userKey → real-user transition unresolved | No backfill in 0047; identity migration is a later, separate design+stage; keep userKey tenant fallback meanwhile. |
| `/account` UI still local/stub | Dashboard `/account` is a local stub; do not market real accounts until UX track lands. |
| Production deploy bundled with activation | Stage 228 (deploy, auth OFF) and Stage 229 (activation) are distinct gates — never bundle. |
| Rollback path unclear | Activation rollback = unset `AUTH_ENABLED` (instant 503 auth_disabled); schema is additive/dormant; secret can be rotated. |

## 12. Explicit non-actions (this stage performed NONE)
No `wrangler secret put`, no `wrangler deploy`, no `vercel deploy`/dashboard deploy, no env mutation, no
`AUTH_ENABLED` change, no OAuth, no Vercel rewrite, no CORS code, no DNS/domain, no remote D1 mutation, no
live dashboard change, no payment/billing, no MCP/npm publish, no code change on main, no dogfood PR #121~130 change.

## 13. Recommendation / recommended next stage
**Option A — readiness memo complete; safe to proceed to the secret provisioning gate.** Env requirements
are clear (`BETTER_AUTH_SECRET` required; `AUTH_ENABLED` activation-only), a safe pre-provision path exists
(Category A, gated), activation stays separate, and the topology recommendation is clear (same-origin
Vercel rewrite, with a documented code prerequisite handled in Stage 227). The only blockers are future
approvals.
**Recommended next stage: Stage 226 — Auth Production Secret Provisioning Gate**, only after
`"Auth production secret provisioning approved."` Production deploy (`"Dashboard deploy approved."`) and
auth activation (`"Production auth activation approved."`) remain separate and must not be bundled.

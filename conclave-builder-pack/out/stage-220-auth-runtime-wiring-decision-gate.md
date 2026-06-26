# Stage 220 — Auth Runtime Wiring Decision Gate

Date: 2026-06-26 · Type: planning / decision memo only (no code, no wiring, no deploy)

## 1. Approval phrase observed
`"Auth runtime wiring decision gate approved."` — present (direct, standalone). Authorizes this
planning/decision gate ONLY. No implementation, migration, deploy, OAuth, env, CORS, Vercel, DNS,
dashboard, or route-wiring change is authorized by it.

## 2. Current main / production state
- main HEAD = `772c040` (Stage 218 — Better Auth local runtime smoke, route stays unwired)
- production deploy = `9b645af` (Release: Stage 182~183 — Simsa Plan Map Read-only Preview) — UNCHANGED
- production URL = https://app.trysimsa.com

## 3. Current auth readiness
- `better-auth@1.6.20` + `kysely-d1@0.4.0` installed (central-plane only).
- `buildBetterAuthD1Database(db)` helper exists — compile-level + **runtime-proven in isolation**
  (Stage 218 smoke: real helper + Better Auth + local D1 over `0047` → sign-up 200, user/credential/
  session rows persisted, sign-in 200).
- `migrations/0047_better_auth_identity_tables.sql` exists (DRAFT on main). Applied to LOCAL D1 only
  (Stage 213). **Not applied to production.**
- `scripts/smoke-better-auth-d1.mjs` (dev-only) + `test/auth-route-unwired.test.mjs` (static guard) present.
- `/api/auth/*` route mounted but **disabled by default** (`503 auth_disabled`).
- `AUTH_ENABLED` default off; no local/production secret configured; no OAuth provider.
- `userKey` is still the legacy client-supplied tenant-scoping fallback — **not real identity**.

## 4. Invariants confirmed (A — current invariant review, on main `772c040`)
- ✅ Route remains UNWIRED — D1-helper refs in `router.ts` / `routes/auth-spike.ts` /
  `better-auth-spike.ts` = **0 / 0 / 0** (`better-auth-d1`, `buildBetterAuthD1Database`, `D1Dialect`, `kysely`).
- ✅ Helper is dev/proven but NOT active in any served path (`createBetterAuthSpike` passes no `database:`; stateless).
- ✅ `AUTH_ENABLED` default off (`enabled = e.AUTH_ENABLED === "true"`).
- ✅ Auth route returns `503 auth_disabled` by default.
- ✅ `userKey` remains legacy tenant fallback, not real identity.
- ✅ Production deploy remains `9b645af`.
- ✅ Production D1 `0047` migration NOT applied.
- ✅ No OAuth / provider live config.
- ✅ No billing / payment coupling to auth.

## 5. What remains missing before route wiring
1. **Production D1 schema** — `0047` not applied to remote D1 (route would 500 on first DB call without it).
2. **Secret provisioning** — `BETTER_AUTH_SECRET` exists in no environment (local or prod).
3. **Cookie / session topology** — Better Auth sets cookies; same-origin vs cross-origin
   (`app.trysimsa.com` dashboard ↔ `*.workers.dev` central-plane) + CORS credentials are undecided.
4. **Trusted origins** — Better Auth `trustedOrigins` must be set for the real dashboard origin(s).
5. **Product UX decisions** — email/password vs OAuth (Kakao/Naver), account model, workspace
   membership, invite/sharing scope, `/account` behavior (Auth-train planning, not yet built).
6. **userKey → real-user migration** — strategy to map existing `user_key`-scoped rows to real users.

## 6. Wiring options (B)

### Option 1 — Hold / keep unwired
- No implementation. Safest. Production untouched.
- Appropriate while migration/env/deploy topology or product UX are not ready.
- Cost: no forward progress on real identity.

### Option 2 — Local-only DB-backed route wiring branch (RECOMMENDED next)
- Wire `/api/auth/*` → `createBetterAuthSpike` → `buildBetterAuthD1Database(c.env.DB)`, but ONLY
  behind the existing gates: `AUTH_ENABLED === "true"` AND secret present AND `env.DB` present →
  otherwise unchanged `503 auth_disabled` / `503 auth_not_configured`.
- Default served behavior stays disabled (production = `AUTH_ENABLED` unset → identical to today).
- Validate **local route** behavior only (against local D1 with `0047`); no deploy, no prod migration.
- Update/replace the `auth-route-unwired` guard with a "gated-wiring" guard that still forbids
  import-time/default-on activation, so the disabled-by-default invariant stays machine-checked.
- Lands as a normal merge-gated PR; merge still requires an explicit phrase. **No production effect**
  until a separate prod migration + deploy.
- This is the smallest reversible step that converts the proven helper into a real (still-dormant) route.

### Option 3 — Production-ready wiring sequence
- Ordered: prod `0047` migration → prod secret/env → same-origin or approved auth-domain topology →
  cookie/CORS decision → deploy → live smoke + rollback plan.
- Higher risk; **must NOT be bundled into one stage**. Each step is its own gate.
- Premature: blocked on Option 2 validation + product UX + topology decisions.

### Option 4 — Defer permanent wiring until auth product decisions
- Resolve account model, workspace membership, session behavior, OAuth vs email/password,
  `/account` UI, invite/team sharing scope first; then wire.
- Reduces rework risk but delays any identity capability. Compatible with doing Option 2 as a dormant
  local proof in parallel (recommended), since Option 2 changes no served behavior.

## 7. Recommended path (D)
**Stage 221 — Local-only Auth Runtime Wiring Branch (Option 2)**, executed ONLY after the new phrase
`"Auth local runtime wiring branch approved."`

Stage 221 scope (when approved):
- Wire route → D1-backed Better Auth **only behind the existing `AUTH_ENABLED` + secret + `env.DB` gates**.
- Preserve default disabled behavior (`503 auth_disabled` when off).
- Local-only tests + local route validation; reuse the Stage 218 smoke.
- Convert `auth-route-unwired` guard → gated-wiring guard (no import-time activation, default-off enforced).
- NOT: deploy, production migration, OAuth, env provisioning, dashboard/live change, CORS/Vercel/DNS.

Parallel: product UX decisions (Option 4 topics) proceed independently as docs; they do not block the
dormant local wiring proof.

## 8. Future approval phrases (C — define, do NOT execute)
- `"Auth local runtime wiring branch approved."` — start Stage 221 (Option 2, local-only, dormant).
- `"PR #<number> merge approved."` — merge the Stage 221 PR (per-PR, exact number).
- `"Production auth migration approved."` — apply `0047` to remote D1.
- `"Dashboard deploy approved."` — deploy central-plane / dashboard.
- Proposed additional gates (for Option 3 ordering):
  - `"Auth production secret provisioning approved."` — set `BETTER_AUTH_SECRET` + `AUTH_ENABLED` in prod.
  - `"Auth cookie/CORS topology approved."` — lock same-origin vs cross-origin + trustedOrigins/CORS-credentials.

## 9. Risk register (E)
| Risk | Mitigation |
|---|---|
| Route accidentally active in production | Keep `AUTH_ENABLED` default off; gated-wiring guard test forbids default-on/import-time activation; prod env never sets the flag until its own gate. |
| Production D1 missing `0047` | Sequence prod migration BEFORE any deploy that could enable the route; deploy gate separate from migration gate. |
| Cookie / CORS / topology mismatch | Decide same-origin vs cross-origin + `trustedOrigins` + CORS credentials BEFORE deploy (`"Auth cookie/CORS topology approved."`). |
| Windows / workerd teardown crash via `pnpm --filter <pkg> run` (exit `0xC0000409`) observed in smoke | Known environmental teardown issue, NOT a logic failure; run smoke directly / in-package; document in runbook; do not gate CI on the root-invocation path. |
| Email/password behavior without final product UX | Treat Option 2 as dormant proof only; do not expose to users until UX + `/account` decided. |
| `userKey` → real-user migration complexity | Design backfill (Auth-train phase) before flipping any user-facing identity; keep tenant fallback until migrated. |
| Accidental deploy before migration | Migration and deploy are independent phrases; never bundle; checklist requires prod `0047` confirmed before deploy. |

## 10. Explicit non-actions (this stage performed NONE of these)
Route wiring, auth runtime behavior change, local migration apply, production migration, deploy,
production env vars, OAuth, CORS change, Vercel rewrite, DNS/domain, dashboard UI change, live
dashboard behavior change, MCP/npm publish, touching dogfood PRs #121~130. Decision memo only.

## 11. Recommended next stage
**Stage 221 — Local-only Auth Runtime Wiring Branch** — only after `"Auth local runtime wiring
branch approved."` Production migration and deploy remain separate, later gates.

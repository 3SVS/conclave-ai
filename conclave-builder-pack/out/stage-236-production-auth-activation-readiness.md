# Stage 236 — Production Auth Activation Readiness Gate

Date: 2026-06-27 · Type: planning / readiness memo only. **No activation / env / secret / deploy / D1 change.**

## 1. Approval phrase observed
`"Production auth activation readiness approved."` — present (direct). Authorizes a readiness memo ONLY.
Does NOT authorize `AUTH_ENABLED` activation, env/secret change, central-plane/dashboard deploy, production
D1 mutation, OAuth, DNS, CORS prod, successful sign-up/sign-in, payment, MCP/npm publish. Only read-only
HTTP + read-only D1 + value-free secret metadata + local code inspection were performed.

## 2. Branch / HEAD
- main `e8d42cc` (Stage 232); HEAD == origin/main; worktree clean. central-plane Worker remains `043331b`;
  Stage 235 dashboard rewrite deploy (`dpl_6AGwib8…`) remains live; no env/secret change since Stage 226;
  no D1 mutation since Stage 224; `AUTH_ENABLED` unset.

## 3. Current production state
- `app.trysimsa.com` serves Vercel `dpl_6AGwib8CD9mU4utSXko4yUnJoZFf` with the same-origin rewrite LIVE.
- central-plane Worker `043331b` (`/health` 0.13.15 production). D1 0047 dormant. `BETTER_AUTH_SECRET`
  provisioned. `AUTH_ENABLED` / `BETTER_AUTH_BASE_URL` / `BETTER_AUTH_TRUSTED_ORIGINS` unset. OAuth unset.

## 4. Baseline HTTP checks (read-only)
- `app.trysimsa.com/` → 307 (loads/redirects). `app.trysimsa.com/api/auth/ok` → **503 `auth_disabled`**;
  `…/sign-up/email` → **503 `auth_disabled`**. Worker `/api/auth/ok` → **503 `auth_disabled`**; `/health` → 200.

## 5. D1 dormancy verification (read-only)
- auth objects = **7** (4 tables + 3 indexes). user/session/account/verification = **0/0/0/0**.

## 6. Env / secret metadata (value-free)
- `BETTER_AUTH_SECRET` present. `AUTH_ENABLED` / `BETTER_AUTH_BASE_URL` / `BETTER_AUTH_TRUSTED_ORIGINS` not
  secrets and not in `wrangler.toml [vars]` → unset. OAuth unset.

## 7. Activation code path findings (from code, main `e8d42cc`)
- `AUTH_ENABLED === "true"` is the ONLY activation flag (`auth-spike-config.ts`); default false.
- Gate ladder (`resolveAuthRuntimeGate`): `disabled` → `not_configured` (no secret) → `db_unavailable`
  (no `env.DB`) → `ready`. So secret AND D1 binding are required before any runtime is constructed.
- Topology (`createBetterAuthRuntime`): `baseURL` / `trustedOrigins` are spread ONLY when set
  (`...(topology.baseURL ? ...)`), so they are optional but applied when present.
- `app.trysimsa.com/api/auth/*` now routes to the central-plane Worker (rewrite live, `/api/auth/:path*`).
- Activation does NOT require: dashboard redeploy, D1 migration, central-plane deploy, or OAuth.
- ★ Same-origin caveat: the rewrite PROXIES to the Worker host, so without `BETTER_AUTH_BASE_URL` Better
  Auth derives the origin from the proxied (worker) host and the browser `Origin: https://app.trysimsa.com`
  would not be in `trustedOrigins`. Therefore topology env MUST be set BEFORE activation for the
  first-party flow (cookies/redirects/origin-check) to work correctly.

## 8. Activation prerequisites
**Already complete:**
- Production D1 0047 schema applied (Stage 224); `BETTER_AUTH_SECRET` provisioned (Stage 226);
  central-plane auth code deployed (Stage 230); same-origin rewrite deployed + LIVE (Stage 235);
  `app.trysimsa.com/api/auth/*` → 503 `auth_disabled`; D1 auth rows 0; route boundary verified; rollback documented.

**Still required before `AUTH_ENABLED=true`:**
- Set `BETTER_AUTH_BASE_URL=https://app.trysimsa.com` (Worker).
- Set `BETTER_AUTH_TRUSTED_ORIGINS=https://app.trysimsa.com` (Worker).
- Re-verify disabled behavior after topology provisioning (still 503 `auth_disabled`; D1 rows still 0).
- Define the activation smoke payload (below).
- Define the rollback command (below).
- Bae's explicit activation approval phrase.

Recommended trusted origins: **`https://app.trysimsa.com`** only (add others only with repo evidence or
explicit Bae approval).

## 9. Recommended remaining sequence (each a separate, explicit gate)
- **Stage 237 — Production Auth Topology Env Provisioning Gate** — `"Production auth topology env provisioning approved."`
  - Set `BETTER_AUTH_BASE_URL` + `BETTER_AUTH_TRUSTED_ORIGINS` (Worker); keep `AUTH_ENABLED` unset; no deploy,
    no D1 mutation; verify `app.trysimsa.com/api/auth/*` still 503 `auth_disabled`; D1 rows still 0.
- **Stage 238 — Production Auth Activation Gate** — `"Production auth activation approved."`
  - Set `AUTH_ENABLED=true` ONLY; no deploy/migration/secret-rotation; run a limited production auth smoke;
    verify D1 rows created only by the approved smoke; rollback by removing/disabling `AUTH_ENABLED`.
- **Stage 239 — Post-Activation Observation / Productization Gate**
  - Observe session/cookie behavior; document account/user-model gaps; do NOT launch broad user-facing auth
    until `/account` + workspace-membership policy is ready (userKey → real-user mapping unresolved).

## 10. Future topology env provisioning commands — DOCUMENTED, NOT EXECUTED (Stage 237)
Operator-run in a separate terminal (interactive secure prompt; values are non-sensitive public URLs):
```
# from apps/central-plane (absolute path), one value pasted per prompt
npx wrangler secret put BETTER_AUTH_BASE_URL          # value: https://app.trysimsa.com
npx wrangler secret put BETTER_AUTH_TRUSTED_ORIGINS   # value: https://app.trysimsa.com
```
- Recommended as **secrets** (no `wrangler.toml` edit; reversible via `secret delete` without a code deploy).
- Alternative: set as non-secret `wrangler.toml [vars]` (they are public URLs) — but that requires a code
  deploy to change/rollback, so it is LESS reversible. Do NOT change `wrangler.toml` in Stage 236/237 unless
  explicitly chosen.

## 11. Future activation command — DOCUMENTED, NOT EXECUTED (Stage 238)
```
npx wrangler secret put AUTH_ENABLED                  # value: true
```
- Single, explicit env change. NO deploy, NO migration, NO secret rotation, NO OAuth bundled. Recommended as
  a secret so rollback is `wrangler secret delete AUTH_ENABLED` (no code deploy needed).

## 12. Production smoke plan (allowed only in Stage 238, after activation approval)
Minimal, marked test account:
1. `GET app.trysimsa.com/api/auth/ok` → no longer `503 auth_disabled` (Better Auth now handles it; note
   `ok` is not a real endpoint → expect Better Auth's own response, likely **404**, NOT 503 — that proves
   activation took effect). The real proof is sign-up/sign-in below.
2. `POST app.trysimsa.com/api/auth/sign-up/email` with a clearly-marked test account → expect **2xx**;
   creates 1 `user` + 1 `account` (credential) row, and (auto-sign-in) typically 1 `session` row.
3. `POST app.trysimsa.com/api/auth/sign-in/email` (same creds) → 2xx; verify a session.
4. Read-only D1: expected deltas = +1 user, +1 account, +1..2 session; NO unexpected extra rows.
5. Cleanup: do NOT delete rows without a separate cleanup approval; otherwise record the test account
   identifiers in the Stage 238 report.
- If the endpoint path/payload is uncertain at execution time, Stage 238 STOPS before mutation and reports hold.
  (Path/payload are confirmed by the Stage 221 local route smoke, but re-confirm against live before mutating.)

## 13. Rollback / containment plan
Order if activation misbehaves:
1. **Disable first:** `npx wrangler secret delete AUTH_ENABLED` (returns to unset → `disabled`), OR overwrite
   `AUTH_ENABLED` with a non-`"true"` value (code checks `=== "true"`). Either re-versions the Worker reusing
   the current script (no code deploy). `secret delete` is cleanest (back to today's exact state).
2. Verify `app.trysimsa.com/api/auth/*` returns `503 auth_disabled` again; verify D1 row counts.
3. Keep `BETTER_AUTH_SECRET` + topology env in place (unless separate approval says otherwise).
4. Do NOT drop the 0047 schema. Do NOT rotate/delete `BETTER_AUTH_SECRET` unless compromise suspected + separately approved.
5. If the dashboard rewrite is the issue → roll back the Vercel deployment (`conclave-dashboard-koizhx3bu-…`).
6. If the Worker code is the issue → `wrangler rollback` the central-plane Worker.
- Supported mechanisms (Wrangler/Cloudflare): `wrangler secret delete NAME` (supported) and `wrangler secret
  put NAME` overwrite (supported); both effective without a code deploy. Overwriting `AUTH_ENABLED=false`
  works because the code only treats exactly `"true"` as enabled. `secret delete` is the safer/cleaner rollback.

## 14. Risks / holds
| Risk | Mitigation |
|---|---|
| `AUTH_ENABLED` secret vs var ambiguity | Recommend secret (reversible via `secret delete`, no deploy); document the var trade-off. |
| Inability to remove env quickly | `wrangler secret delete AUTH_ENABLED` is instant + no code deploy; rehearse the command before Stage 238. |
| Better Auth endpoint shape mismatch | Path/payload confirmed by Stage 221 route smoke; re-confirm live before any mutating call. |
| Test-account row cleanup policy | Do not delete without separate approval; record identifiers instead. |
| Cookie/session not set (baseURL/trustedOrigins mismatch) | Set topology env to `https://app.trysimsa.com` FIRST (Stage 237) and verify. |
| Trusted origin too broad | Restrict to `https://app.trysimsa.com` only. |
| Accidental broad launch before workspace/account UX ready | Stage 239 gates productization; activation ≠ launch. |
| D1 row mutation during smoke | Smoke is minimal + marked; deltas verified read-only; otherwise stop. |
| Rollback not rehearsed | Document + dry-confirm the disable command in Stage 238 before activating. |
| central-plane direct Worker host still reachable | Expected (`…workers.dev/api/auth/*`); trustedOrigins limits browser usage; document. |
| OAuth absent | Out of scope; email/password only. |
| userKey → real-user mapping unresolved | Productization (Stage 239+) decision; keep tenant fallback meanwhile. |
| `/account` UI / workspace membership incomplete | Do not launch user-facing auth until ready. |

## 15. M&A / enterprise readiness note
Activation is treated as a separate, auditable release event: prerequisites enumerated, topology
provisioning split from the flag flip, a minimal evidence-bearing smoke, and an instant no-deploy rollback
(`secret delete AUTH_ENABLED`) — with no hidden coupling to deploys or migrations.

## 16. Explicit non-actions (NONE performed)
No `AUTH_ENABLED` activation, no env/secret change or rotation, no central-plane/dashboard deploy, no
production D1 mutation/write, no OAuth, no DNS/domain, no Vercel rewrite change, no CORS prod change, no live
dashboard behavior change, no successful sign-up/sign-in, no payment/billing, no MCP/npm publish, no code
change on main, no dogfood PR #121~130 change.

## 17. Recommendation / recommended next stage
**Option A — Production auth activation readiness complete; proceed to topology env provisioning gate.**
Production is auth-disabled + healthy, the same-origin rewrite works, D1 rows are 0, prerequisites and
topology values are clear (`https://app.trysimsa.com`), and an instant rollback exists. Only explicit env
provisioning approval remains.
**Recommended next stage: Stage 237 — Production Auth Topology Env Provisioning Gate**, only after
`"Production auth topology env provisioning approved."` Activation remains separate
(`"Production auth activation approved."`).

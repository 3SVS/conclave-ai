# Auth topology — env config + same-origin rewrite plan (Stage 227)

Status: **code-readiness only.** No production env is set, no deploy, no `AUTH_ENABLED` activation.
The Better Auth route is wired but gated (`AUTH_ENABLED` unset → `503 auth_disabled`).

## Topology env (optional, additive, non-activating)

Both are OPTIONAL and map 1:1 to verified Better Auth 1.6.20 options
(`@better-auth/core` init-options). When unset, the runtime behaves exactly as today (Better Auth
derives the origin from the incoming request). Setting them does **not** activate auth — that stays
gated by `AUTH_ENABLED`.

| Env var | Better Auth option | Meaning |
|---|---|---|
| `BETTER_AUTH_BASE_URL` | `baseURL: string` | Production base URL, e.g. `https://app.trysimsa.com`. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | `trustedOrigins: string[]` | Comma-separated allowed origins. |

Parsing is fail-closed: empty / whitespace-only values are ignored (treated as unset); a comma list is
trimmed and empties dropped (`src/auth-topology.ts`, tested in `test/auth-topology.test.mjs`). Cookie /
`advanced` options are intentionally deferred (see below).

## Recommended production path — same-origin Vercel rewrite (preferred)

Route the auth API under the dashboard's own origin so Better Auth cookies are first-party:

```
app.trysimsa.com/api/auth/*   →   <central-plane worker>/api/auth/*
```

- **Why preferred:** first-party cookies on `app.trysimsa.com`, minimal CORS surface, safest session
  behavior (no SameSite=None / cross-site cookie fragility).
- With this rewrite, set `BETTER_AUTH_BASE_URL=https://app.trysimsa.com` and
  `BETTER_AUTH_TRUSTED_ORIGINS=https://app.trysimsa.com` so callbacks/redirects and origin checks resolve
  to the user-facing origin rather than the worker host.

### Why NOT workers.dev cross-site as the primary path
The dashboard today calls the worker cross-origin (`*.workers.dev`). Driving auth that way needs
`SameSite=None; Secure` cookies + CORS credentials + trusted origins — fragile and easy to misconfigure.
Use only for temporary diagnostics, if ever, and never as the production default.

### Subdomain fallback (e.g. `api.trysimsa.com`)
If a same-origin rewrite is not feasible, a dedicated auth/API subdomain is the fallback. It requires
cookie-domain config (`.trysimsa.com`) via Better Auth `advanced.cookies` (a code addition deferred from
this stage) plus DNS — higher session-bug risk than same-origin.

## What must be tested before deploy/activation
1. With the rewrite in place (preview), sign-up → session cookie is set on `app.trysimsa.com` and sent on
   the follow-up request; sign-in round-trips.
2. `trustedOrigins` accepts the dashboard origin and rejects others.
3. With `AUTH_ENABLED` unset, `/api/auth/*` still returns `503 auth_disabled` in the deployed worker.

## Gates (each separate; never bundled)
- This stage (227): code + config support + docs only — **no** env/deploy/activation.
- Vercel rewrite to production: requires explicit approval before any `vercel.json`/rewrite change is shipped.
- `"Dashboard deploy approved."` — deploy the auth-disabled worker/dashboard.
- `"Production auth activation approved."` — set `AUTH_ENABLED=true` only after D1 (done), secret (done),
  topology env, rewrite, and deploy are all confirmed.

## Deferred (not in this stage)
- Cookie config via `advanced.cookies` (domain/secure/sameSite) — only needed for the subdomain fallback;
  same-origin uses first-party defaults.
- `userKey` → real-user migration; OAuth providers; `/account` UI productization.

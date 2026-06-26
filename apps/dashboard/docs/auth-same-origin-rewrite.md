# Same-origin auth rewrite (Stage 232)

Status: **code readiness only.** Merging this does NOT change live behavior — the dashboard deploys
manually (`vercel deploy --prod`); the rewrite goes live only on the next dashboard deploy (a separate,
explicitly-approved step). It does NOT activate auth.

## What it does
`next.config.ts` proxies first-party `/api/auth/*` on the dashboard origin to the central-plane Worker:

```
app.trysimsa.com/api/auth/:path*  →  ${CENTRAL_PLANE_AUTH_ORIGIN}/api/auth/:path*
```

This makes Better Auth cookies first-party on `app.trysimsa.com` once auth is later activated (the
preferred same-origin topology from Stage 225/227). Scoped to `/api/auth/:path*` only — it does not
shadow any other dashboard route (the dashboard has no `/api/auth` handler today; `…/api/auth/ok`
currently 404s).

## Destination env (server-side only)
| Env | Used by | Default |
|---|---|---|
| `CENTRAL_PLANE_AUTH_ORIGIN` | `next.config.ts` rewrite (build/server only — NOT exposed to client) | `https://conclave-ai.seunghunbae.workers.dev` (documented production Worker origin) |

Fail-safe: missing / empty / non-`http(s)` values fall back to the default; trailing slashes are
stripped (`src/lib/auth-rewrite.mjs`, tested in `test/auth-rewrite.test.mjs`). No secret/URL value is
required in the repo; the default already points at the production Worker.

## Why this is not activation
While `AUTH_ENABLED` is unset on the Worker, `/api/auth/*` returns `503 auth_disabled`. After a future
dashboard deploy, `app.trysimsa.com/api/auth/ok` will return that same `503 auth_disabled` (proxied) —
no sign-up/sign-in, no D1 rows. Activation is a separate, later gate.

## Future deploy + verification (NOT executed here)
Future dashboard deploy requires explicit approval, e.g. `"Auth same-origin rewrite deploy approved."`
After that deploy, verify (auth still disabled):
- `GET https://app.trysimsa.com/api/auth/ok` → `503 auth_disabled` (proxied to the Worker)
- `POST https://app.trysimsa.com/api/auth/sign-up/email` → `503 auth_disabled`
- Worker direct `…workers.dev/api/auth/ok` → still `503 auth_disabled`
- production D1 auth rows remain `0`; `AUTH_ENABLED` remains unset; dashboard loads normally

## Gates (separate; never bundled)
- This stage (232): code/config + tests + docs only — no deploy, no env set, no activation.
- `"Auth same-origin rewrite deploy approved."` — deploy the dashboard so the rewrite goes live (disabled).
- `"Production auth activation approved."` — set `AUTH_ENABLED=true` only after the rewrite is live +
  verified disabled and `BETTER_AUTH_BASE_URL`/`BETTER_AUTH_TRUSTED_ORIGINS` are set on the Worker.

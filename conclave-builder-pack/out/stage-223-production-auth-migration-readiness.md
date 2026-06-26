# Stage 223 — Production Auth Migration Readiness Gate

Date: 2026-06-26 · Type: planning / readiness memo + runbook only. **No production touched.**

## 1. Approval phrase observed
`"Production auth migration readiness gate approved."` — present (direct). Authorizes a readiness
memo + runbook ONLY. Does NOT authorize production migration execution, deploy, env changes, OAuth,
Vercel, CORS, DNS, payment/billing, MCP/npm publish, or live dashboard change. No `--remote` D1 / no
deploy command was run in this stage.

## 2. Branch / HEAD
- main `28652f9` (Stage 221 — Local-only auth runtime wiring); HEAD == origin/main; worktree clean.

## 3. Production / current main state
- Production URL: https://app.trysimsa.com · production deploy: `9b645af` (Stage 182~183) — UNCHANGED.
- main: `28652f9`. Route is WIRED but GATED; `AUTH_ENABLED` unset in production → 503 `auth_disabled`.
- Production `0047` NOT applied · production auth env NOT provisioned · dashboard NOT redeployed ·
  OAuth NOT configured.

## 4. Migration file review (`migrations/0047_better_auth_identity_tables.sql`)
- sha256 = `98dfdbe8c09d454bdae8841ac95f3b9b61933c9e90179e09aea15d99ef8df644`
- Additive / idempotent: 4 × `CREATE TABLE IF NOT EXISTS` (`user`, `session`, `account`,
  `verification`) + 3 × `CREATE INDEX IF NOT EXISTS` (`idx_session_userId`, `idx_account_userId`,
  `idx_verification_identifier`).
- No `DROP`, no destructive `ALTER`, no `DELETE FROM` / `TRUNCATE` / `UPDATE`. (`ON DELETE CASCADE`
  appears twice — these are FK referential clauses INSIDE the `CREATE TABLE`s, not destructive
  statements.) Asserted by `test/auth-migration-draft.test.mjs` (comment-stripped scan).
- Column names are Better Auth's documented camelCase schema (`emailVerified`, `userId`, `createdAt`,
  …); D1/SQLite-compatible types only. Does NOT touch `workspace_*` / `project` / `user_key` tables.
- Matches the schema the local smokes exercised end-to-end (sign-up/sign-in persist).

## 5. D1 target review (from `wrangler.toml`, local read only)
- Single D1 binding — unambiguous:
  - `binding = "DB"` · `database_name = "conclave-ai"` · `database_id = "28be7ec4-9c46-4b78-8d07-11f344021dd0"`
- `wrangler.toml` was NOT modified by Stage 221 (last touched at Stage 31 `07d2135`). No production
  env/secret value lives in the repo — `BETTER_AUTH_SECRET` is a `wrangler secret` (not in `wrangler.toml`).

## 6. Local verification results (no remote/prod access)
- `pnpm --filter @conclave-ai/central-plane build` → pass
- auth tests (5 files) → **29/29 pass, 0 fail**
- `smoke:better-auth-d1` → **7/7** (exit 0, direct run); `smoke:auth-route-d1` → **8/8** (exit 0, direct run)
- `pnpm typecheck` (monorepo) → **57/57**
- Windows note: `pnpm --filter <pkg> run smoke:*` from repo root can crash with `0xC0000409` during
  workerd teardown under pnpm's recursive runner — environmental, NOT a logic failure; run smokes
  directly / in-package (deterministic PASS, as above).

## 7. Future production migration command — DOCUMENTED, NOT EXECUTED
Run ONLY after `"Production auth migration approved."`, from repo root. Targeted single-file apply
(idempotent), mirroring how `0047` was applied locally in Stage 213:

```
WRANGLER_SEND_METRICS=false CI=1 \
  pnpm --filter @conclave-ai/central-plane exec \
  wrangler d1 execute conclave-ai --remote \
  --file=./migrations/0047_better_auth_identity_tables.sql
```

- Target `conclave-ai` matches `database_name` in `wrangler.toml` (id `28be7ec4…`). `--file` is
  relative to the central-plane package dir (where `pnpm --filter … exec` runs).
- ⚠️ DO NOT use `wrangler d1 migrations apply conclave-ai --remote` (the repo's `migrate:apply`) for
  this — it applies ALL pending numbered migrations in `migrations/`, not just `0047`. The targeted
  `d1 execute --file` is the safe, single-purpose apply.
- Post-apply schema verification (read-only):
```
WRANGLER_SEND_METRICS=false CI=1 \
  pnpm --filter @conclave-ai/central-plane exec \
  wrangler d1 execute conclave-ai --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('user','session','account','verification') ORDER BY name"
```
  Expect 4 rows: `account`, `session`, `user`, `verification`.

## 8. Readiness checklist (verify before future production apply)
| Item | Value / requirement |
|---|---|
| current main SHA | `28652f9` (or newer; re-confirm at apply time) |
| production deploy SHA | `9b645af` (unchanged; migration does NOT require redeploy) |
| production D1 target | binding `DB` · name `conclave-ai` · id `28be7ec4-9c46-4b78-8d07-11f344021dd0` |
| migration file checksum | sha256 `98dfdbe8c09d454bdae8841ac95f3b9b61933c9e90179e09aea15d99ef8df644` |
| additive-only review | ✅ CREATE IF NOT EXISTS only; no DROP/ALTER/DELETE/TRUNCATE |
| expected tables | `user`, `session`, `account`, `verification` |
| expected indexes | `idx_session_userId`, `idx_account_userId`, `idx_verification_identifier` |
| backup / rollback posture | idempotent + additive; pre-apply, confirm these 4 tables do NOT already exist (or are Better-Auth-shaped); no existing prod table is named user/session/account/verification (verify with the read-only command above) |
| exact command | see §7 (targeted `d1 execute --remote --file`) |
| expected output | wrangler reports N statements executed, 0 errors (or "no changes" on idempotent re-run) |
| post-apply verification | read-only SELECT in §7 returns the 4 tables |
| no app deploy bundled | migration ONLY; no `wrangler deploy`, no dashboard deploy |
| AUTH_ENABLED stays off | remains unset in prod after migration → route stays dormant (503 auth_disabled) |
| rollback note | see §9 |
| owner approval phrase | `"Production auth migration approved."` |

## 9. Risk register
| Risk | Mitigation |
|---|---|
| Applying `0047` to the wrong D1 | Single unambiguous binding `conclave-ai`/`28be7ec4…`; command pins the name; verify target before run. |
| Production schema drift / name collision | Pre-apply read-only SELECT to confirm no pre-existing `user`/`session`/`account`/`verification` of a different shape; `IF NOT EXISTS` no-ops if already correct. |
| Better Auth schema mismatch | `0047` matches Better Auth 1.6.20 documented schema and is the exact schema the local smokes drove successfully; checksum-pinned. |
| Env secret missing after migration | Migration alone does NOT enable auth; secret provisioning is its own gate; route stays dormant until `AUTH_ENABLED` + secret are set at deploy/env time. |
| DB binding absent after deploy | Route returns 503 `auth_db_unavailable` (safe) — no 500/leak. |
| Route active before env/topology ready | `AUTH_ENABLED` unset in prod → 503 `auth_disabled`; migration does not flip it. |
| cookie/baseURL/CORS topology unresolved | Out of scope for migration; resolve under the deploy + topology gates before enabling. |
| Windows workerd teardown (`0xC0000409`) via root pnpm | Dev-only smoke artifact; run smokes directly/in-package; irrelevant to remote migration. |
| userKey → real-user transition unresolved | No backfill in `0047` (additive only); identity migration is a later, separate design+stage. |
| Production deploy conflated with migration | Migration is independent and changes no served behaviour; deploy is a separate gate. |

## 10. Future approval gates (NOT executed here)
- `"Production auth migration approved."` — run the §7 targeted `d1 execute --remote --file`.
- `"Dashboard deploy approved."` — deploy (separate).
- Suggested additional, before enabling auth in prod:
  - `"Auth production secret provisioning approved."` — set `BETTER_AUTH_SECRET` + `AUTH_ENABLED` in prod.
  - `"Auth cookie/CORS topology approved."` — lock same-origin vs cross-origin + trustedOrigins/CORS-credentials.

## 11. Explicit non-actions (this stage performed NONE of these)
No `wrangler d1 execute --remote`, no `wrangler d1 migrations apply --remote`, no production D1
mutation, no production deploy, no dashboard deploy, no production env var change, no OAuth, no
Vercel/CORS/DNS, no payment/billing, no MCP/npm publish, no live dashboard behavior change, no dogfood
PR #121~130 change. Readiness memo + runbook only.

## 12. Recommendation
**Option A — Production auth migration readiness memo complete; ready for explicit migration approval.**
Migration target is clear and singular, the file is additive/idempotent and checksum-pinned, local
verification passes, the future command is exact and safe (targeted execute, not bulk migrations apply),
and applying it changes no served behaviour (route stays dormant). The only remaining prerequisite is
the human approval phrase. Cookie/CORS/env topology remain deferred to their own gates and do NOT block
the migration itself.

## 13. Recommended next stage
**Stage 224 — Production Auth Migration Apply Gate**, only after `"Production auth migration approved."`
Production deploy remains separate (`"Dashboard deploy approved."`).

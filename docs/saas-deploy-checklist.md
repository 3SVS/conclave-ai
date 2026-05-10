# SaaS deploy checklist — Cloudflare Worker + Containers

End-to-end procedure for deploying the central-plane Worker + the
ConclaveSandbox container that runs `/saas/review` and `/saas/autofix`
jobs. Walks through both **first-time setup** (account-level tasks
Bae does once) and the **per-deploy verification** (each release).

For background on what runs where, see
[`docs/saas-architecture.md`](./saas-architecture.md) — until that
doc lands, the architecture story is:

```
GitHub PR push  ──▶  /webhook/github         (Worker, Hono on cf-workers)
                    │
                    ├─▶ /saas/review (or webhook auto-spawn)
                    │     ├─▶ env.SANDBOX.idFromName(`pr-{repo}-{N}`).get()
                    │     │     └─▶ Container DO (ConclaveSandbox)
                    │     │           └─▶ container/server.mjs (Node 20 in Docker)
                    │     │                 ├─ git clone PR
                    │     │                 ├─ runAutofix (cli/dist/autofix-pipeline)
                    │     │                 └─ POST /internal/job-done ──┐
                    │     │                                              │
                    │     └─◀──────────────────────────────────────────  ┘
                    │           callback delivers verdict + blockers
                    │
                    └─▶ /saas/me, /saas/jobs/:id      (CLI consumer surface)
```

---

## 1. First-time CF account setup (Bae once)

These steps create accounts/keys/apps. Skip what's already done — every
question below has a way to verify the current state.

### 1.1 Cloudflare account + Containers paid plan

- [ ] Account ID known: `wrangler whoami` (or check
      `https://dash.cloudflare.com/<account-id>` URL on the dashboard).
- [ ] Containers paid plan provisioned ($5/mo). Verify in dashboard:
      Workers & Pages → Containers → "Your plan" shows Paid.
      The free plan **cannot** run `[[containers]]`.
- [ ] D1 database `conclave-ai` exists. `wrangler d1 list` should
      include the id `28be7ec4-9c46-4b78-8d07-11f344021dd0` (matches
      `wrangler.toml`'s `database_id`).

### 1.2 GitHub App (`conclave-ai-code-council`)

The App's identity is in `apps/central-plane/wrangler.toml`:
`GITHUB_CLIENT_ID = "Ov23ctqhuNRdhunT36Y9"`. If that App still exists
on GitHub, this section is done — go to §1.3.

- [ ] GitHub App registered at <https://github.com/settings/apps>:
      - Permissions: contents read+write, pull_requests read+write,
        issues write, checks write, metadata read.
      - Events subscribed: `installation`, `pull_request`, `check_run`,
        `installation_repositories`.
      - Webhook URL: `https://conclave-ai.seunghunbae.workers.dev/webhook/github`
      - User authorization callback: `…/auth/github/callback`
- [ ] App private key (.pem) downloaded and stored locally.
      You'll pipe it into `wrangler secret put GH_APP_PRIVATE_KEY`
      below.

### 1.3 GitHub Actions repo secrets

Required for `deploy-central-plane.yml` to run automatically on
pushes to `main`:

- [ ] `CLOUDFLARE_API_TOKEN` — Workers Edit + D1 Edit permissions.
      Create at <https://dash.cloudflare.com/profile/api-tokens>.
- [ ] `CLOUDFLARE_ACCOUNT_ID` — same id from §1.1.

Without these, the workflow fails on `wrangler deploy`.

---

## 2. Worker secrets (one-time `wrangler secret put`)

Run these from `apps/central-plane/`. Each prompts for the value and
sets it on the production Worker. **Already-set secrets show in
`wrangler secret list` — re-running will overwrite.**

```bash
cd apps/central-plane

# --- Encryption (required for any flow that persists GH access tokens) ---
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" \
  | wrangler secret put CONCLAVE_TOKEN_KEK

# --- Container callback auth (random per deploy is fine) ----------------
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" \
  | wrangler secret put INTERNAL_CALLBACK_TOKEN

# --- GitHub App ---------------------------------------------------------
echo "$GH_APP_ID"            | wrangler secret put GH_APP_ID
echo "$GH_APP_CLIENT_ID"     | wrangler secret put GH_APP_CLIENT_ID
echo "$GH_APP_CLIENT_SECRET" | wrangler secret put GH_APP_CLIENT_SECRET
echo "$GH_WEBHOOK_SECRET"    | wrangler secret put GH_APP_WEBHOOK_SECRET
cat path/to/conclave-ai-code-council.private-key.pem \
  | wrangler secret put GH_APP_PRIVATE_KEY

# --- LLM keys (forwarded into the container as headers per /run call) ---
echo "$ANTHROPIC_API_KEY" | wrangler secret put ANTHROPIC_API_KEY
echo "$OPENAI_API_KEY"    | wrangler secret put OPENAI_API_KEY
echo "$GEMINI_API_KEY"    | wrangler secret put GEMINI_API_KEY

# --- Telegram bot (optional but recommended for verdict delivery) -------
echo "$TELEGRAM_BOT_TOKEN"      | wrangler secret put TELEGRAM_BOT_TOKEN
echo "$TELEGRAM_WEBHOOK_SECRET" | wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

**Verify**:

```bash
wrangler secret list
```

You should see all 12 names. Values are never readable back (CF
design); this listing only confirms presence.

---

## 3. First deploy (or: re-deploy from a cold state)

The `deploy-central-plane.yml` workflow does this automatically on
every push to `main` that touches `apps/central-plane/**`. To run it
manually:

### Option A — auto on push

```bash
# from a clean main:
git push origin main
```

Watch the run at `gh run watch`. The workflow:

1. Builds central-plane TS → JS (`pnpm turbo run build`).
2. Applies pending D1 migrations (forward-only).
3. Runs `wrangler deploy` — this **also builds the Container image**
   from `apps/central-plane/container/Dockerfile` and pushes it to
   Cloudflare's registry. First-time builds take ~3-5 minutes.
4. Smoke-tests `/healthz`.

### Option B — manual dispatch

```bash
gh workflow run deploy-central-plane.yml
```

Same steps; useful for re-running after a secret change without code
edits.

---

## 4. Post-deploy smoke verification

Beyond the workflow's `/healthz` check, verify the Container path end-
to-end:

### 4.1 Worker reachable

```bash
curl -sS https://conclave-ai.seunghunbae.workers.dev/healthz
# expect: {"ok":true,"…"}
```

### 4.2 Auth flow

```bash
# Start a fresh login from a local CLI checkout:
node packages/cli/dist/bin/conclave.js login
# Browser opens; authorize the app; back in terminal you should see
#   ✓ logged in as <github_login>
node packages/cli/dist/bin/conclave.js whoami
```

### 4.3 SaaS review path (the actual container exercise)

Pick a real PR you control. With your local CLI logged in as a SaaS
user:

```bash
node packages/cli/dist/bin/conclave.js review --use-saas --pr <N>
```

Expected:
- The CLI POSTs to `/saas/review`, receives `202 accepted`.
- Within ~60-120s, the PR gets a "🤖 Conclave AI is reviewing this
  PR" comment.
- Within ~3-4 minutes, the verdict comment posts.

**If the response is `queued_pending_infra`**, container provisioning
isn't healthy yet. Diagnostics:

```bash
# Tail Worker + Container logs:
wrangler tail
# In another terminal, fire the review again. You should see lines like
#   "[saas] spawnSandbox …"
#   "conclave-sandbox listening on :8080"   ← from the container itself
#   "[job <id>] start: <repo>#<N>"
```

If "Sandbox container binding not yet provisioned" — `env.SANDBOX` is
unbound. Re-deploy with `wrangler deploy` to materialize the
`[[containers]]` + `[[durable_objects.bindings]]` blocks.

If "INTERNAL_CALLBACK_TOKEN secret not set" — re-run §2.

If the container starts but the callback never arrives — the GH App
private key is likely malformed. `wrangler secret put GH_APP_PRIVATE_KEY`
again with the .pem piped via stdin (NOT echoed; `\n` survives stdin
but breaks via `echo`).

---

## 5. Roll-back

The Container image is part of `wrangler deploy`'s atomic commit. To
roll back:

```bash
# Find the prior deploy id:
wrangler deployments list

# Roll back to it:
wrangler rollback <deployment-id>
```

This reverts both the Worker code AND the linked container image to
the prior snapshot. `wrangler rollback` does NOT roll back D1
migrations — those are forward-only. If a release ships a breaking
schema change, the rollback strategy is "deploy the prior code on top
of the new schema and ship a forward-fix migration" (i.e. don't roll
back D1 separately).

---

## 6. Cost guardrails

- **Container per-instance**: 2 vCPU + 4GB RAM. CF Containers Paid
  plan: $5/mo base + ~$0.000026 per vCPU-second + ~$0.0000033 per GB-
  second. Each review job runs ~3-4 min wall-clock → ~$0.014/job pure
  container cost.
- **`max_instances = 10`** in `wrangler.toml` — at 10 simultaneous
  PRs, peak container spend is ~$0.14/job × 10 = ~$1.40 for that
  burst.
- **`sleepAfter = "15m"`** — idle containers consume ~$0.03/15m
  ($0.10/hour). One always-on instance ≈ $2.40/day idle. The 15m
  window is a tradeoff: longer warm = faster subsequent reviews on
  the same PR, more idle cost.
- **Per-job LLM cost cap**: `args.budgetUsd: 5` in
  `container/server.mjs`. Hard ceiling per autofix job — if the
  council eats more than $5 the pipeline aborts.

If costs surprise you: `wrangler tail` prints structured logs with
`cost=$X` per job. Aggregate via the D1 `usage_meters` table.

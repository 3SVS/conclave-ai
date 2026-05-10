/**
 * v0.14.4 — Sprint E6: SaaS pipeline route tests.
 *
 * Covers /saas/review, /saas/autofix, /internal/job-done, /saas/jobs/:id,
 * /saas/me. Pins:
 *   - bearer-token auth gate
 *   - body validation
 *   - GH App installation check (app-not-installed → 403)
 *   - credit gate (credits-exhausted → 402, byo/trial/paid happy paths)
 *   - spawnSandbox fallback when env.SANDBOX is unbound (real-world state
 *     before container is provisioned — must NOT fail the request)
 *   - spawnSandbox happy path forwards LLM keys + payload to the DO stub
 *   - /internal/job-done auth + verdict/blocker round-trip
 *   - /saas/jobs/:id ownership check
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createApp } from "../dist/router.js";
import { sha256Hex } from "../dist/util.js";

// One-time RSA key for GH App JWT minting in the SANDBOX-bound test.
// crypto.subtle.importKey rejects fake PEM strings, so we need a real
// RSA-2048 key. Generation is ~80ms; one keypair is reused across all
// tests in this file.
const { privateKey: GH_APP_PRIVATE_PEM } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

// ---- shared fixtures ----------------------------------------------------

const TOKEN = "saas_test_token_12345";
const TOKEN_HASH = await sha256Hex(TOKEN);
const USER = {
  id: "u_1",
  github_user_id: 12345,
  github_login: "alice",
  email: "alice@example.com",
  tier: "trial",
  byo_anthropic: 0,
  data_share_opt_in: 0,
  trial_used: 0,
  paid_credits: 0,
  monthly_review_quota: 5,
  monthly_reviews_used: 0,
};
const INSTALLATION = {
  installation_id: 999,
  account_login: "alice",
  account_id: 12345,
  target_type: "User",
  repository_selection: "all",
  selected_repo_ids_json: null,
  saas_user_id: "u_1",
  suspended_at: null,
  removed_at: null,
};

function makeMockDb({
  users = [USER],
  tokens = [{ id: "tok_1", user_id: "u_1", token_hash: TOKEN_HASH, revoked_at: null }],
  installations = [INSTALLATION],
  jobs = [],
  meters = [],
} = {}) {
  const state = {
    users: users.map((u) => ({ ...u })),
    tokens: tokens.map((t) => ({ ...t })),
    installations: installations.map((i) => ({ ...i })),
    jobs: jobs.map((j) => ({ ...j })),
    meters: meters.map((m) => ({ ...m })),
  };
  return {
    state,
    prepare(sql) {
      let bound = [];
      const handlers = {
        async first() {
          // findUserByToken: token JOIN user
          if (/FROM saas_tokens t/.test(sql) && /JOIN saas_users/.test(sql)) {
            const hash = bound[0];
            const tok = state.tokens.find((t) => t.token_hash === hash && !t.revoked_at);
            if (!tok) return null;
            const u = state.users.find((u) => u.id === tok.user_id);
            if (!u) return null;
            return {
              token_id: tok.id, revoked_at: tok.revoked_at,
              id: u.id, github_user_id: u.github_user_id, github_login: u.github_login,
              email: u.email, tier: u.tier, byo_anthropic: u.byo_anthropic,
              data_share_opt_in: u.data_share_opt_in, trial_used: u.trial_used,
              paid_credits: u.paid_credits,
              monthly_review_quota: u.monthly_review_quota ?? 0,
              monthly_reviews_used: u.monthly_reviews_used ?? 0,
              created_at: "2026-04-01T00:00:00Z",
              last_active_at: "2026-05-01T00:00:00Z",
            };
          }
          // consumeReviewCredit: SELECT user state
          if (/FROM saas_users WHERE id = \?/.test(sql) && /tier/.test(sql)) {
            const u = state.users.find((u) => u.id === bound[0]);
            return u ? { ...u } : null;
          }
          // findInstallationByRepoSlug — best-effort match where repo slug is alice/<repo>
          if (/FROM gh_app_installations/.test(sql) && /account_login/.test(sql)) {
            const slug = bound[0] ?? "";
            const owner = String(slug).split("/")[0];
            return state.installations.find((i) => i.account_login === owner && !i.removed_at) ?? null;
          }
          // findJob
          if (/FROM jobs WHERE id = \?/.test(sql)) {
            return state.jobs.find((j) => j.id === bound[0]) ?? null;
          }
          return null;
        },
        async run() {
          // updates that we actually mutate
          if (/UPDATE saas_users SET trial_used = 1/.test(sql)) {
            const u = state.users.find((u) => u.id === bound[1]);
            if (u) u.trial_used = 1;
            return { success: true, meta: { changes: 1 } };
          }
          if (/UPDATE saas_users SET paid_credits = paid_credits - 1/.test(sql)) {
            const u = state.users.find((u) => u.id === bound[1]);
            if (u && (u.paid_credits ?? 0) > 0) u.paid_credits -= 1;
            return { success: true, meta: { changes: 1 } };
          }
          if (/UPDATE saas_users SET monthly_reviews_used/.test(sql)) {
            const u = state.users.find((u) => u.id === bound[1]);
            if (u) u.monthly_reviews_used = (u.monthly_reviews_used ?? 0) + 1;
            return { success: true, meta: { changes: 1 } };
          }
          if (/UPDATE saas_tokens SET last_used_at/.test(sql)) {
            return { success: true, meta: { changes: 1 } };
          }
          if (/INSERT INTO usage_meters/.test(sql)) {
            state.meters.push({ id: bound[0], user_id: bound[1], meter_name: bound[2] });
            return { success: true, meta: { changes: 1 } };
          }
          if (/INSERT INTO jobs/.test(sql)) {
            state.jobs.push({
              id: bound[0], user_id: bound[1], repo_slug: bound[2],
              pr_number: bound[3], kind: bound[4], status: "accepted",
              prd_present: bound[5] ?? 0,
              verdict: null, blockers: null, cycles: null, duration_ms: null,
              smoke_outcome: null, deploy_url: null, error_message: null,
              created_at: bound[6] ?? "2026-05-11T00:00:00Z", completed_at: null,
              head_sha: null,
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (/UPDATE jobs/.test(sql) && /status/.test(sql)) {
            // completeJob — last bound is jobId
            const id = bound[bound.length - 1];
            const j = state.jobs.find((j) => j.id === id);
            if (j) {
              // crude: set status to done; tests inspect specific fields via state.jobs
              j.status = "done";
              if (sql.includes("verdict")) j.verdict = "approve";
            }
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
        async all() {
          return { results: [] };
        },
      };
      return {
        bind: (...args) => { bound = args; return handlers; },
        first: handlers.first,
        all: handlers.all,
        run: handlers.run,
      };
    },
  };
}

function makeSandboxBinding({ acceptResponse = { ok: true, status: 202, body: { ok: true } } } = {}) {
  const calls = [];
  const stub = {
    fetch: async (url, init) => {
      calls.push({ url: typeof url === "string" ? url : url.url, init });
      return new Response(JSON.stringify(acceptResponse.body), {
        status: acceptResponse.status,
        headers: { "content-type": "application/json" },
      });
    },
  };
  return {
    calls,
    binding: {
      idFromName: (name) => ({ name }),
      get: (_id) => stub,
    },
  };
}

function makeEnv(overrides = {}) {
  return {
    DB: makeMockDb(),
    ENVIRONMENT: "test",
    INTERNAL_CALLBACK_TOKEN: "internal-tok",
    PUBLIC_BASE_URL: "https://test.example",
    ...overrides,
  };
}

async function callJson(app, env, method, path, body, headers = {}) {
  const init = {
    method,
    headers: { "content-type": "application/json", ...headers },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return app.fetch(new Request(`http://localhost${path}`, init), env);
}

// ---- /saas/review --------------------------------------------------------

test("/saas/review: missing Authorization → 401", async () => {
  const app = createApp();
  const r = await callJson(app, makeEnv(), "POST", "/saas/review", { repo: "alice/x", pr_number: 1 });
  assert.equal(r.status, 401);
});

test("/saas/review: invalid bearer → 401", async () => {
  const app = createApp();
  const r = await callJson(
    app, makeEnv(), "POST", "/saas/review",
    { repo: "alice/x", pr_number: 1 },
    { authorization: "Bearer wrong" },
  );
  assert.equal(r.status, 401);
});

test("/saas/review: missing repo or pr_number → 400", async () => {
  const app = createApp();
  const env = makeEnv();
  const r = await callJson(
    app, env, "POST", "/saas/review",
    { repo: "alice/x" }, // pr_number missing
    { authorization: `Bearer ${TOKEN}` },
  );
  assert.equal(r.status, 400);
});

test("/saas/review: GH App not installed on owner → 403 with install_url", async () => {
  const app = createApp();
  const env = makeEnv({
    DB: makeMockDb({ installations: [] }), // no installation
  });
  const r = await callJson(
    app, env, "POST", "/saas/review",
    { repo: "alice/x", pr_number: 1 },
    { authorization: `Bearer ${TOKEN}` },
  );
  assert.equal(r.status, 403);
  const body = await r.json();
  assert.equal(body.error, "app_not_installed");
  assert.ok(body.install_url, "install_url hint must be present");
});

test("/saas/review: suspended installation → 403 app_suspended", async () => {
  const app = createApp();
  const env = makeEnv({
    DB: makeMockDb({
      installations: [{ ...INSTALLATION, suspended_at: "2026-05-01T00:00:00Z" }],
    }),
  });
  const r = await callJson(
    app, env, "POST", "/saas/review",
    { repo: "alice/x", pr_number: 1 },
    { authorization: `Bearer ${TOKEN}` },
  );
  assert.equal(r.status, 403);
  const body = await r.json();
  assert.equal(body.error, "app_suspended");
});

test("/saas/review: credits exhausted (no trial, no paid) → 402", async () => {
  const app = createApp();
  const env = makeEnv({
    DB: makeMockDb({
      users: [{ ...USER, tier: "free", trial_used: 1, paid_credits: 0, byo_anthropic: 0 }],
    }),
  });
  const r = await callJson(
    app, env, "POST", "/saas/review",
    { repo: "alice/x", pr_number: 1 },
    { authorization: `Bearer ${TOKEN}` },
  );
  assert.equal(r.status, 402);
  const body = await r.json();
  assert.equal(body.error, "credits_exhausted");
  assert.ok(body.buy_credits_url, "buy_credits_url hint must be present");
});

test("/saas/review: SANDBOX unbound → 202 queued_pending_infra (graceful fallback)", async () => {
  // Real-world pre-deploy state: container infrastructure scaffold is in
  // place but `env.SANDBOX` hasn't been provisioned. The route MUST still
  // accept (job_id created) so retries work after infra lands.
  const app = createApp();
  const env = makeEnv(); // no SANDBOX
  const r = await callJson(
    app, env, "POST", "/saas/review",
    { repo: "alice/x", pr_number: 1 },
    { authorization: `Bearer ${TOKEN}` },
  );
  assert.equal(r.status, 202);
  const body = await r.json();
  assert.match(body.job_id, /^job_/);
  assert.equal(body.status, "queued_pending_infra");
  assert.match(body.note, /Sandbox container binding not yet provisioned/);
  // Job row + meter row must have been recorded so post-infra replay works.
  assert.equal(env.DB.state.jobs.length, 1);
  assert.equal(env.DB.state.meters.length, 1);
});

test("/saas/review: SANDBOX bound + happy path → 202 accepted, container called with payload", async () => {
  const app = createApp();
  const sb = makeSandboxBinding();
  const env = makeEnv({
    SANDBOX: sb.binding,
    GH_APP_ID: "1",
    GH_APP_PRIVATE_KEY: GH_APP_PRIVATE_PEM,
    ANTHROPIC_API_KEY: "ak-test",
  });
  // getInstallationToken hits api.github.com — stub fetch.
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (typeof url === "string" && url.includes("api.github.com")) {
      return new Response(JSON.stringify({ token: "ghs_inst_token", expires_at: "2026-12-31T00:00:00Z" }), {
        status: 201, headers: { "content-type": "application/json" },
      });
    }
    return origFetch(url, init);
  };
  try {
    const r = await callJson(
      app, env, "POST", "/saas/review",
      { repo: "alice/x", pr_number: 42 },
      { authorization: `Bearer ${TOKEN}` },
    );
    assert.equal(r.status, 202);
    const body = await r.json();
    assert.equal(body.status, "accepted");
    // The DO stub must have been called with the payload.
    assert.equal(sb.calls.length, 1);
    const call = sb.calls[0];
    assert.equal(call.url, "http://sandbox/run");
    const payload = JSON.parse(call.init.body);
    assert.equal(payload.repo, "alice/x");
    assert.equal(payload.prNumber, 42);
    assert.equal(payload.installationToken, "ghs_inst_token");
    assert.equal(payload.autofix, false);
    // LLM keys forwarded as headers (not body — saves payload size).
    assert.equal(call.init.headers["x-anthropic-key"], "ak-test");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("/saas/review: SANDBOX bound but DO returns 5xx → 202 with reason in note", async () => {
  const app = createApp();
  const sb = makeSandboxBinding({
    acceptResponse: { ok: false, status: 503, body: { error: "container_unavailable" } },
  });
  const env = makeEnv({
    SANDBOX: sb.binding,
    GH_APP_ID: "1",
    GH_APP_PRIVATE_KEY: GH_APP_PRIVATE_PEM,
  });
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (typeof url === "string" && url.includes("api.github.com")) {
      return new Response(JSON.stringify({ token: "ghs_inst_token", expires_at: "2026-12-31T00:00:00Z" }), {
        status: 201, headers: { "content-type": "application/json" },
      });
    }
    return origFetch(url, init);
  };
  try {
    const r = await callJson(
      app, env, "POST", "/saas/review",
      { repo: "alice/x", pr_number: 1 },
      { authorization: `Bearer ${TOKEN}` },
    );
    assert.equal(r.status, 202);
    const body = await r.json();
    assert.equal(body.status, "queued_pending_infra");
    assert.match(body.note, /container returned 503/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ---- /saas/autofix -------------------------------------------------------

test("/saas/autofix: missing fields → 400", async () => {
  const app = createApp();
  const env = makeEnv();
  const r = await callJson(
    app, env, "POST", "/saas/autofix",
    { repo: "alice/x" }, // pr_number missing
    { authorization: `Bearer ${TOKEN}` },
  );
  assert.equal(r.status, 400);
});

test("/saas/autofix: SANDBOX unbound → 202 queued_pending_infra + autofix=true recorded", async () => {
  const app = createApp();
  const env = makeEnv();
  const r = await callJson(
    app, env, "POST", "/saas/autofix",
    { repo: "alice/x", pr_number: 1 },
    { authorization: `Bearer ${TOKEN}` },
  );
  assert.equal(r.status, 202);
  const body = await r.json();
  assert.equal(body.status, "queued_pending_infra");
  // Meter name distinguishes autofix from review for billing.
  assert.equal(env.DB.state.meters[0].meter_name, "autofix.requested");
});

// ---- /internal/job-done --------------------------------------------------

test("/internal/job-done: missing INTERNAL_CALLBACK_TOKEN → 503", async () => {
  const app = createApp();
  const env = { ...makeEnv(), INTERNAL_CALLBACK_TOKEN: undefined };
  const r = await callJson(app, env, "POST", "/internal/job-done", {});
  assert.equal(r.status, 503);
});

test("/internal/job-done: wrong bearer → 401", async () => {
  const app = createApp();
  const env = makeEnv();
  const r = await callJson(
    app, env, "POST", "/internal/job-done",
    { jobId: "j1", repo: "alice/x", prNumber: 1, verdict: "approve" },
    { authorization: "Bearer wrong" },
  );
  assert.equal(r.status, 401);
});

test("/internal/job-done: invalid body (missing required fields) → 400", async () => {
  const app = createApp();
  const env = makeEnv();
  const r = await callJson(
    app, env, "POST", "/internal/job-done",
    { repo: "alice/x" }, // missing jobId + prNumber
    { authorization: "Bearer internal-tok" },
  );
  assert.equal(r.status, 400);
});

test("/internal/job-done: happy path completes job + records meter", async () => {
  const app = createApp();
  const env = makeEnv({
    DB: makeMockDb({
      jobs: [{
        id: "job_1", user_id: "u_1", repo_slug: "alice/x", pr_number: 1,
        kind: "review", status: "accepted", prd_present: 0,
        verdict: null, blockers: null, cycles: null, duration_ms: null,
        smoke_outcome: null, deploy_url: null, error_message: null,
        created_at: "2026-05-11T00:00:00Z", completed_at: null, head_sha: null,
      }],
    }),
  });
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 201 });
  try {
    const r = await callJson(
      app, env, "POST", "/internal/job-done",
      {
        jobId: "job_1",
        repo: "alice/x",
        prNumber: 1,
        verdict: "approve",
        blockers: 0,
        durationMs: 45_000,
      },
      { authorization: "Bearer internal-tok" },
    );
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    // Job row updated; completion meter recorded.
    const job = env.DB.state.jobs.find((j) => j.id === "job_1");
    assert.equal(job.status, "done");
    assert.ok(env.DB.state.meters.find((m) => m.meter_name === "job.completed"));
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ---- /saas/jobs/:id ------------------------------------------------------

test("/saas/jobs/:id: ownership enforced — other user's job → 403", async () => {
  const app = createApp();
  const env = makeEnv({
    DB: makeMockDb({
      jobs: [{
        id: "job_other", user_id: "u_2", repo_slug: "bob/y", pr_number: 7,
        kind: "review", status: "done", prd_present: 0,
        verdict: "approve", blockers: 0, cycles: null, duration_ms: 30_000,
        smoke_outcome: null, deploy_url: null, error_message: null,
        created_at: "2026-05-11T00:00:00Z", completed_at: "2026-05-11T00:30:00Z",
        head_sha: null,
      }],
    }),
  });
  const r = await app.fetch(
    new Request("http://localhost/saas/jobs/job_other", {
      headers: { authorization: `Bearer ${TOKEN}` },
    }),
    env,
  );
  assert.equal(r.status, 403);
});

test("/saas/jobs/:id: unknown id → 404", async () => {
  const app = createApp();
  const env = makeEnv();
  const r = await app.fetch(
    new Request("http://localhost/saas/jobs/job_unknown", {
      headers: { authorization: `Bearer ${TOKEN}` },
    }),
    env,
  );
  assert.equal(r.status, 404);
});

// ---- /saas/me ------------------------------------------------------------

test("/saas/me: returns the authenticated user's profile", async () => {
  const app = createApp();
  const env = makeEnv();
  const r = await app.fetch(
    new Request("http://localhost/saas/me", {
      headers: { authorization: `Bearer ${TOKEN}` },
    }),
    env,
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.id, "u_1");
  assert.equal(body.github_login, "alice");
  // findUserByToken normalizes any tier other than "solo"|"pro" to "free".
  // Trial state is reflected by trial_used / paid_credits — not the tier
  // string. /saas/me intentionally surfaces the normalized form.
  assert.equal(body.tier, "free");
});

test("/saas/me: missing bearer → 401", async () => {
  const app = createApp();
  const r = await app.fetch(new Request("http://localhost/saas/me"), makeEnv());
  assert.equal(r.status, 401);
});

/**
 * Sprint A — feedback intake route tests.
 *
 * Covers the auth gate, input validation, sync→async fallback path,
 * /me/feedback list, and /admin/classify-feedback retry. The Haiku
 * classifier is stubbed via global fetch override so tests don't make
 * real Anthropic calls.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../dist/router.js";
import { retryPendingFeedback } from "../dist/routes/feedback.js";

// ---- mock D1 with feedback + saas_tokens support ------------------------

function makeMockDb({ token = null, feedbackRows = [] } = {}) {
  const state = {
    feedback: new Map(feedbackRows.map((r) => [r.id, r])),
    revokedTokens: new Set(),
  };
  const calls = [];
  return {
    state,
    calls,
    prepare(sql) {
      calls.push({ sql });
      let bound = [];
      return {
        bind: (...args) => {
          bound = args;
          calls[calls.length - 1].bound = args;
          return {
            async first() {
              if (/FROM saas_tokens t JOIN saas_users u/.test(sql)) {
                if (!token) return null;
                if (state.revokedTokens.has(token.tokenHash)) return null;
                if (bound[0] !== token.tokenHash) return null;
                return {
                  token_id: token.tokenId,
                  revoked_at: null,
                  id: token.userId,
                  github_user_id: token.githubUserId ?? 1,
                  github_login: token.githubLogin ?? "test-user",
                  email: token.email ?? null,
                  tier: "free",
                  byo_anthropic: 0,
                  data_share_opt_in: 1,
                  trial_used: 0,
                  paid_credits: 0,
                  created_at: "2026-01-01T00:00:00.000Z",
                  last_active_at: "2026-01-01T00:00:00.000Z",
                };
              }
              return null;
            },
            async run() {
              if (/UPDATE saas_tokens SET last_used_at/.test(sql)) {
                return { success: true };
              }
              if (/INSERT INTO user_feedback/.test(sql)) {
                const [
                  id,
                  user_id,
                  job_id,
                  run_id,
                  domain,
                  severity,
                  what_user_wanted,
                  what_we_produced,
                  category,
                  confidence,
                  reasoning,
                  status,
                  retry_count,
                  last_error,
                  created_at,
                  classified_at,
                ] = bound;
                state.feedback.set(id, {
                  id,
                  user_id,
                  job_id,
                  run_id,
                  domain,
                  severity,
                  what_user_wanted,
                  what_we_produced,
                  category,
                  confidence,
                  reasoning,
                  status,
                  retry_count,
                  last_error,
                  created_at,
                  classified_at,
                  removed_at: null,
                });
                return { success: true };
              }
              if (/UPDATE user_feedback/.test(sql)) {
                // Two flavors:
                //   - SET category = ?, confidence = ?, reasoning = ?, status = 'classified', classified_at = ?, last_error = NULL, retry_count = retry_count + 1 WHERE id = ?
                //   - SET retry_count = ?, last_error = ?, status = ? WHERE id = ?
                if (/status\s*=\s*'classified'/.test(sql)) {
                  const [category, confidence, reasoning, classified_at, id] = bound;
                  const row = state.feedback.get(id);
                  if (row) {
                    row.category = category;
                    row.confidence = confidence;
                    row.reasoning = reasoning;
                    row.status = "classified";
                    row.classified_at = classified_at;
                    row.last_error = null;
                    row.retry_count = (row.retry_count ?? 0) + 1;
                  }
                } else {
                  const [retry_count, last_error, status, id] = bound;
                  const row = state.feedback.get(id);
                  if (row) {
                    row.retry_count = retry_count;
                    row.last_error = last_error;
                    row.status = status;
                  }
                }
                return { success: true };
              }
              return { success: true };
            },
            async all() {
              if (/FROM user_feedback\s+WHERE user_id = \?/.test(sql)) {
                const userId = bound[0];
                const rows = [...state.feedback.values()]
                  .filter((r) => r.user_id === userId && r.removed_at === null)
                  .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
                return { results: rows };
              }
              if (/FROM user_feedback\s+WHERE status = 'pending'/.test(sql)) {
                const limit = bound[0] ?? 50;
                const rows = [...state.feedback.values()]
                  .filter((r) => r.status === "pending" && r.removed_at === null)
                  .sort((a, b) => (a.created_at > b.created_at ? 1 : -1))
                  .slice(0, limit);
                return { results: rows };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

function makeEnv(overrides = {}) {
  return {
    DB: makeMockDb(),
    ENVIRONMENT: "test",
    ANTHROPIC_API_KEY: "test-key",
    INTERNAL_CALLBACK_TOKEN: "admin-test-token",
    ...overrides,
  };
}

async function fetchApp(app, path, init = {}, env = makeEnv()) {
  const url = `http://localhost${path}`;
  const req = new Request(url, init);
  return app.fetch(req, env);
}

// Compute SHA-256 hex of a raw token (matches sha256Hex in src/util.ts).
async function sha256Hex(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Override globalThis.fetch for classifier tests.
function withFetchStub(stubResponse, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => stubResponse;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function haikuResponse(category, confidence = 0.9, reasoning = "test") {
  return jsonResponse({
    content: [{ type: "text", text: JSON.stringify({ category, confidence, reasoning }) }],
  });
}

// ---- /feedback auth tests ------------------------------------------------

test("POST /feedback: 401 when missing Authorization header", async () => {
  const app = createApp();
  const res = await fetchApp(app, "/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 401);
});

test("POST /feedback: 401 when token doesn't match any user", async () => {
  const app = createApp();
  const env = makeEnv(); // no token in mock
  const res = await fetchApp(
    app,
    "/feedback",
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer nope" },
      body: JSON.stringify({ domain: "design", severity: "minor", what_user_wanted: "x", what_we_produced: "y" }),
    },
    env,
  );
  assert.equal(res.status, 401);
});

// ---- /feedback validation tests ------------------------------------------

test("POST /feedback: 400 when domain is missing", async () => {
  const rawToken = "test-token-1";
  const tokenHash = await sha256Hex(rawToken);
  const env = makeEnv({
    DB: makeMockDb({ token: { tokenHash, tokenId: "tok_1", userId: "usr_1" } }),
  });
  const app = createApp();
  const res = await fetchApp(
    app,
    "/feedback",
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${rawToken}` },
      body: JSON.stringify({ severity: "minor", what_user_wanted: "x", what_we_produced: "y" }),
    },
    env,
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "invalid_domain");
});

test("POST /feedback: 400 when severity is invalid", async () => {
  const rawToken = "test-token-1";
  const tokenHash = await sha256Hex(rawToken);
  const env = makeEnv({
    DB: makeMockDb({ token: { tokenHash, tokenId: "tok_1", userId: "usr_1" } }),
  });
  const app = createApp();
  const res = await fetchApp(
    app,
    "/feedback",
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${rawToken}` },
      body: JSON.stringify({ domain: "design", severity: "kinda-bad", what_user_wanted: "x", what_we_produced: "y" }),
    },
    env,
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "invalid_severity");
});

test("POST /feedback: 400 when what_user_wanted is empty", async () => {
  const rawToken = "test-token-1";
  const tokenHash = await sha256Hex(rawToken);
  const env = makeEnv({
    DB: makeMockDb({ token: { tokenHash, tokenId: "tok_1", userId: "usr_1" } }),
  });
  const app = createApp();
  const res = await fetchApp(
    app,
    "/feedback",
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${rawToken}` },
      body: JSON.stringify({ domain: "design", severity: "minor", what_user_wanted: "  ", what_we_produced: "y" }),
    },
    env,
  );
  assert.equal(res.status, 400);
});

// ---- /feedback happy path: sync classify --------------------------------

test("POST /feedback: 200 + status=classified on Haiku success", async () => {
  const rawToken = "test-token-1";
  const tokenHash = await sha256Hex(rawToken);
  const env = makeEnv({
    DB: makeMockDb({ token: { tokenHash, tokenId: "tok_1", userId: "usr_1" } }),
  });
  const app = createApp();
  const res = await withFetchStub(haikuResponse("accessibility", 0.92, "missing alt text"), () =>
    fetchApp(
      app,
      "/feedback",
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${rawToken}` },
        body: JSON.stringify({
          domain: "design",
          severity: "major",
          what_user_wanted: "alt text on every image",
          what_we_produced: "no alt attributes",
        }),
      },
      env,
    ),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "classified");
  assert.equal(body.category, "accessibility");
  assert.ok(body.id.startsWith("fb_"));
  // Persisted
  assert.equal(env.DB.state.feedback.size, 1);
  const row = [...env.DB.state.feedback.values()][0];
  assert.equal(row.status, "classified");
  assert.equal(row.category, "accessibility");
  assert.equal(row.user_id, "usr_1");
});

// ---- /feedback fallback: sync fail → 202 pending ------------------------

test("POST /feedback: 202 + status=pending when Haiku throws", async () => {
  const rawToken = "test-token-1";
  const tokenHash = await sha256Hex(rawToken);
  const env = makeEnv({
    DB: makeMockDb({ token: { tokenHash, tokenId: "tok_1", userId: "usr_1" } }),
  });
  const app = createApp();
  const res = await withFetchStub(jsonResponse({ error: { type: "overloaded" } }, 529), () =>
    fetchApp(
      app,
      "/feedback",
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${rawToken}` },
        body: JSON.stringify({
          domain: "code",
          severity: "blocker",
          what_user_wanted: "no SQL injection",
          what_we_produced: "concatenated query",
        }),
      },
      env,
    ),
  );
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.status, "pending");
  assert.equal(body.category, null);
  // Persisted as pending with retry_count=1
  const row = [...env.DB.state.feedback.values()][0];
  assert.equal(row.status, "pending");
  assert.equal(row.retry_count, 1);
  assert.ok(row.last_error);
});

// ---- /me/feedback --------------------------------------------------------

test("GET /me/feedback: returns user's own rows only", async () => {
  const rawToken = "test-token-1";
  const tokenHash = await sha256Hex(rawToken);
  const env = makeEnv({
    DB: makeMockDb({
      token: { tokenHash, tokenId: "tok_1", userId: "usr_1" },
      feedbackRows: [
        { id: "fb_a", user_id: "usr_1", domain: "design", severity: "minor", category: "typography", confidence: 0.7, reasoning: "", status: "classified", created_at: "2026-05-01T00:00:00.000Z", classified_at: "2026-05-01T00:00:01.000Z", removed_at: null },
        { id: "fb_b", user_id: "usr_2", domain: "design", severity: "minor", category: "typography", confidence: 0.7, reasoning: "", status: "classified", created_at: "2026-05-02T00:00:00.000Z", classified_at: "2026-05-02T00:00:01.000Z", removed_at: null },
      ],
    }),
  });
  const app = createApp();
  const res = await fetchApp(
    app,
    "/me/feedback",
    { headers: { authorization: `Bearer ${rawToken}` } },
    env,
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.feedback.length, 1);
  assert.equal(body.feedback[0].id, "fb_a");
});

// ---- /admin/classify-feedback --------------------------------------------

test("POST /admin/classify-feedback: 401 with wrong admin token", async () => {
  const env = makeEnv();
  const app = createApp();
  const res = await fetchApp(
    app,
    "/admin/classify-feedback",
    { method: "POST", headers: { authorization: "Bearer wrong" } },
    env,
  );
  assert.equal(res.status, 401);
});

test("POST /admin/classify-feedback: classifies pending rows on Haiku success", async () => {
  const env = makeEnv({
    DB: makeMockDb({
      feedbackRows: [
        {
          id: "fb_pending_1",
          user_id: "usr_1",
          job_id: null,
          run_id: null,
          domain: "design",
          severity: "minor",
          what_user_wanted: "x",
          what_we_produced: "y",
          category: null,
          confidence: null,
          reasoning: null,
          status: "pending",
          retry_count: 1,
          last_error: "first attempt failed",
          created_at: "2026-05-01T00:00:00.000Z",
          classified_at: null,
          removed_at: null,
        },
      ],
    }),
  });
  const app = createApp();
  const res = await withFetchStub(haikuResponse("typography", 0.8, "font issue"), () =>
    fetchApp(
      app,
      "/admin/classify-feedback",
      {
        method: "POST",
        headers: { authorization: "Bearer admin-test-token" },
      },
      env,
    ),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.scanned, 1);
  assert.equal(body.classified, 1);
  assert.equal(body.failed_terminal, 0);
  // Row updated
  const row = env.DB.state.feedback.get("fb_pending_1");
  assert.equal(row.status, "classified");
  assert.equal(row.category, "typography");
  assert.equal(row.last_error, null);
});

test("retryPendingFeedback: flips to status='failed' after MAX_RETRIES", async () => {
  const env = makeEnv({
    DB: makeMockDb({
      feedbackRows: [
        {
          id: "fb_doomed",
          user_id: "usr_1",
          job_id: null,
          run_id: null,
          domain: "design",
          severity: "minor",
          what_user_wanted: "x",
          what_we_produced: "y",
          category: null,
          confidence: null,
          reasoning: null,
          status: "pending",
          retry_count: 2, // already 2 → next failure is terminal (MAX=3)
          last_error: "previous failures",
          created_at: "2026-05-01T00:00:00.000Z",
          classified_at: null,
          removed_at: null,
        },
      ],
    }),
  });
  await withFetchStub(jsonResponse({ error: "boom" }, 500), () => retryPendingFeedback(env, 50));
  const row = env.DB.state.feedback.get("fb_doomed");
  assert.equal(row.status, "failed");
  assert.equal(row.retry_count, 3);
});

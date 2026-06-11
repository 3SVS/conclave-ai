/**
 * Sprint C — seed-promoter tests.
 *
 * Mocks D1 with the columns the promoter touches + stubs global fetch
 * for the Haiku call. Covers the threshold gate, idempotency marker,
 * and the route surface (GET /seeds/promoted/:domain + POST /admin/
 * promote-seeds auth).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../dist/router.js";
import { promoteSeedsPass, listPromotedSeeds } from "../dist/seed-promoter.js";

// ---- mock D1 ------------------------------------------------------------

function makeMockDb({ feedback = [], seeds = [] } = {}) {
  const state = {
    feedback: new Map(feedback.map((f) => [f.id, { ...f }])),
    seeds: new Map(seeds.map((s) => [s.id, { ...s }])),
  };
  return {
    state,
    prepare(sql) {
      let bound = [];
      return {
        bind: (...args) => {
          bound = args;
          return {
            async first() {
              return null;
            },
            async run() {
              if (/INSERT INTO promoted_seeds/.test(sql)) {
                const [
                  id, domain, category, kind, severity, title, body, tags, prompt_text,
                  source_feedback_ids, source_count, promoted_at,
                ] = bound;
                state.seeds.set(id, {
                  id, domain, category, kind, severity, title, body, tags, prompt_text,
                  source_feedback_ids, source_count, promoted_at, removed_at: null,
                });
                return { success: true };
              }
              if (/UPDATE user_feedback SET promoted_at/.test(sql)) {
                const [promoted_at, id] = bound;
                const row = state.feedback.get(id);
                if (row) row.promoted_at = promoted_at;
                return { success: true };
              }
              return { success: true };
            },
            async all() {
              if (/SELECT domain, category, COUNT/.test(sql)) {
                const [cutoff, threshold] = bound;
                const groups = new Map();
                for (const row of state.feedback.values()) {
                  if (row.removed_at !== null) continue;
                  if (row.status !== "classified") continue;
                  if (row.promoted_at !== null) continue;
                  if (row.created_at < cutoff) continue;
                  if (!row.category) continue;
                  const key = `${row.domain}|${row.category}`;
                  groups.set(key, (groups.get(key) ?? 0) + 1);
                }
                const results = [];
                for (const [key, n] of groups) {
                  if (n < threshold) continue;
                  const [domain, category] = key.split("|");
                  results.push({ domain, category, n });
                }
                results.sort((a, b) => b.n - a.n);
                return { results };
              }
              if (/FROM user_feedback\s+WHERE/.test(sql) && /AND domain = \? AND category = \?/.test(sql)) {
                const [domain, category, cutoff, limit] = bound;
                const rows = [...state.feedback.values()]
                  .filter((r) =>
                    r.removed_at === null &&
                    r.status === "classified" &&
                    r.promoted_at === null &&
                    r.domain === domain &&
                    r.category === category &&
                    r.created_at >= cutoff,
                  )
                  .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
                  .slice(0, limit);
                return { results: rows };
              }
              if (/FROM promoted_seeds\s+WHERE domain = \?/.test(sql)) {
                const [domain] = bound;
                const rows = [...state.seeds.values()]
                  .filter((s) => s.domain === domain && s.removed_at === null)
                  .sort((a, b) => (a.promoted_at < b.promoted_at ? 1 : -1));
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
    INTERNAL_CALLBACK_TOKEN: "admin-test",
    ...overrides,
  };
}

function withFetchStub(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original;
  });
}

function haikuOk({ kind = "failure", title = "T", body = "B", tags = ["x"], severity = "minor" }) {
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text: JSON.stringify({ kind, title, body, tags, severity }) }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function makeFeedback(overrides) {
  return {
    id: "fb_x",
    user_id: "usr_1",
    job_id: null,
    run_id: null,
    domain: "design",
    severity: "minor",
    what_user_wanted: "want",
    what_we_produced: "produced",
    category: "accessibility",
    confidence: 0.9,
    reasoning: null,
    status: "classified",
    retry_count: 0,
    last_error: null,
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    classified_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 1000).toISOString(),
    promoted_at: null,
    removed_at: null,
    ...overrides,
  };
}

// --- threshold tests ------------------------------------------------------

test("promoter: 2 rows in same category → no promotion (below threshold of 3)", async () => {
  const env = makeEnv({
    DB: makeMockDb({
      feedback: [
        makeFeedback({ id: "fb_1" }),
        makeFeedback({ id: "fb_2" }),
      ],
    }),
  });
  const result = await withFetchStub(
    () => {
      throw new Error("haiku must NOT be called below threshold");
    },
    () => promoteSeedsPass(env),
  );
  assert.equal(result.scanned_groups, 0);
  assert.equal(result.promoted, 0);
  assert.equal(env.DB.state.seeds.size, 0);
});

test("promoter: 3 rows → promote → mark source rows promoted_at", async () => {
  const env = makeEnv({
    DB: makeMockDb({
      feedback: [
        makeFeedback({ id: "fb_1", category: "accessibility" }),
        makeFeedback({ id: "fb_2", category: "accessibility" }),
        makeFeedback({ id: "fb_3", category: "accessibility" }),
      ],
    }),
  });
  const result = await withFetchStub(
    () => haikuOk({ title: "Missing alt text on images", body: "Add alt to img.", tags: ["alt", "a11y"], severity: "major" }),
    () => promoteSeedsPass(env),
  );
  assert.equal(result.scanned_groups, 1);
  assert.equal(result.promoted, 1);
  assert.equal(env.DB.state.seeds.size, 1);
  const seed = [...env.DB.state.seeds.values()][0];
  assert.equal(seed.category, "accessibility");
  assert.equal(seed.kind, "failure");
  assert.equal(seed.source_count, 3);
  // Source rows marked
  for (const id of ["fb_1", "fb_2", "fb_3"]) {
    assert.ok(env.DB.state.feedback.get(id).promoted_at, `${id} should have promoted_at set`);
  }
});

test("promoter: rows already marked promoted_at → skipped", async () => {
  const env = makeEnv({
    DB: makeMockDb({
      feedback: [
        makeFeedback({ id: "fb_1", promoted_at: "2026-05-09T05:00:00.000Z" }),
        makeFeedback({ id: "fb_2", promoted_at: "2026-05-09T05:00:00.000Z" }),
        makeFeedback({ id: "fb_3", promoted_at: "2026-05-09T05:00:00.000Z" }),
      ],
    }),
  });
  const result = await withFetchStub(
    () => {
      throw new Error("haiku must NOT be called when all rows are pre-promoted");
    },
    () => promoteSeedsPass(env),
  );
  assert.equal(result.scanned_groups, 0);
  assert.equal(result.promoted, 0);
});

test("promoter: Haiku failure → category not promoted, remains in failures[]", async () => {
  const env = makeEnv({
    DB: makeMockDb({
      feedback: [
        makeFeedback({ id: "fb_1" }),
        makeFeedback({ id: "fb_2" }),
        makeFeedback({ id: "fb_3" }),
      ],
    }),
  });
  const result = await withFetchStub(
    () =>
      new Response(JSON.stringify({ error: { type: "overloaded" } }), {
        status: 529,
        headers: { "content-type": "application/json" },
      }),
    () => promoteSeedsPass(env),
  );
  assert.equal(result.failed, 1);
  assert.equal(result.promoted, 0);
  // Source rows NOT marked promoted_at — next run will retry
  for (const id of ["fb_1", "fb_2", "fb_3"]) {
    assert.equal(env.DB.state.feedback.get(id).promoted_at, null);
  }
});

test("promoter: pending or non-classified rows ignored (won't count to threshold)", async () => {
  const env = makeEnv({
    DB: makeMockDb({
      feedback: [
        makeFeedback({ id: "fb_1", status: "classified" }),
        makeFeedback({ id: "fb_2", status: "pending", category: null }),
        makeFeedback({ id: "fb_3", status: "failed", category: null }),
      ],
    }),
  });
  const result = await withFetchStub(
    () => {
      throw new Error("haiku must NOT be called below threshold");
    },
    () => promoteSeedsPass(env),
  );
  assert.equal(result.scanned_groups, 0);
});

// --- listPromotedSeeds + route tests --------------------------------------

test("listPromotedSeeds: returns most-recent first, filters by domain", async () => {
  const env = makeEnv({
    DB: makeMockDb({
      seeds: [
        { id: "ps_old", domain: "design", category: "accessibility", kind: "failure", prompt_text: "old", promoted_at: "2026-05-01T00:00:00Z", removed_at: null },
        { id: "ps_new", domain: "design", category: "typography", kind: "answer_key", prompt_text: "new", promoted_at: "2026-05-09T00:00:00Z", removed_at: null },
        { id: "ps_code", domain: "code", category: "performance", kind: "failure", prompt_text: "code", promoted_at: "2026-05-09T00:00:00Z", removed_at: null },
      ],
    }),
  });
  const designSeeds = await listPromotedSeeds(env, "design");
  assert.equal(designSeeds.length, 2);
  assert.equal(designSeeds[0].prompt_text, "new"); // newest first
  const codeSeeds = await listPromotedSeeds(env, "code");
  assert.equal(codeSeeds.length, 1);
});

test("GET /seeds/promoted/design: returns count + seeds", async () => {
  const env = makeEnv({
    DB: makeMockDb({
      seeds: [
        { id: "ps_1", domain: "design", category: "accessibility", kind: "failure", prompt_text: "x", promoted_at: "2026-05-09T00:00:00Z", removed_at: null },
      ],
    }),
  });
  const app = createApp();
  const res = await app.fetch(new Request("http://localhost/seeds/promoted/design"), env);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.domain, "design");
  assert.equal(body.count, 1);
});

test("GET /seeds/promoted/banana: 400 invalid_domain", async () => {
  const app = createApp();
  const env = makeEnv();
  const res = await app.fetch(new Request("http://localhost/seeds/promoted/banana"), env);
  assert.equal(res.status, 400);
});

test("POST /admin/promote-seeds: 401 with wrong token", async () => {
  const app = createApp();
  const env = makeEnv();
  const res = await app.fetch(
    new Request("http://localhost/admin/promote-seeds", {
      method: "POST",
      headers: { authorization: "Bearer nope" },
    }),
    env,
  );
  assert.equal(res.status, 401);
});

test("POST /admin/promote-seeds: 200 with correct token + zero scanned (no eligible rows)", async () => {
  const app = createApp();
  const env = makeEnv();
  const res = await app.fetch(
    new Request("http://localhost/admin/promote-seeds", {
      method: "POST",
      headers: { authorization: "Bearer admin-test" },
    }),
    env,
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.scanned_groups, 0);
  assert.equal(body.promoted, 0);
});

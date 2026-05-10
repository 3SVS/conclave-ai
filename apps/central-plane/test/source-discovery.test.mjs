/**
 * Sprint E1 — source-discovery + candidate route tests.
 *
 * Stubs both global fetch (GitHub search + raw README + Anthropic) and
 * D1 to verify: discovery iterates queries, evaluates new repos via
 * Haiku, persists with relevance score; existing rows are skipped;
 * route auth + decide flow.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../dist/router.js";
import { runSourceDiscovery } from "../dist/source-discovery.js";

function makeMockDb({ candidates = [] } = {}) {
  const state = { candidates: new Map(candidates.map((c) => [c.id, { ...c }])) };
  return {
    state,
    prepare(sql) {
      let bound = [];
      const handlers = {
        async first() {
          return null;
        },
        async run() {
          if (/INSERT INTO source_candidates/.test(sql)) {
            const [
              id, github_full_name, github_url, raw_url, description, star_count,
              language, topics, relevance_score, relevance_reason, _status, discovered_at,
            ] = bound;
            // Simulate UNIQUE constraint on github_full_name
            for (const v of state.candidates.values()) {
              if (v.github_full_name === github_full_name) throw new Error("UNIQUE constraint");
            }
            state.candidates.set(id, {
              id, github_full_name, github_url, raw_url, description, star_count,
              language, topics, relevance_score, relevance_reason, status: "candidate",
              discovered_at, reviewed_at: null, reviewed_by: null, removed_at: null,
            });
            return { success: true };
          }
          if (/UPDATE source_candidates/.test(sql)) {
            const [decision, reviewed_at, reviewed_by, id] = bound;
            const row = state.candidates.get(id);
            if (!row || row.status !== "candidate" || row.removed_at !== null) {
              return { success: true, meta: { changes: 0 } };
            }
            row.status = decision;
            row.reviewed_at = reviewed_at;
            row.reviewed_by = reviewed_by;
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true };
        },
        async all() {
          if (/SELECT github_full_name FROM source_candidates/.test(sql)) {
            return {
              results: [...state.candidates.values()].map((c) => ({
                github_full_name: c.github_full_name,
              })),
            };
          }
          if (/FROM source_candidates/.test(sql) && /ORDER BY relevance_score/.test(sql)) {
            const wantStatus = bound[0];
            const filtered = [...state.candidates.values()]
              .filter((c) => c.removed_at === null && (wantStatus ? c.status === wantStatus : true))
              .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
            return { results: filtered };
          }
          return { results: [] };
        },
      };
      return {
        bind: (...args) => {
          bound = args;
          return handlers;
        },
        first: handlers.first,
        all: handlers.all,
        run: handlers.run,
      };
    },
  };
}

function makeEnv(overrides = {}) {
  return {
    DB: makeMockDb(),
    ENVIRONMENT: "test",
    ANTHROPIC_API_KEY: "test-key",
    INTERNAL_CALLBACK_TOKEN: "e1-test-token",
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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(body, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

function makeStubFetch({ ghItems = [], readmeMap = {}, haikuScore = 0.85 }) {
  return async (url) => {
    const u = String(url);
    if (u.includes("api.github.com/search/repositories")) {
      return jsonResponse({ items: ghItems });
    }
    if (u.includes("raw.githubusercontent.com")) {
      const parts = u.replace("https://raw.githubusercontent.com/", "").split("/");
      const fullName = `${parts[0]}/${parts[1]}`;
      const text = readmeMap[fullName];
      if (!text) return new Response("not found", { status: 404 });
      return textResponse(text);
    }
    if (u.includes("api.anthropic.com")) {
      return jsonResponse({
        content: [{ type: "text", text: JSON.stringify({ score: haikuScore, reason: "looks like a design system" }) }],
      });
    }
    return new Response("nothing", { status: 404 });
  };
}

test("source-discovery: saves new candidates with relevance score", async () => {
  const env = makeEnv();
  const ghItems = [
    {
      full_name: "acme/design-tokens",
      html_url: "https://github.com/acme/design-tokens",
      description: "Curated design tokens",
      stargazers_count: 1500,
      language: "TypeScript",
      topics: ["design-system", "tokens"],
      default_branch: "main",
    },
  ];
  const result = await withFetchStub(
    makeStubFetch({
      ghItems,
      readmeMap: { "acme/design-tokens": "# Design tokens\n\nA token registry for design systems." },
      haikuScore: 0.9,
    }),
    () => runSourceDiscovery(env),
  );
  assert.equal(result.total_saved, 1);
  assert.equal(env.DB.state.candidates.size, 1);
  const row = [...env.DB.state.candidates.values()][0];
  assert.equal(row.github_full_name, "acme/design-tokens");
  assert.equal(row.relevance_score, 0.9);
});

test("source-discovery: skips repos already in candidates table", async () => {
  const env = makeEnv({
    DB: makeMockDb({
      candidates: [
        {
          id: "sc_existing",
          github_full_name: "acme/design-tokens",
          status: "candidate",
          removed_at: null,
        },
      ],
    }),
  });
  const ghItems = [
    {
      full_name: "acme/design-tokens",
      html_url: "https://github.com/acme/design-tokens",
      description: "Curated design tokens",
      stargazers_count: 1500,
      language: "TypeScript",
      topics: ["design-system"],
      default_branch: "main",
    },
  ];
  let haikuCalled = 0;
  const stub = async (url) => {
    const u = String(url);
    if (u.includes("api.github.com")) return jsonResponse({ items: ghItems });
    if (u.includes("api.anthropic.com")) {
      haikuCalled++;
      return jsonResponse({ content: [{ type: "text", text: '{"score":0.9,"reason":"x"}' }] });
    }
    return new Response("nope", { status: 404 });
  };
  const result = await withFetchStub(stub, () => runSourceDiscovery(env));
  assert.equal(result.total_saved, 0);
  assert.equal(haikuCalled, 0, "haiku should NOT be called for existing candidates");
});

test("GET /admin/source-candidates: 401 with bad token", async () => {
  const app = createApp();
  const env = makeEnv();
  const res = await app.fetch(
    new Request("http://localhost/admin/source-candidates", {
      headers: { authorization: "Bearer wrong" },
    }),
    env,
  );
  assert.equal(res.status, 401);
});

test("GET /admin/source-candidates: returns rows with status filter", async () => {
  const app = createApp();
  const env = makeEnv({
    DB: makeMockDb({
      candidates: [
        {
          id: "sc_1",
          github_full_name: "acme/x",
          github_url: "https://github.com/acme/x",
          relevance_score: 0.9,
          status: "candidate",
          removed_at: null,
          discovered_at: "2026-05-10T00:00:00Z",
          topics: "[]",
        },
        {
          id: "sc_2",
          github_full_name: "acme/y",
          github_url: "https://github.com/acme/y",
          relevance_score: 0.4,
          status: "rejected",
          removed_at: null,
          discovered_at: "2026-05-09T00:00:00Z",
          topics: "[]",
        },
      ],
    }),
  });
  const res = await app.fetch(
    new Request("http://localhost/admin/source-candidates?status=candidate", {
      headers: { authorization: "Bearer e1-test-token" },
    }),
    env,
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.count, 1);
  assert.equal(body.candidates[0].id, "sc_1");
});

test("POST /admin/source-candidates/:id/decide: marks status when valid", async () => {
  const app = createApp();
  const env = makeEnv({
    DB: makeMockDb({
      candidates: [
        {
          id: "sc_1",
          github_full_name: "acme/x",
          status: "candidate",
          removed_at: null,
        },
      ],
    }),
  });
  const res = await app.fetch(
    new Request("http://localhost/admin/source-candidates/sc_1/decide", {
      method: "POST",
      headers: { authorization: "Bearer e1-test-token", "content-type": "application/json" },
      body: JSON.stringify({ decision: "approved", reviewer: "tester" }),
    }),
    env,
  );
  assert.equal(res.status, 200);
  assert.equal(env.DB.state.candidates.get("sc_1").status, "approved");
  assert.equal(env.DB.state.candidates.get("sc_1").reviewed_by, "tester");
});

test("POST /admin/source-candidates/:id/decide: 400 on bad decision", async () => {
  const app = createApp();
  const env = makeEnv();
  const res = await app.fetch(
    new Request("http://localhost/admin/source-candidates/sc_x/decide", {
      method: "POST",
      headers: { authorization: "Bearer e1-test-token", "content-type": "application/json" },
      body: JSON.stringify({ decision: "maybe" }),
    }),
    env,
  );
  assert.equal(res.status, 400);
});

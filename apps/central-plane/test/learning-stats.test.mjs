/**
 * Sprint D — /admin/learning-stats route tests.
 *
 * Mocks D1 with the SQL patterns the route runs. Verifies auth gate +
 * shape of the snapshot.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../dist/router.js";

function makeMockDb({ feedback = [], promoted = [], external = [] } = {}) {
  const state = {
    feedback: [...feedback],
    promoted: [...promoted],
    external: [...external],
  };
  return {
    state,
    prepare(sql) {
      let bound = [];
      const handlers = {
        async first() {
          if (/COUNT\(\*\) as n FROM user_feedback WHERE removed_at IS NULL\s*$/.test(sql)) {
            return { n: state.feedback.filter((r) => r.removed_at === null).length };
          }
          if (/COUNT\(\*\) as n FROM user_feedback\s+WHERE removed_at IS NULL AND created_at >= \?/.test(sql)) {
            const cutoff = bound[0];
            return {
              n: state.feedback.filter(
                (r) => r.removed_at === null && r.created_at >= cutoff,
              ).length,
            };
          }
          if (/COUNT\(\*\) as n FROM promoted_seeds WHERE removed_at IS NULL\s*$/.test(sql)) {
            return { n: state.promoted.filter((r) => r.removed_at === null).length };
          }
          if (/SUM\(source_count\)/.test(sql)) {
            const sum = state.promoted
              .filter((r) => r.removed_at === null)
              .reduce((acc, r) => acc + (r.source_count ?? 0), 0);
            return { n: sum };
          }
          if (/FROM promoted_seeds WHERE removed_at IS NULL AND promoted_at >= \?/.test(sql)) {
            const cutoff = bound[0];
            return {
              n: state.promoted.filter(
                (r) => r.removed_at === null && r.promoted_at >= cutoff,
              ).length,
            };
          }
          if (/COUNT\(\*\) as n FROM external_references/.test(sql)) {
            const now = bound[0];
            return {
              n: state.external.filter(
                (r) => r.removed_at === null && r.expires_at > now,
              ).length,
            };
          }
          return null;
        },
        async all() {
          if (/SELECT status as key/.test(sql)) {
            const counts = new Map();
            for (const r of state.feedback) {
              if (r.removed_at !== null) continue;
              counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
            }
            return {
              results: [...counts.entries()]
                .map(([key, count]) => ({ key, count }))
                .sort((a, b) => b.count - a.count),
            };
          }
          if (/SELECT category as key, COUNT.*FROM user_feedback/.test(sql)) {
            const counts = new Map();
            for (const r of state.feedback) {
              if (r.removed_at !== null) continue;
              if (r.status !== "classified") continue;
              if (!r.category) continue;
              counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
            }
            return {
              results: [...counts.entries()]
                .map(([key, count]) => ({ key, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 20),
            };
          }
          if (/SELECT domain as key, COUNT.*FROM promoted_seeds/.test(sql)) {
            const counts = new Map();
            for (const r of state.promoted) {
              if (r.removed_at !== null) continue;
              counts.set(r.domain, (counts.get(r.domain) ?? 0) + 1);
            }
            return {
              results: [...counts.entries()]
                .map(([key, count]) => ({ key, count }))
                .sort((a, b) => b.count - a.count),
            };
          }
          if (/SELECT category as key, COUNT.*FROM promoted_seeds/.test(sql)) {
            const counts = new Map();
            for (const r of state.promoted) {
              if (r.removed_at !== null) continue;
              counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
            }
            return {
              results: [...counts.entries()]
                .map(([key, count]) => ({ key, count }))
                .sort((a, b) => b.count - a.count),
            };
          }
          if (/SELECT domain as key, COUNT.*FROM external_references/.test(sql)) {
            const now = bound[0];
            const counts = new Map();
            for (const r of state.external) {
              if (r.removed_at !== null) continue;
              if (r.expires_at <= now) continue;
              counts.set(r.domain, (counts.get(r.domain) ?? 0) + 1);
            }
            return {
              results: [...counts.entries()]
                .map(([key, count]) => ({ key, count }))
                .sort((a, b) => b.count - a.count),
            };
          }
          if (/SELECT source_id as key/.test(sql)) {
            const now = bound[0];
            const counts = new Map();
            for (const r of state.external) {
              if (r.removed_at !== null) continue;
              if (r.expires_at <= now) continue;
              counts.set(r.source_id, (counts.get(r.source_id) ?? 0) + 1);
            }
            return {
              results: [...counts.entries()]
                .map(([key, count]) => ({ key, count }))
                .sort((a, b) => b.count - a.count),
            };
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
      };
    },
  };
}

function makeEnv(overrides = {}) {
  return {
    DB: makeMockDb(),
    ENVIRONMENT: "test",
    INTERNAL_CALLBACK_TOKEN: "stats-test-token",
    ...overrides,
  };
}

test("GET /admin/learning-stats: 401 with bad token", async () => {
  const app = createApp();
  const env = makeEnv();
  const res = await app.fetch(
    new Request("http://localhost/admin/learning-stats", {
      headers: { authorization: "Bearer wrong" },
    }),
    env,
  );
  assert.equal(res.status, 401);
});

test("GET /admin/learning-stats: 503 when token not configured", async () => {
  const app = createApp();
  const env = makeEnv({ INTERNAL_CALLBACK_TOKEN: undefined });
  const res = await app.fetch(
    new Request("http://localhost/admin/learning-stats", {
      headers: { authorization: "Bearer anything" },
    }),
    env,
  );
  assert.equal(res.status, 503);
});

test("GET /admin/learning-stats: returns aggregated snapshot", async () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const app = createApp();
  const env = makeEnv({
    DB: makeMockDb({
      feedback: [
        { id: "fb1", status: "classified", category: "design-tokens", removed_at: null, created_at: yesterday },
        { id: "fb2", status: "classified", category: "design-tokens", removed_at: null, created_at: yesterday },
        { id: "fb3", status: "pending", category: null, removed_at: null, created_at: yesterday },
        { id: "fb4", status: "classified", category: "accessibility", removed_at: null, created_at: yesterday },
      ],
      promoted: [
        { id: "ps1", domain: "design", category: "design-tokens", source_count: 4, promoted_at: yesterday, removed_at: null },
        { id: "ps2", domain: "design", category: "accessibility", source_count: 3, promoted_at: yesterday, removed_at: null },
      ],
      external: [
        { id: "ext1", domain: "design", source_id: "vercel-design", expires_at: future, removed_at: null },
        { id: "ext2", domain: "design", source_id: "shadcn-ui-readme", expires_at: future, removed_at: null },
      ],
    }),
  });
  const res = await app.fetch(
    new Request("http://localhost/admin/learning-stats", {
      headers: { authorization: "Bearer stats-test-token" },
    }),
    env,
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.feedback.total, 4);
  assert.equal(body.feedback.recent_7d, 4);
  assert.equal(body.feedback.by_status[0].key, "classified");
  assert.equal(body.feedback.by_status[0].count, 3);
  assert.equal(body.feedback.by_category[0].key, "design-tokens");
  assert.equal(body.feedback.by_category[0].count, 2);
  assert.equal(body.promoted_seeds.total, 2);
  assert.equal(body.promoted_seeds.total_source_rows, 7);
  assert.equal(body.external_references.total, 2);
  assert.ok(body.generated_at);
});

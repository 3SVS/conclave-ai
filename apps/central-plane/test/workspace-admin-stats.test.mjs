/**
 * workspace-admin-stats.test.mjs
 *
 * Stage 18: GET /admin/usage-stats — admin key guard + D1 aggregation.
 *
 * Tests:
 *  01. 503 when ADMIN_USAGE_STATS_KEY is unset
 *  02. 401 when x-admin-key is missing
 *  03. 401 when x-admin-key is wrong
 *  04. 200 with correct key and default range (7d)
 *  05. 200 with range=24h
 *  06. 200 with range=30d
 *  07. Invalid range defaults to 7d
 *  08. response shape: ok, range, cutoff, summary, byEventType, topUsers, dailyActivity
 *  09. summary.totalEvents is sum of all event counts
 *  10. summary.activeUsers correct distinct count
 *  11. byEventType includes label from EVENT_LABELS map
 *  12. byEventType unknown event type uses eventType as label
 *  13. telegramErrorRate = 0 when no tg events
 *  14. telegramErrorRate = 50% when 1 sent, 1 error
 *  15. llmFallbackRate = 0 when no review runs
 *  16. llmFallbackRate = 100% when all runs are mock-fallback
 *  17. topUsers ordered by count DESC
 *  18. dailyActivity aggregated by date
 *  19. empty stats when no events
 *  20. summary.totalEvents = 0 when no events
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { createApp } = await import("../dist/router.js");

const ADMIN_KEY = "test-admin-key-abc";

// ─── Mock DB ──────────────────────────────────────────────────────────────────

function makeDb(events = []) {
  // events: [{ id, user_key, event_type, metadata_json, created_at }]
  const stored = [...events];

  function filterByCutoff(cutoff) {
    return stored.filter((e) => e.created_at >= cutoff);
  }

  return {
    _events: stored,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() { /* inserts: no-op */ },
            async first() {
              const cutoff = args[0];
              const rows = filterByCutoff(cutoff);

              // COUNT(DISTINCT user_key)
              if (sql.includes("COUNT(DISTINCT user_key)")) {
                const distinct = new Set(rows.map((e) => e.user_key));
                return { count: distinct.size };
              }
              // telegram sent
              if (sql.includes("event_type = 'workspace_telegram_notification_sent'")) {
                return { count: rows.filter((e) => e.event_type === "workspace_telegram_notification_sent").length };
              }
              // telegram error
              if (sql.includes("event_type = 'workspace_telegram_notification_error'")) {
                return { count: rows.filter((e) => e.event_type === "workspace_telegram_notification_error").length };
              }
              // pr review run total
              if (sql.includes("event_type = 'workspace_pr_review_run'") && sql.includes("metadata_json LIKE")) {
                return { count: rows.filter((e) => e.event_type === "workspace_pr_review_run" && (e.metadata_json ?? "").includes("mock-fallback")).length };
              }
              if (sql.includes("event_type = 'workspace_pr_review_run'")) {
                return { count: rows.filter((e) => e.event_type === "workspace_pr_review_run").length };
              }
              return { count: 0 };
            },
            async all() {
              const cutoff = args[0];
              const rows = filterByCutoff(cutoff);

              // GROUP BY event_type
              if (sql.includes("GROUP BY event_type")) {
                const counts = {};
                for (const e of rows) {
                  counts[e.event_type] = (counts[e.event_type] ?? 0) + 1;
                }
                return {
                  results: Object.entries(counts)
                    .map(([event_type, count]) => ({ event_type, count }))
                    .sort((a, b) => b.count - a.count),
                };
              }
              // GROUP BY user_key (top users)
              if (sql.includes("GROUP BY user_key")) {
                const limit = args[1] ?? 10;
                const counts = {};
                for (const e of rows) {
                  counts[e.user_key] = (counts[e.user_key] ?? 0) + 1;
                }
                return {
                  results: Object.entries(counts)
                    .map(([user_key, count]) => ({ user_key, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, limit),
                };
              }
              // GROUP BY day_bucket
              if (sql.includes("day_bucket")) {
                const counts = {};
                for (const e of rows) {
                  const day = e.created_at.slice(0, 10);
                  counts[day] = (counts[day] ?? 0) + 1;
                }
                return {
                  results: Object.entries(counts)
                    .map(([day_bucket, count]) => ({ day_bucket, count }))
                    .sort((a, b) => a.day_bucket.localeCompare(b.day_bucket)),
                };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

function makeEnv(override = {}) {
  return {
    ENVIRONMENT: "test",
    ADMIN_USAGE_STATS_KEY: ADMIN_KEY,
    DB: makeDb(),
    ...override,
  };
}

function makeEnvWithEvents(events, override = {}) {
  return {
    ...makeEnv(override),
    DB: makeDb(events),
  };
}

function makeEvent(userKey, eventType, daysAgo = 1, metadataJson = null) {
  const d = new Date(Date.now() - daysAgo * 86400 * 1000);
  return {
    id: `e_${Math.random().toString(36).slice(2)}`,
    user_key: userKey,
    event_type: eventType,
    metadata_json: metadataJson,
    created_at: d.toISOString(),
  };
}

function get(env, path) {
  const app = createApp();
  return app.fetch(
    new Request(`http://localhost${path}`, { method: "GET", headers: { "x-admin-key": ADMIN_KEY } }),
    env,
  );
}

function getNoKey(env, path) {
  const app = createApp();
  return app.fetch(new Request(`http://localhost${path}`), env);
}

function getWrongKey(env, path) {
  const app = createApp();
  return app.fetch(
    new Request(`http://localhost${path}`, { method: "GET", headers: { "x-admin-key": "wrong-key" } }),
    env,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /admin/usage-stats", () => {
  it("01 — 503 when ADMIN_USAGE_STATS_KEY unset", async () => {
    const env = makeEnv({ ADMIN_USAGE_STATS_KEY: undefined });
    const res = await get(env, "/admin/usage-stats");
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, "disabled");
  });

  it("02 — 401 when x-admin-key missing", async () => {
    const env = makeEnv();
    const res = await getNoKey(env, "/admin/usage-stats");
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, "unauthorized");
  });

  it("03 — 401 when x-admin-key wrong", async () => {
    const env = makeEnv();
    const res = await getWrongKey(env, "/admin/usage-stats");
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, "unauthorized");
  });

  it("04 — 200 with correct key and default range (7d)", async () => {
    const env = makeEnv();
    const res = await get(env, "/admin/usage-stats");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.range, "7d");
  });

  it("05 — 200 with range=24h", async () => {
    const env = makeEnv();
    const res = await get(env, "/admin/usage-stats?range=24h");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.range, "24h");
    assert.ok(body.cutoff, "cutoff present");
  });

  it("06 — 200 with range=30d", async () => {
    const env = makeEnv();
    const res = await get(env, "/admin/usage-stats?range=30d");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.range, "30d");
  });

  it("07 — invalid range defaults to 7d", async () => {
    const env = makeEnv();
    const res = await get(env, "/admin/usage-stats?range=invalid");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.range, "7d");
  });

  it("08 — response has required shape", async () => {
    const env = makeEnv();
    const res = await get(env, "/admin/usage-stats");
    const body = await res.json();
    assert.ok("summary" in body);
    assert.ok("byEventType" in body);
    assert.ok("topUsers" in body);
    assert.ok("dailyActivity" in body);
    assert.ok("cutoff" in body);
    assert.ok("totalEvents" in body.summary);
    assert.ok("activeUsers" in body.summary);
    assert.ok("telegramErrorRate" in body.summary);
    assert.ok("llmFallbackRate" in body.summary);
  });

  it("09 — totalEvents is sum of all event counts", async () => {
    const events = [
      makeEvent("u1", "workspace_pr_review_run"),
      makeEvent("u1", "workspace_pr_review_run"),
      makeEvent("u2", "workspace_pr_comment_posted"),
    ];
    const env = makeEnvWithEvents(events);
    const res = await get(env, "/admin/usage-stats?range=7d");
    const body = await res.json();
    assert.equal(body.summary.totalEvents, 3);
  });

  it("10 — activeUsers is distinct user_key count", async () => {
    const events = [
      makeEvent("u1", "workspace_pr_review_run"),
      makeEvent("u1", "workspace_pr_review_run"),
      makeEvent("u2", "workspace_pr_comment_posted"),
      makeEvent("u3", "workspace_fix_pack_exported"),
    ];
    const env = makeEnvWithEvents(events);
    const res = await get(env, "/admin/usage-stats?range=7d");
    const body = await res.json();
    assert.equal(body.summary.activeUsers, 3);
  });

  it("11 — byEventType includes Korean label", async () => {
    const events = [makeEvent("u1", "workspace_pr_review_run")];
    const env = makeEnvWithEvents(events);
    const res = await get(env, "/admin/usage-stats?range=7d");
    const body = await res.json();
    const row = body.byEventType.find((r) => r.eventType === "workspace_pr_review_run");
    assert.ok(row, "row present");
    assert.equal(row.label, "PR 코드 확인");
    assert.equal(row.count, 1);
  });

  it("12 — unknown event type uses eventType as label", async () => {
    const events = [makeEvent("u1", "some_unknown_event_xyz")];
    const env = makeEnvWithEvents(events);
    const res = await get(env, "/admin/usage-stats?range=7d");
    const body = await res.json();
    const row = body.byEventType.find((r) => r.eventType === "some_unknown_event_xyz");
    assert.ok(row);
    assert.equal(row.label, "some_unknown_event_xyz");
  });

  it("13 — telegramErrorRate = 0 when no tg events", async () => {
    const env = makeEnv();
    const res = await get(env, "/admin/usage-stats?range=7d");
    const body = await res.json();
    assert.equal(body.summary.telegramErrorRate, 0);
  });

  it("14 — telegramErrorRate = 50% when 1 sent + 1 error", async () => {
    const events = [
      makeEvent("u1", "workspace_telegram_notification_sent"),
      makeEvent("u2", "workspace_telegram_notification_error"),
    ];
    const env = makeEnvWithEvents(events);
    const res = await get(env, "/admin/usage-stats?range=7d");
    const body = await res.json();
    assert.equal(body.summary.telegramErrorRate, 50);
  });

  it("15 — llmFallbackRate = 0 when no review runs", async () => {
    const env = makeEnv();
    const res = await get(env, "/admin/usage-stats?range=7d");
    const body = await res.json();
    assert.equal(body.summary.llmFallbackRate, 0);
  });

  it("16 — llmFallbackRate = 100 when all runs are mock-fallback", async () => {
    const events = [
      makeEvent("u1", "workspace_pr_review_run", 1, '{"source":"mock-fallback","passed":0}'),
      makeEvent("u2", "workspace_pr_review_run", 1, '{"source":"mock-fallback","passed":0}'),
    ];
    const env = makeEnvWithEvents(events);
    const res = await get(env, "/admin/usage-stats?range=7d");
    const body = await res.json();
    assert.equal(body.summary.llmFallbackRate, 100);
  });

  it("17 — topUsers ordered by count DESC", async () => {
    const events = [
      makeEvent("u1", "workspace_pr_review_run"),
      makeEvent("u2", "workspace_pr_review_run"),
      makeEvent("u2", "workspace_pr_comment_posted"),
      makeEvent("u2", "workspace_pr_review_run"),
    ];
    const env = makeEnvWithEvents(events);
    const res = await get(env, "/admin/usage-stats?range=7d");
    const body = await res.json();
    assert.equal(body.topUsers[0]?.userKey, "u2");
    assert.equal(body.topUsers[0]?.count, 3);
    assert.equal(body.topUsers[1]?.userKey, "u1");
    assert.equal(body.topUsers[1]?.count, 1);
  });

  it("18 — dailyActivity aggregated by date", async () => {
    const events = [
      makeEvent("u1", "workspace_pr_review_run", 0),
      makeEvent("u2", "workspace_pr_comment_posted", 0),
      makeEvent("u3", "workspace_pr_review_run", 2),
    ];
    const env = makeEnvWithEvents(events);
    const res = await get(env, "/admin/usage-stats?range=7d");
    const body = await res.json();
    const total = body.dailyActivity.reduce((s, r) => s + r.count, 0);
    assert.equal(total, 3);
    assert.ok(body.dailyActivity.every((r) => "date" in r && "count" in r));
  });

  it("19 — empty stats when no events", async () => {
    const env = makeEnv();
    const res = await get(env, "/admin/usage-stats?range=7d");
    const body = await res.json();
    assert.equal(body.summary.totalEvents, 0);
    assert.deepEqual(body.byEventType, []);
    assert.deepEqual(body.topUsers, []);
  });

  it("20 — totalEvents = 0 when no events match range", async () => {
    // Events older than 24h window
    const events = [
      makeEvent("u1", "workspace_pr_review_run", 2), // 2 days ago
    ];
    const env = makeEnvWithEvents(events);
    const res = await get(env, "/admin/usage-stats?range=24h");
    const body = await res.json();
    assert.equal(body.summary.totalEvents, 0);
  });
});

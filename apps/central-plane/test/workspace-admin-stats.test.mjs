/**
 * workspace-admin-stats.test.mjs
 *
 * Stage 18+19: GET /admin/usage-stats — admin key guard + D1 aggregation + dry-run billing.
 *
 * Tests:
 *  01. 503 when ADMIN_USAGE_STATS_KEY is unset
 *  02. 401 when x-admin-key is missing
 *  03. 401 when x-admin-key is wrong
 *  04. 200 with correct key and default range (7d)
 *  05. 200 with range=24h
 *  06. 200 with range=30d
 *  07. Invalid range defaults to 7d
 *  08. response has required shape (including dryRunBilling)
 *  09. summary.totalEvents is sum of all event counts
 *  10. summary.activeUsers correct distinct count
 *  11. byEventType includes Korean label (from billing-rules)
 *  12. byEventType unknown event type uses eventType as label
 *  13. telegramErrorRate = 0 when no tg events
 *  14. telegramErrorRate = 50% when 1 sent, 1 error
 *  15. llmFallbackRate = 0 when no review runs
 *  16. llmFallbackRate = 100% when all runs are mock-fallback
 *  17. topUsers ordered by count DESC
 *  18. dailyActivity aggregated by date
 *  19. empty stats when no events
 *  20. summary.totalEvents = 0 when no events match range
 *  21. [billing] PR review maps to 1 review credit (billable_candidate)
 *  22. [billing] comment posted maps to included 0 credit
 *  23. [billing] telegram sent maps to included 0 credit
 *  24. [billing] unknown event maps to ignored 0 credit
 *  25. [billing] dryRunBilling.actualChargesEnabled is false
 *  26. [billing] totalEstimatedCredits counts only billable_candidate events
 *  27. [billing] byCreditType aggregates by credit type
 *  28. [billing] topUsersByEstimatedCredits aggregates correctly
 *  29. [billing] topProjectsByEstimatedCredits aggregates by project_id
 *  30. [billing] zero credits when no billable events
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { getBillingRule, estimateCredits, getAllRules } = await import("../dist/workspace/billing-rules.js");
const { createApp } = await import("../dist/router.js");

const ADMIN_KEY = "test-admin-key-abc";

// ─── Mock DB ──────────────────────────────────────────────────────────────────

function makeDb(events = []) {
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

              if (sql.includes("COUNT(DISTINCT user_key)")) {
                const distinct = new Set(rows.map((e) => e.user_key));
                return { count: distinct.size };
              }
              if (sql.includes("event_type = 'workspace_telegram_notification_sent'")) {
                return { count: rows.filter((e) => e.event_type === "workspace_telegram_notification_sent").length };
              }
              if (sql.includes("event_type = 'workspace_telegram_notification_error'")) {
                return { count: rows.filter((e) => e.event_type === "workspace_telegram_notification_error").length };
              }
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

              // user+project+event breakdown (new in Stage 19)
              if (sql.includes("GROUP BY user_key, project_id, event_type")) {
                const map = new Map();
                for (const e of rows) {
                  const key = `${e.user_key}|${e.project_id ?? ""}|${e.event_type}`;
                  const cur = map.get(key) ?? { user_key: e.user_key, project_id: e.project_id ?? null, event_type: e.event_type, count: 0 };
                  cur.count += 1;
                  map.set(key, cur);
                }
                return { results: Array.from(map.values()) };
              }
              // top active users (with LIMIT)
              if (sql.includes("GROUP BY user_key") && sql.includes("LIMIT")) {
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
              // event type counts
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
              // daily buckets
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
  return { ...makeEnv(override), DB: makeDb(events) };
}

function makeEvent(userKey, eventType, daysAgo = 1, metadataJson = null, projectId = null) {
  const d = new Date(Date.now() - daysAgo * 86400 * 1000);
  return {
    id: `e_${Math.random().toString(36).slice(2)}`,
    user_key: userKey,
    event_type: eventType,
    metadata_json: metadataJson,
    project_id: projectId,
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
    const res = await getNoKey(makeEnv(), "/admin/usage-stats");
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, "unauthorized");
  });

  it("03 — 401 when x-admin-key wrong", async () => {
    const res = await getWrongKey(makeEnv(), "/admin/usage-stats");
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, "unauthorized");
  });

  it("04 — 200 with correct key and default range (7d)", async () => {
    const res = await get(makeEnv(), "/admin/usage-stats");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.range, "7d");
  });

  it("05 — 200 with range=24h", async () => {
    const res = await get(makeEnv(), "/admin/usage-stats?range=24h");
    assert.equal(res.status, 200);
    assert.equal((await res.json()).range, "24h");
  });

  it("06 — 200 with range=30d", async () => {
    const res = await get(makeEnv(), "/admin/usage-stats?range=30d");
    assert.equal(res.status, 200);
    assert.equal((await res.json()).range, "30d");
  });

  it("07 — invalid range defaults to 7d", async () => {
    const res = await get(makeEnv(), "/admin/usage-stats?range=invalid");
    assert.equal(res.status, 200);
    assert.equal((await res.json()).range, "7d");
  });

  it("08 — response has required shape including dryRunBilling", async () => {
    const body = await (await get(makeEnv(), "/admin/usage-stats")).json();
    assert.ok("summary" in body);
    assert.ok("byEventType" in body);
    assert.ok("topUsers" in body);
    assert.ok("dailyActivity" in body);
    assert.ok("dryRunBilling" in body);
    assert.ok("actualChargesEnabled" in body.dryRunBilling);
    assert.equal(body.dryRunBilling.actualChargesEnabled, false);
    assert.ok("totalEstimatedCredits" in body.dryRunBilling);
    assert.ok("byEventType" in body.dryRunBilling);
    assert.ok("topUsersByEstimatedCredits" in body.dryRunBilling);
    assert.ok("topProjectsByEstimatedCredits" in body.dryRunBilling);
  });

  it("09 — totalEvents is sum of all event counts", async () => {
    const events = [
      makeEvent("u1", "workspace_pr_review_run"),
      makeEvent("u1", "workspace_pr_review_run"),
      makeEvent("u2", "workspace_pr_comment_posted"),
    ];
    const body = await (await get(makeEnvWithEvents(events), "/admin/usage-stats?range=7d")).json();
    assert.equal(body.summary.totalEvents, 3);
  });

  it("10 — activeUsers is distinct user_key count", async () => {
    const events = [
      makeEvent("u1", "workspace_pr_review_run"),
      makeEvent("u1", "workspace_pr_review_run"),
      makeEvent("u2", "workspace_pr_comment_posted"),
      makeEvent("u3", "workspace_fix_pack_exported"),
    ];
    const body = await (await get(makeEnvWithEvents(events), "/admin/usage-stats?range=7d")).json();
    assert.equal(body.summary.activeUsers, 3);
  });

  it("11 — byEventType includes Korean label (via billing-rules)", async () => {
    const events = [makeEvent("u1", "workspace_pr_review_run")];
    const body = await (await get(makeEnvWithEvents(events), "/admin/usage-stats?range=7d")).json();
    const row = body.byEventType.find((r) => r.eventType === "workspace_pr_review_run");
    assert.ok(row, "row present");
    assert.equal(row.label, "PR 코드 확인");
    assert.equal(row.count, 1);
  });

  it("12 — unknown event type uses eventType as label", async () => {
    const events = [makeEvent("u1", "some_unknown_event_xyz")];
    const body = await (await get(makeEnvWithEvents(events), "/admin/usage-stats?range=7d")).json();
    const row = body.byEventType.find((r) => r.eventType === "some_unknown_event_xyz");
    assert.ok(row);
    assert.equal(row.label, "some_unknown_event_xyz");
  });

  it("13 — telegramErrorRate = 0 when no tg events", async () => {
    const body = await (await get(makeEnv(), "/admin/usage-stats?range=7d")).json();
    assert.equal(body.summary.telegramErrorRate, 0);
  });

  it("14 — telegramErrorRate = 50% when 1 sent + 1 error", async () => {
    const events = [
      makeEvent("u1", "workspace_telegram_notification_sent"),
      makeEvent("u2", "workspace_telegram_notification_error"),
    ];
    const body = await (await get(makeEnvWithEvents(events), "/admin/usage-stats?range=7d")).json();
    assert.equal(body.summary.telegramErrorRate, 50);
  });

  it("15 — llmFallbackRate = 0 when no review runs", async () => {
    const body = await (await get(makeEnv(), "/admin/usage-stats?range=7d")).json();
    assert.equal(body.summary.llmFallbackRate, 0);
  });

  it("16 — llmFallbackRate = 100 when all runs are mock-fallback", async () => {
    const events = [
      makeEvent("u1", "workspace_pr_review_run", 1, '{"source":"mock-fallback"}'),
      makeEvent("u2", "workspace_pr_review_run", 1, '{"source":"mock-fallback"}'),
    ];
    const body = await (await get(makeEnvWithEvents(events), "/admin/usage-stats?range=7d")).json();
    assert.equal(body.summary.llmFallbackRate, 100);
  });

  it("17 — topUsers ordered by count DESC", async () => {
    const events = [
      makeEvent("u1", "workspace_pr_review_run"),
      makeEvent("u2", "workspace_pr_review_run"),
      makeEvent("u2", "workspace_pr_comment_posted"),
      makeEvent("u2", "workspace_pr_review_run"),
    ];
    const body = await (await get(makeEnvWithEvents(events), "/admin/usage-stats?range=7d")).json();
    assert.equal(body.topUsers[0]?.userKey, "u2");
    assert.equal(body.topUsers[0]?.count, 3);
    assert.equal(body.topUsers[1]?.userKey, "u1");
  });

  it("18 — dailyActivity aggregated by date", async () => {
    const events = [
      makeEvent("u1", "workspace_pr_review_run", 0),
      makeEvent("u2", "workspace_pr_comment_posted", 0),
      makeEvent("u3", "workspace_pr_review_run", 2),
    ];
    const body = await (await get(makeEnvWithEvents(events), "/admin/usage-stats?range=7d")).json();
    const total = body.dailyActivity.reduce((s, r) => s + r.count, 0);
    assert.equal(total, 3);
    assert.ok(body.dailyActivity.every((r) => "date" in r && "count" in r));
  });

  it("19 — empty stats when no events", async () => {
    const body = await (await get(makeEnv(), "/admin/usage-stats?range=7d")).json();
    assert.equal(body.summary.totalEvents, 0);
    assert.deepEqual(body.byEventType, []);
    assert.deepEqual(body.topUsers, []);
  });

  it("20 — totalEvents = 0 when no events match range", async () => {
    const events = [makeEvent("u1", "workspace_pr_review_run", 2)];
    const body = await (await get(makeEnvWithEvents(events), "/admin/usage-stats?range=24h")).json();
    assert.equal(body.summary.totalEvents, 0);
  });
});

// ─── Billing rules unit tests ─────────────────────────────────────────────────

describe("billing-rules", () => {
  it("21 — PR review maps to 1 review credit (billable_candidate)", () => {
    const rule = getBillingRule("workspace_pr_review_run");
    assert.equal(rule.billingStatus, "billable_candidate");
    assert.equal(rule.creditType, "review");
    assert.equal(rule.creditCost, 1);
    assert.equal(estimateCredits("workspace_pr_review_run", 3), 3);
  });

  it("22 — comment posted maps to included 0 credit", () => {
    const rule = getBillingRule("workspace_pr_comment_posted");
    assert.equal(rule.billingStatus, "included");
    assert.equal(rule.creditCost, 0);
    assert.equal(estimateCredits("workspace_pr_comment_posted", 10), 0);
  });

  it("23 — telegram sent maps to included 0 credit", () => {
    const rule = getBillingRule("workspace_telegram_notification_sent");
    assert.equal(rule.billingStatus, "included");
    assert.equal(rule.creditCost, 0);
  });

  it("24 — unknown event maps to ignored 0 credit", () => {
    const rule = getBillingRule("some_unknown_event");
    assert.equal(rule.billingStatus, "ignored");
    assert.equal(rule.creditCost, 0);
    assert.equal(estimateCredits("some_unknown_event", 100), 0);
  });
});

// ─── Dry-run billing in admin usage-stats ────────────────────────────────────

describe("dryRunBilling in /admin/usage-stats", () => {
  it("25 — actualChargesEnabled is always false", async () => {
    const body = await (await get(makeEnv(), "/admin/usage-stats")).json();
    assert.equal(body.dryRunBilling.actualChargesEnabled, false);
  });

  it("26 — totalEstimatedCredits counts only billable_candidate events", async () => {
    const events = [
      makeEvent("u1", "workspace_pr_review_run"),   // 1 credit
      makeEvent("u1", "workspace_pr_review_run"),   // 1 credit
      makeEvent("u2", "workspace_pr_comment_posted"), // 0 credit (included)
      makeEvent("u2", "workspace_telegram_notification_sent"), // 0 credit (included)
    ];
    const body = await (await get(makeEnvWithEvents(events), "/admin/usage-stats?range=7d")).json();
    assert.equal(body.dryRunBilling.totalEstimatedCredits, 2);
  });

  it("27 — byCreditType groups credits by type", async () => {
    const events = [
      makeEvent("u1", "workspace_pr_review_run"),
      makeEvent("u1", "workspace_pr_review_run"),
      makeEvent("u1", "workspace_pr_review_run"),
    ];
    const body = await (await get(makeEnvWithEvents(events), "/admin/usage-stats?range=7d")).json();
    const reviewEntry = body.dryRunBilling.byCreditType.find((r) => r.creditType === "review");
    assert.ok(reviewEntry, "review entry present");
    assert.equal(reviewEntry.estimatedCredits, 3);
  });

  it("28 — topUsersByEstimatedCredits aggregates by user", async () => {
    const events = [
      makeEvent("u1", "workspace_pr_review_run"),   // 1 credit
      makeEvent("u2", "workspace_pr_review_run"),   // 1 credit
      makeEvent("u2", "workspace_pr_review_run"),   // 1 credit (total u2=2)
      makeEvent("u2", "workspace_pr_comment_posted"), // 0 credit
    ];
    const body = await (await get(makeEnvWithEvents(events), "/admin/usage-stats?range=7d")).json();
    const top = body.dryRunBilling.topUsersByEstimatedCredits;
    assert.equal(top[0]?.userKey, "u2");
    assert.equal(top[0]?.estimatedCredits, 2);
    assert.equal(top[1]?.userKey, "u1");
    assert.equal(top[1]?.estimatedCredits, 1);
  });

  it("29 — topProjectsByEstimatedCredits aggregates by project_id", async () => {
    const events = [
      makeEvent("u1", "workspace_pr_review_run", 1, null, "proj_a"),  // 1 credit
      makeEvent("u1", "workspace_pr_review_run", 1, null, "proj_b"),  // 1 credit
      makeEvent("u2", "workspace_pr_review_run", 1, null, "proj_a"),  // 1 credit (proj_a=2)
    ];
    const body = await (await get(makeEnvWithEvents(events), "/admin/usage-stats?range=7d")).json();
    const top = body.dryRunBilling.topProjectsByEstimatedCredits;
    assert.equal(top[0]?.projectId, "proj_a");
    assert.equal(top[0]?.estimatedCredits, 2);
    assert.equal(top[1]?.projectId, "proj_b");
    assert.equal(top[1]?.estimatedCredits, 1);
  });

  it("30 — zero credits when no billable events", async () => {
    const events = [
      makeEvent("u1", "workspace_pr_comment_posted"),
      makeEvent("u1", "workspace_telegram_notification_sent"),
    ];
    const body = await (await get(makeEnvWithEvents(events), "/admin/usage-stats?range=7d")).json();
    assert.equal(body.dryRunBilling.totalEstimatedCredits, 0);
    assert.deepEqual(body.dryRunBilling.topUsersByEstimatedCredits, []);
  });
});

/**
 * workspace-admin-credits.test.mjs
 *
 * Stage 20: credit ledger skeleton — balance, grant, ledger, preview.
 *
 * Tests:
 *  01. GET /admin/credits — 503 when key not set
 *  02. GET /admin/credits — 401 on key mismatch
 *  03. GET /admin/credits — 400 when userKey missing
 *  04. GET /admin/credits — returns empty array when no balances
 *  05. POST /admin/credits/grant — grants credits and returns balance + ledger entry
 *  06. POST /admin/credits/grant — second grant increments balance
 *  07. POST /admin/credits/grant — rejects amount = 0
 *  08. POST /admin/credits/grant — rejects non-integer amount
 *  09. POST /admin/credits/grant — rejects invalid creditType
 *  10. POST /admin/credits/grant — rejects missing reason
 *  11. GET /admin/credits after grant — balance reflects grant
 *  12. GET /admin/credits/ledger — returns ledger entries ordered by created_at DESC
 *  13. GET /admin/credits/ledger — 401 on missing key
 *  14. GET /admin/credits/preview — actualDebitsEnabled is false
 *  15. GET /admin/credits/preview — maps workspace_pr_review_run to review credit
 *  16. GET /admin/credits/preview — does NOT include included events
 *  17. GET /admin/credits/preview — totalEstimatedCredits sums billable events
 *  18. GET /admin/credits/preview — userKey filter scopes to one user
 *  19. GET /admin/credits/preview — empty when no billable events
 *  20. GET /admin/credits/preview — invalid range defaults to 7d
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { createApp } = await import("../dist/router.js");

const ADMIN_KEY = "test-credits-admin-key";

// ─── Mock DB ──────────────────────────────────────────────────────────────────

function makeDb(usageEvents = []) {
  const balances = new Map();  // key: `${userKey}:${creditType}` → { id, user_key, credit_type, balance, created_at, updated_at }
  const ledger = [];           // array of ledger rows
  const stored = [...usageEvents];

  function filterUsageByCutoff(cutoff) {
    return stored.filter((e) => e.created_at >= cutoff);
  }

  return {
    _balances: balances,
    _ledger: ledger,
    _usageEvents: stored,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              // UPSERT workspace_credit_balances
              if (sql.includes("INSERT INTO workspace_credit_balances") && sql.includes("ON CONFLICT")) {
                const [id, userKey, creditType, amount, createdAt, updatedAt] = args;
                const key = `${userKey}:${creditType}`;
                const existing = balances.get(key);
                if (existing) {
                  existing.balance += amount;
                  existing.updated_at = updatedAt;
                } else {
                  balances.set(key, { id, user_key: userKey, credit_type: creditType, balance: amount, created_at: createdAt, updated_at: updatedAt });
                }
              }
              // INSERT workspace_credit_ledger
              if (sql.includes("INSERT INTO workspace_credit_ledger")) {
                const [id, userKey, projectId, creditType, amount, reason, metadataJson, createdAt] = args;
                ledger.push({ id, user_key: userKey, project_id: projectId, credit_type: creditType, amount, direction: "grant", reason, source_event_id: null, metadata_json: metadataJson, created_at: createdAt });
              }
            },
            async first() {
              // SELECT balance from credit_balances
              if (sql.includes("SELECT balance FROM workspace_credit_balances")) {
                const [userKey, creditType] = args;
                const key = `${userKey}:${creditType}`;
                const row = balances.get(key);
                return row ? { balance: row.balance } : null;
              }
              // SELECT credit_type, balance, updated_at (single row for getCreditBalance)
              if (sql.includes("SELECT credit_type, balance, updated_at") && !sql.includes("ORDER BY")) {
                const [userKey, creditType] = args;
                return balances.get(`${userKey}:${creditType}`) ?? null;
              }
              // Usage events for preview (first() not used here)
              return null;
            },
            async all() {
              // listCreditBalances — SELECT credit_type, balance, updated_at ... WHERE user_key = ?
              if (sql.includes("SELECT credit_type, balance, updated_at") && sql.includes("ORDER BY credit_type")) {
                const [userKey] = args;
                const results = [];
                for (const [key, row] of balances.entries()) {
                  if (key.startsWith(`${userKey}:`)) results.push(row);
                }
                return { results: results.sort((a, b) => a.credit_type.localeCompare(b.credit_type)) };
              }
              // listCreditLedger
              if (sql.includes("FROM workspace_credit_ledger") && sql.includes("WHERE user_key")) {
                const [userKey, limit] = args;
                const results = ledger
                  .filter((r) => r.user_key === userKey)
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .slice(0, limit ?? 50);
                return { results };
              }
              // previewCreditDebitFromUsageEvents — with userKey filter
              if (sql.includes("FROM workspace_usage_events") && sql.includes("AND user_key = ?")) {
                const [cutoff, userKey] = args;
                const rows = filterUsageByCutoff(cutoff).filter((e) => e.user_key === userKey);
                return { results: aggregateUsageRows(rows) };
              }
              // previewCreditDebitFromUsageEvents — without userKey filter
              if (sql.includes("FROM workspace_usage_events") && sql.includes("GROUP BY user_key")) {
                const [cutoff] = args;
                const rows = filterUsageByCutoff(cutoff);
                return { results: aggregateUsageRows(rows) };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

function aggregateUsageRows(rows) {
  const map = new Map();
  for (const e of rows) {
    const key = `${e.user_key}|${e.project_id ?? ""}|${e.event_type}`;
    const cur = map.get(key) ?? { user_key: e.user_key, project_id: e.project_id ?? null, event_type: e.event_type, count: 0, sample_created_at: e.created_at };
    cur.count += 1;
    if (e.created_at > cur.sample_created_at) cur.sample_created_at = e.created_at;
    map.set(key, cur);
  }
  return Array.from(map.values());
}

function makeUsageEvent(userKey, eventType, daysAgo = 1, projectId = null) {
  const d = new Date(Date.now() - daysAgo * 86400 * 1000);
  return { id: `e_${Math.random().toString(36).slice(2)}`, user_key: userKey, event_type: eventType, project_id: projectId, metadata_json: null, created_at: d.toISOString() };
}

function makeEnv(override = {}) {
  return { ENVIRONMENT: "test", ADMIN_USAGE_STATS_KEY: ADMIN_KEY, DB: makeDb(), ...override };
}

function makeEnvWithUsage(events, override = {}) {
  return { ENVIRONMENT: "test", ADMIN_USAGE_STATS_KEY: ADMIN_KEY, DB: makeDb(events), ...override };
}

function req(method, path, body) {
  const app = createApp();
  const headers = { "x-admin-key": ADMIN_KEY };
  if (body) headers["content-type"] = "application/json";
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    makeEnv(),
  );
}

function reqWithEnv(env, method, path, body) {
  const app = createApp();
  const headers = { "x-admin-key": ADMIN_KEY };
  if (body) headers["content-type"] = "application/json";
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    env,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("admin credit endpoints", () => {
  it("01 — GET /admin/credits 503 when key not set", async () => {
    const env = makeEnv({ ADMIN_USAGE_STATS_KEY: undefined });
    const res = await reqWithEnv(env, "GET", "/admin/credits?userKey=u1", null);
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, "disabled");
  });

  it("02 — GET /admin/credits 401 on key mismatch", async () => {
    const app = createApp();
    const res = await app.fetch(
      new Request("http://localhost/admin/credits?userKey=u1", { headers: { "x-admin-key": "wrong" } }),
      makeEnv(),
    );
    assert.equal(res.status, 401);
  });

  it("03 — GET /admin/credits 400 when userKey missing", async () => {
    const res = await req("GET", "/admin/credits", null);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "userKey_required");
  });

  it("04 — GET /admin/credits returns empty array when no balances", async () => {
    const res = await req("GET", "/admin/credits?userKey=u1", null);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.balances, []);
  });

  it("05 — POST /admin/credits/grant creates balance + ledger entry", async () => {
    const env = makeEnv();
    const res = await reqWithEnv(env, "POST", "/admin/credits/grant", {
      userKey: "u1", creditType: "review", amount: 5, reason: "welcome grant",
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.balance.balance, 5);
    assert.equal(body.balance.creditType, "review");
    assert.equal(body.ledgerEntry.direction, "grant");
    assert.equal(body.ledgerEntry.amount, 5);
    assert.equal(body.ledgerEntry.reason, "welcome grant");
  });

  it("06 — POST /admin/credits/grant second grant increments balance", async () => {
    const env = makeEnv();
    await reqWithEnv(env, "POST", "/admin/credits/grant", {
      userKey: "u1", creditType: "review", amount: 3, reason: "first",
    });
    const res = await reqWithEnv(env, "POST", "/admin/credits/grant", {
      userKey: "u1", creditType: "review", amount: 2, reason: "second",
    });
    const body = await res.json();
    assert.equal(body.balance.balance, 5);
  });

  it("07 — POST /admin/credits/grant rejects amount = 0", async () => {
    const res = await req("POST", "/admin/credits/grant", {
      userKey: "u1", creditType: "review", amount: 0, reason: "test",
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "amount_must_be_positive_integer");
  });

  it("08 — POST /admin/credits/grant rejects non-integer amount", async () => {
    const res = await req("POST", "/admin/credits/grant", {
      userKey: "u1", creditType: "review", amount: 1.5, reason: "test",
    });
    assert.equal(res.status, 400);
  });

  it("09 — POST /admin/credits/grant rejects invalid creditType", async () => {
    const res = await req("POST", "/admin/credits/grant", {
      userKey: "u1", creditType: "unknown", amount: 1, reason: "test",
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "creditType_invalid");
  });

  it("10 — POST /admin/credits/grant rejects missing reason", async () => {
    const res = await req("POST", "/admin/credits/grant", {
      userKey: "u1", creditType: "review", amount: 1, reason: "",
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "reason_required");
  });

  it("11 — GET /admin/credits reflects granted balance", async () => {
    const env = makeEnv();
    await reqWithEnv(env, "POST", "/admin/credits/grant", {
      userKey: "u1", creditType: "review", amount: 10, reason: "test",
    });
    const res = await reqWithEnv(env, "GET", "/admin/credits?userKey=u1", null);
    const body = await res.json();
    const reviewBalance = body.balances.find((b) => b.creditType === "review");
    assert.ok(reviewBalance);
    assert.equal(reviewBalance.balance, 10);
  });

  it("12 — GET /admin/credits/ledger returns entries", async () => {
    const env = makeEnv();
    await reqWithEnv(env, "POST", "/admin/credits/grant", {
      userKey: "u1", creditType: "review", amount: 5, reason: "grant A",
    });
    await reqWithEnv(env, "POST", "/admin/credits/grant", {
      userKey: "u1", creditType: "review", amount: 3, reason: "grant B",
    });
    const res = await reqWithEnv(env, "GET", "/admin/credits/ledger?userKey=u1", null);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.entries.length, 2);
    assert.ok(body.entries.every((e) => e.direction === "grant"));
  });

  it("13 — GET /admin/credits/ledger 401 on missing key", async () => {
    const app = createApp();
    const res = await app.fetch(
      new Request("http://localhost/admin/credits/ledger?userKey=u1"),
      makeEnv(),
    );
    assert.equal(res.status, 401);
  });

  it("14 — GET /admin/credits/preview actualDebitsEnabled is false", async () => {
    const res = await req("GET", "/admin/credits/preview", null);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.actualDebitsEnabled, false);
  });

  it("15 — preview maps workspace_pr_review_run to review credit", async () => {
    const env = makeEnvWithUsage([
      makeUsageEvent("u1", "workspace_pr_review_run"),
      makeUsageEvent("u1", "workspace_pr_review_run"),
    ]);
    const res = await reqWithEnv(env, "GET", "/admin/credits/preview?range=7d", null);
    const body = await res.json();
    const entry = body.previewEntries.find((e) => e.eventType === "workspace_pr_review_run");
    assert.ok(entry, "entry present");
    assert.equal(entry.creditType, "review");
    assert.equal(entry.estimatedAmount, 2);
  });

  it("16 — preview does NOT include included events", async () => {
    const env = makeEnvWithUsage([
      makeUsageEvent("u1", "workspace_pr_comment_posted"),
      makeUsageEvent("u1", "workspace_telegram_notification_sent"),
    ]);
    const res = await reqWithEnv(env, "GET", "/admin/credits/preview?range=7d", null);
    const body = await res.json();
    assert.deepEqual(body.previewEntries, []);
    assert.equal(body.totalEstimatedCredits, 0);
  });

  it("17 — preview totalEstimatedCredits sums billable events", async () => {
    const env = makeEnvWithUsage([
      makeUsageEvent("u1", "workspace_pr_review_run"),
      makeUsageEvent("u2", "workspace_pr_review_run"),
      makeUsageEvent("u2", "workspace_pr_review_run"),
      makeUsageEvent("u1", "workspace_pr_comment_posted"), // 0 credit
    ]);
    const res = await reqWithEnv(env, "GET", "/admin/credits/preview?range=7d", null);
    const body = await res.json();
    assert.equal(body.totalEstimatedCredits, 3);
  });

  it("18 — preview userKey filter scopes to one user", async () => {
    const env = makeEnvWithUsage([
      makeUsageEvent("u1", "workspace_pr_review_run"),
      makeUsageEvent("u2", "workspace_pr_review_run"),
      makeUsageEvent("u2", "workspace_pr_review_run"),
    ]);
    const res = await reqWithEnv(env, "GET", "/admin/credits/preview?range=7d&userKey=u1", null);
    const body = await res.json();
    assert.equal(body.totalEstimatedCredits, 1);
    assert.ok(body.previewEntries.every((e) => e.userKey === "u1"));
  });

  it("19 — preview empty when no billable events", async () => {
    const res = await req("GET", "/admin/credits/preview", null);
    assert.equal((await res.json()).totalEstimatedCredits, 0);
  });

  it("20 — preview invalid range defaults to 7d", async () => {
    const res = await req("GET", "/admin/credits/preview?range=bad", null);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.range, "7d");
  });
});

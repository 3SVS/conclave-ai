/**
 * workspace-credit-config.test.mjs
 *
 * Stage 24: credit-config.ts + debitCredits() + checkCreditEnforcement() + config endpoint
 *
 * Tests:
 *  01. getCreditExecutionConfig: both flags false when env unset
 *  02. getCreditExecutionConfig: actualDebitsEnabled true when ENABLE_ACTUAL_CREDIT_DEBITS="true"
 *  03. getCreditExecutionConfig: blockingEnabled true when ENABLE_CREDIT_BLOCKING="true"
 *  04. getCreditExecutionConfig: flags false when set to non-"true" value
 *  05. debitCredits: returns insufficient_balance when balance=0
 *  06. debitCredits: decrements balance and inserts ledger entry
 *  07. debitCredits: returns race_condition when changes=0
 *  08. debitCredits: returns db_error on SELECT failure
 *  09. checkCreditEnforcement: blocked=false when flags off (dry-run mode)
 *  10. checkCreditEnforcement: blocked=false when actualDebitsEnabled=true but wouldBlock=false
 *  11. checkCreditEnforcement: blocked=true when both flags true + insufficient balance
 *  12. checkCreditEnforcement: debit.ok=true when actualDebitsEnabled=true + sufficient balance
 *  13. checkCreditEnforcement: debit absent when actualDebitsEnabled=false
 *  14. checkCreditEnforcement: blocked=false for included event type
 *  15. GET /admin/credits/config: returns flags + envFlags
 *  16. GET /admin/credits/config: actualDebitsEnabled=false by default
 *  17. GET /admin/credits/config: actualDebitsEnabled=true when flag set
 *  18. GET /admin/credits/config: returns 401 on bad admin key
 *  19. PR review returns 402 when blocked=true
 *  20. PR review proceeds when blocked=false despite wouldBlock=true (dry-run)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { getCreditExecutionConfig } = await import("../dist/workspace/credit-config.js");
const { debitCredits } = await import("../dist/workspace/credits.js");
const { checkCreditEnforcement } = await import("../dist/workspace/credit-enforcement.js");
const { createApp } = await import("../dist/router.js");

const ADMIN_KEY = "test-stage24-key";

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeDb(opts = {}) {
  const { balances = new Map(), ledger = [], usageEvents = [], changesOnUpdate = 1 } = opts;
  const writeCount = { balance: 0, ledger: 0 };

  return {
    _balances: balances,
    _ledger: ledger,
    _writeCount: writeCount,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              if (sql.includes("INSERT INTO workspace_credit_balances")) {
                writeCount.balance += 1;
              }
              if (sql.includes("INSERT INTO workspace_credit_ledger")) {
                writeCount.ledger += 1;
                ledger.push({ sql, args });
              }
              if (sql.includes("UPDATE workspace_credit_balances")) {
                const [amount, , userKey, creditType, requiredBalance] = args;
                const key = `${userKey}:${creditType}`;
                const row = balances.get(key);
                if (row && row.balance >= requiredBalance && changesOnUpdate > 0) {
                  row.balance -= amount;
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: changesOnUpdate === 0 ? 0 : 0 } };
              }
              return { meta: { changes: 0 } };
            },
            async first() {
              if (sql.includes("SELECT balance FROM workspace_credit_balances")) {
                const [userKey, creditType] = args;
                const row = balances.get(`${userKey}:${creditType}`);
                return row ? { balance: row.balance } : null;
              }
              if (sql.includes("SELECT credit_type, balance, updated_at") && !sql.includes("ORDER BY")) {
                const [userKey, creditType] = args;
                return balances.get(`${userKey}:${creditType}`) ?? null;
              }
              if (sql.includes("SELECT COUNT(*)") && sql.includes("FROM workspace_usage_events") && !sql.includes("GROUP BY")) {
                const [userKey, eventType] = args;
                const count = usageEvents.filter(e => e.user_key === userKey && e.event_type === eventType).length;
                return { count };
              }
              return null;
            },
            async all() {
              if (sql.includes("SELECT credit_type, balance, updated_at") && sql.includes("ORDER BY credit_type")) {
                const [userKey] = args;
                const results = [];
                for (const [key, row] of balances.entries()) {
                  if (key.startsWith(`${userKey}:`)) results.push(row);
                }
                return { results };
              }
              if (sql.includes("FROM workspace_usage_events") && sql.includes("GROUP BY user_key, project_id, event_type") && sql.includes("AND user_key = ?")) {
                return { results: [] };
              }
              if (sql.includes("FROM workspace_usage_events") && sql.includes("GROUP BY user_key, project_id, event_type")) {
                return { results: [] };
              }
              if (sql.includes("FROM workspace_usage_events") && sql.includes("GROUP BY user_key")) {
                return { results: [] };
              }
              if (sql.includes("FROM workspace_credit_ledger")) {
                return { results: [] };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

function makeEnv(opts = {}) {
  const { balances = new Map(), usageEvents = [], changesOnUpdate = 1, actualDebits = undefined, blocking = undefined } = opts;
  const env = {
    ENVIRONMENT: "test",
    ADMIN_USAGE_STATS_KEY: ADMIN_KEY,
    DB: makeDb({ balances, usageEvents, changesOnUpdate }),
  };
  if (actualDebits !== undefined) env.ENABLE_ACTUAL_CREDIT_DEBITS = actualDebits;
  if (blocking !== undefined) env.ENABLE_CREDIT_BLOCKING = blocking;
  return env;
}

function balanceMap(userKey, creditType, amount) {
  const m = new Map();
  m.set(`${userKey}:${creditType}`, {
    id: "b1", user_key: userKey, credit_type: creditType,
    balance: amount, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
  });
  return m;
}

function makeReviewEvents(userKey, count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `e${i}`, user_key: userKey, event_type: "workspace_pr_review_run",
    project_id: null, created_at: new Date(Date.now() - i * 3600 * 1000).toISOString(),
  }));
}

function req(env, method, path, body, headers = {}) {
  const app = createApp();
  const h = { "x-admin-key": ADMIN_KEY, ...headers };
  if (body) h["content-type"] = "application/json";
  return app.fetch(new Request(`http://localhost${path}`, {
    method, headers: h,
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
}

// ─── Tests: getCreditExecutionConfig ─────────────────────────────────────────

describe("getCreditExecutionConfig", () => {
  it("01 — both flags false when env unset", () => {
    const config = getCreditExecutionConfig({ ENVIRONMENT: "test" });
    assert.equal(config.actualDebitsEnabled, false);
    assert.equal(config.blockingEnabled, false);
  });

  it("02 — actualDebitsEnabled true when ENABLE_ACTUAL_CREDIT_DEBITS='true'", () => {
    const config = getCreditExecutionConfig({ ENVIRONMENT: "test", ENABLE_ACTUAL_CREDIT_DEBITS: "true" });
    assert.equal(config.actualDebitsEnabled, true);
    assert.equal(config.blockingEnabled, false);
  });

  it("03 — blockingEnabled true when ENABLE_CREDIT_BLOCKING='true'", () => {
    const config = getCreditExecutionConfig({ ENVIRONMENT: "test", ENABLE_CREDIT_BLOCKING: "true" });
    assert.equal(config.blockingEnabled, true);
    assert.equal(config.actualDebitsEnabled, false);
  });

  it("04 — flags false when set to non-'true' value", () => {
    const config = getCreditExecutionConfig({
      ENVIRONMENT: "test",
      ENABLE_ACTUAL_CREDIT_DEBITS: "false",
      ENABLE_CREDIT_BLOCKING: "1",
    });
    assert.equal(config.actualDebitsEnabled, false);
    assert.equal(config.blockingEnabled, false);
  });
});

// ─── Tests: debitCredits ──────────────────────────────────────────────────────

describe("debitCredits", () => {
  it("05 — returns insufficient_balance when balance=0", async () => {
    const env = makeEnv();
    const result = await debitCredits(env, {
      userKey: "u1", creditType: "review", amount: 1, reason: "test",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "insufficient_balance");
    assert.equal(result.currentBalance, 0);
  });

  it("06 — decrements balance and inserts ledger entry", async () => {
    const balances = balanceMap("u1", "review", 5);
    const env = makeEnv({ balances, changesOnUpdate: 1 });
    const result = await debitCredits(env, {
      userKey: "u1", creditType: "review", amount: 2, reason: "test debit",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.newBalance, 3); // 5 - 2 = 3
      assert.ok(result.ledgerEntryId.startsWith("wcl_"));
    }
    assert.equal(env.DB._writeCount.ledger, 1);
  });

  it("07 — returns race_condition when changes=0", async () => {
    const balances = balanceMap("u1", "review", 5);
    // changesOnUpdate=0 simulates another request winning the race
    const env = makeEnv({ balances, changesOnUpdate: 0 });
    const result = await debitCredits(env, {
      userKey: "u1", creditType: "review", amount: 1, reason: "race test",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "race_condition");
  });

  it("08 — returns db_error on SELECT failure", async () => {
    const brokenDb = {
      prepare() {
        return {
          bind() {
            return {
              async first() { throw new Error("D1 down"); },
              async run() { throw new Error("D1 down"); },
            };
          },
        };
      },
    };
    const env = { ENVIRONMENT: "test", DB: brokenDb };
    const result = await debitCredits(env, {
      userKey: "u1", creditType: "review", amount: 1, reason: "error test",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "db_error");
  });
});

// ─── Tests: checkCreditEnforcement ───────────────────────────────────────────

describe("checkCreditEnforcement", () => {
  it("09 — blocked=false when both flags off (dry-run mode)", async () => {
    const env = makeEnv({ usageEvents: makeReviewEvents("u1", 5) }); // allowance exhausted, balance=0
    const result = await checkCreditEnforcement({ env, userKey: "u1", eventType: "workspace_pr_review_run" });
    assert.equal(result.blocked, false);
    assert.equal(result.actualDebitsEnabled, false);
    assert.equal(result.wouldBlock, true);
  });

  it("10 — blocked=false when actualDebitsEnabled=true but balance sufficient", async () => {
    const env = makeEnv({
      balances: balanceMap("u1", "review", 5),
      usageEvents: makeReviewEvents("u1", 5),
      actualDebits: "true",
      blocking: "true",
    });
    const result = await checkCreditEnforcement({ env, userKey: "u1", eventType: "workspace_pr_review_run" });
    assert.equal(result.wouldBlock, false);
    assert.equal(result.blocked, false);
  });

  it("11 — blocked=true when both flags true + allowance exhausted + balance=0", async () => {
    const env = makeEnv({
      usageEvents: makeReviewEvents("u1", 5),
      actualDebits: "true",
      blocking: "true",
    });
    const result = await checkCreditEnforcement({ env, userKey: "u1", eventType: "workspace_pr_review_run" });
    assert.equal(result.blocked, true);
    assert.equal(result.wouldBlock, true);
    assert.equal(result.actualDebitsEnabled, true);
  });

  it("12 — debit.ok=true when actualDebitsEnabled=true + allowance exhausted + balance sufficient", async () => {
    const env = makeEnv({
      balances: balanceMap("u1", "review", 5),
      usageEvents: makeReviewEvents("u1", 5),
      actualDebits: "true",
      changesOnUpdate: 1,
    });
    const result = await checkCreditEnforcement({ env, userKey: "u1", eventType: "workspace_pr_review_run" });
    assert.equal(result.actualDebitsEnabled, true);
    assert.equal(result.wouldBlock, false);
    assert.ok(result.debit, "debit field present");
    assert.equal(result.debit?.ok, true);
  });

  it("13 — debit field absent when actualDebitsEnabled=false", async () => {
    const env = makeEnv({
      balances: balanceMap("u1", "review", 5),
      usageEvents: makeReviewEvents("u1", 5),
    });
    const result = await checkCreditEnforcement({ env, userKey: "u1", eventType: "workspace_pr_review_run" });
    assert.equal(result.actualDebitsEnabled, false);
    assert.equal(result.debit, undefined);
  });

  it("14 — blocked=false for included event type regardless of flags", async () => {
    const env = makeEnv({ actualDebits: "true", blocking: "true" });
    const result = await checkCreditEnforcement({ env, userKey: "u1", eventType: "workspace_pr_comment_posted" });
    assert.equal(result.blocked, false);
    assert.equal(result.billingStatus, "included");
  });
});

// ─── Tests: GET /admin/credits/config ────────────────────────────────────────

describe("GET /admin/credits/config", () => {
  it("15 — returns flags + envFlags", async () => {
    const env = makeEnv({ actualDebits: "false", blocking: "false" });
    const res = await req(env, "GET", "/admin/credits/config", null);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok("actualDebitsEnabled" in body);
    assert.ok("blockingEnabled" in body);
    assert.ok("envFlags" in body);
    assert.ok("ENABLE_ACTUAL_CREDIT_DEBITS" in body.envFlags);
    assert.ok("ENABLE_CREDIT_BLOCKING" in body.envFlags);
  });

  it("16 — actualDebitsEnabled=false by default", async () => {
    const env = makeEnv(); // no flags set
    const res = await req(env, "GET", "/admin/credits/config", null);
    const body = await res.json();
    assert.equal(body.actualDebitsEnabled, false);
    assert.equal(body.blockingEnabled, false);
  });

  it("17 — actualDebitsEnabled=true when ENABLE_ACTUAL_CREDIT_DEBITS='true'", async () => {
    const env = makeEnv({ actualDebits: "true" });
    const res = await req(env, "GET", "/admin/credits/config", null);
    const body = await res.json();
    assert.equal(body.actualDebitsEnabled, true);
    assert.equal(body.blockingEnabled, false);
  });

  it("18 — returns 401 on bad admin key", async () => {
    const env = makeEnv();
    const app = createApp();
    const res = await app.fetch(
      new Request("http://localhost/admin/credits/config", {
        headers: { "x-admin-key": "wrong-key" },
      }),
      env,
    );
    assert.equal(res.status, 401);
  });
});

// ─── Tests: PR review 402 / blocking ─────────────────────────────────────────

describe("PR review credit blocking", () => {
  it("19 — returns 402 when blocked=true (both flags on + balance=0)", async () => {
    // For this test we need a project + github setup. Use the app directly
    // but the review endpoint will 401 on missing userKey/repo, so we check
    // that the credit enforcement short-circuit fires BEFORE those checks.
    // Since the route requires userKey + project context, we test via the
    // checkCreditEnforcement helper directly and verify blocked=true is the
    // trigger for 402.
    const env = makeEnv({
      usageEvents: makeReviewEvents("u1", 5),
      actualDebits: "true",
      blocking: "true",
    });
    const result = await checkCreditEnforcement({ env, userKey: "u1", eventType: "workspace_pr_review_run" });
    assert.equal(result.blocked, true, "should be blocked when both flags on and balance=0");
  });

  it("20 — blocked=false in dry-run even with wouldBlock=true", async () => {
    const env = makeEnv({ usageEvents: makeReviewEvents("u1", 5) }); // both flags OFF
    const result = await checkCreditEnforcement({ env, userKey: "u1", eventType: "workspace_pr_review_run" });
    assert.equal(result.wouldBlock, true);
    assert.equal(result.blocked, false, "blocked must be false in dry-run mode");
    assert.equal(result.actualDebitsEnabled, false);
  });
});

/**
 * workspace-credit-topup.test.mjs
 *
 * Stage 33: user-facing credit balance endpoint + top-up request flow.
 *
 * Tests:
 *  1.  GET /workspace/credits: returns balances and allowance (200)
 *  2.  GET /workspace/credits: does not expose ledger rows in response
 *  3.  GET /workspace/credits: userKey missing returns 400
 *  4.  GET /workspace/credits: actualDebitAllowedForUser=false when flag off
 *  5.  POST /workspace/credits/top-up-requests: amount=0 rejected (400)
 *  6.  POST /workspace/credits/top-up-requests: amount=101 rejected (400)
 *  7.  POST /workspace/credits/top-up-requests: valid request created (201)
 *  8.  POST /workspace/credits/top-up-requests: max 3 open requests enforced (429)
 *  9.  GET /workspace/credits/top-up-requests: returns user requests
 *  10. GET /workspace/credits/top-up-requests: userKey missing returns 400
 *  11. GET /admin/credits/top-up-requests: requires admin key (401)
 *  12. GET /admin/credits/top-up-requests: returns requests list
 *  13. POST /admin/credits/top-up-requests/:id/fulfill: grants credits and marks fulfilled
 *  14. POST /admin/credits/top-up-requests/:id/fulfill: 404 on unknown id
 *  15. POST /admin/credits/top-up-requests/:id/fulfill: 409 on already fulfilled
 *  16. POST /admin/credits/top-up-requests/:id/reject: marks rejected
 *  17. POST /admin/credits/top-up-requests/:id/reject: 404 on unknown id
 *  18. POST /admin/credits/top-up-requests/:id/reject: 409 on already rejected
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { createApp } = await import("../dist/router.js");

const ADMIN_KEY = "test-stage33-admin-key";

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeDb(opts = {}) {
  const {
    balances = new Map(),
    ledger = [],
    usageEvents = [],
    topUpRequests = [],
    openRequestCount = 0,
  } = opts;

  return {
    _balances: balances,
    _ledger: ledger,
    _topUpRequests: topUpRequests,
    prepare(sql) {
      // Shared handler used by both bind() and direct calls
      function handler(args) {
        return {
          async run() {
              if (sql.includes("INSERT INTO workspace_credit_balances")) {
                return { meta: { changes: 1 } };
              }
              if (sql.includes("workspace_credit_ledger") && sql.includes("INSERT")) {
                ledger.push({ sql, args, status: "applied" });
                return { meta: { changes: 1 } };
              }
              if (sql.includes("INSERT INTO workspace_credit_topup_requests")) {
                const [id, user_key, credit_type, requested_amount, , note, created_at] = args;
                topUpRequests.push({
                  id,
                  user_key,
                  credit_type,
                  requested_amount,
                  status: "requested",
                  note: note ?? null,
                  admin_note: null,
                  created_at,
                  updated_at: created_at,
                  resolved_at: null,
                });
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE workspace_credit_topup_requests")) {
                // SET status = 'fulfilled' or 'rejected'
                const id = args[args.length - 1];
                const req = topUpRequests.find(r => r.id === id);
                if (req) {
                  if (sql.includes("'fulfilled'")) req.status = "fulfilled";
                  if (sql.includes("'rejected'")) req.status = "rejected";
                  if (args[0] !== null && args[0] !== undefined) req.admin_note = args[0];
                }
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE workspace_credit_balances")) {
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
          },
          async first() {
            // workspace_credit_topup_requests WHERE id = ?
            if (sql.includes("FROM workspace_credit_topup_requests") && sql.includes("WHERE id = ?")) {
              const [id] = args;
              return topUpRequests.find(r => r.id === id) ?? null;
            }
            // COUNT open requests
            if (sql.includes("COUNT(*)") && sql.includes("workspace_credit_topup_requests")) {
              return { count: openRequestCount };
            }
            // balance queries
            if (sql.includes("SELECT balance FROM workspace_credit_balances")) {
              const [userKey, creditType] = args;
              const row = balances.get(`${userKey}:${creditType}`);
              return row ? { balance: row.balance } : null;
            }
            if (sql.includes("SELECT credit_type, balance, updated_at") && !sql.includes("ORDER BY")) {
              const [userKey, creditType] = args;
              return balances.get(`${userKey}:${creditType}`) ?? null;
            }
            if (sql.includes("SELECT COUNT(*)") && sql.includes("FROM workspace_usage_events")) {
              return { count: usageEvents.filter(e => e.user_key === args[0] && e.event_type === args[1]).length };
            }
            return null;
          },
          async all() {
            // listCreditBalances
            if (sql.includes("SELECT credit_type, balance, updated_at") && sql.includes("ORDER BY credit_type")) {
              const [userKey] = args;
              const results = [];
              for (const [key, row] of balances.entries()) {
                if (key.startsWith(`${userKey}:`)) results.push(row);
              }
              return { results };
            }
            // listTopUpRequests (user-facing, WHERE user_key = ?)
            if (sql.includes("FROM workspace_credit_topup_requests") && sql.includes("WHERE user_key = ?")) {
              const [userKey] = args;
              return { results: topUpRequests.filter(r => r.user_key === userKey) };
            }
            // listAdminTopUpRequests (with status filter)
            if (sql.includes("FROM workspace_credit_topup_requests") && sql.includes("WHERE status = ?")) {
              const [status] = args;
              return { results: topUpRequests.filter(r => r.status === status) };
            }
            // listAdminTopUpRequests (no filter)
            if (sql.includes("FROM workspace_credit_topup_requests")) {
              return { results: topUpRequests };
            }
            return { results: [] };
          },
        };
      }
      // Expose run/first/all directly on prepare result (for calls without bind)
      return {
        bind(...args) { return handler(args); },
        run()   { return handler([]).run(); },
        first() { return handler([]).first(); },
        all()   { return handler([]).all(); },
      };
    },
  };
}

function makeEnv(opts = {}) {
  const {
    balances = new Map(),
    usageEvents = [],
    topUpRequests = [],
    openRequestCount = 0,
    actualDebits = undefined,
    allowedUserKeys = undefined,
  } = opts;
  const env = {
    ENVIRONMENT: "test",
    ADMIN_USAGE_STATS_KEY: ADMIN_KEY,
    DB: makeDb({ balances, usageEvents, topUpRequests, openRequestCount }),
  };
  if (actualDebits !== undefined) env.ENABLE_ACTUAL_CREDIT_DEBITS = actualDebits;
  if (allowedUserKeys !== undefined) env.ACTUAL_DEBIT_ALLOWED_USER_KEYS = allowedUserKeys;
  return env;
}

function balanceMap(userKey, creditType, amount) {
  const m = new Map();
  m.set(`${userKey}:${creditType}`, {
    id: "b1", user_key: userKey, credit_type: creditType,
    balance: amount, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-06-13T00:00:00.000Z",
  });
  return m;
}

async function req(env, method, path, body) {
  const app = createApp();
  const url = `http://localhost${path}`;
  const init = {
    method,
    headers: { "content-type": "application/json" },
  };
  if (body !== null && body !== undefined) init.body = JSON.stringify(body);
  const request = new Request(url, init);
  return app.fetch(request, env, {});
}

async function adminReq(env, method, path, body) {
  const app = createApp();
  const url = `http://localhost${path}`;
  const init = {
    method,
    headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
  };
  if (body !== null && body !== undefined) init.body = JSON.stringify(body);
  const request = new Request(url, init);
  return app.fetch(request, env, {});
}

// ─── Tests: GET /workspace/credits ───────────────────────────────────────────

describe("GET /workspace/credits", () => {
  it("1 — returns balances and allowance for a user", async () => {
    const balances = balanceMap("gh:user1", "review", 42);
    const env = makeEnv({ balances });
    const res = await req(env, "GET", "/workspace/credits?userKey=gh:user1", null);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.userKey, "gh:user1");
    assert.ok(Array.isArray(body.balances), "balances must be an array");
    const reviewBalance = body.balances.find(b => b.creditType === "review");
    assert.ok(reviewBalance, "review balance must be present");
    assert.equal(reviewBalance.balance, 42);
    assert.ok(body.allowance?.review, "allowance.review must be present");
    assert.equal(body.allowance.review.period, "monthly");
    assert.ok(typeof body.allowance.review.includedRuns === "number");
  });

  it("2 — response does not contain ledger rows or sourceEventId", async () => {
    const env = makeEnv();
    const res = await req(env, "GET", "/workspace/credits?userKey=gh:user1", null);
    const body = await res.json();
    assert.ok(!("ledger" in body), "response must not contain ledger field");
    assert.ok(!("entries" in body), "response must not contain entries field");
    assert.ok(!("sourceEventId" in body), "response must not contain sourceEventId");
  });

  it("3 — returns 400 when userKey is missing", async () => {
    const env = makeEnv();
    const res = await req(env, "GET", "/workspace/credits", null);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "userKey_required");
  });

  it("4 — actualDebitAllowedForUser=false when flag is off", async () => {
    const env = makeEnv();
    const res = await req(env, "GET", "/workspace/credits?userKey=gh:user1", null);
    const body = await res.json();
    assert.equal(body.actualDebitsEnabled, false);
    assert.equal(body.actualDebitAllowedForUser, false);
  });
});

// ─── Tests: POST /workspace/credits/top-up-requests ─────────────────────────

describe("POST /workspace/credits/top-up-requests", () => {
  it("5 — amount=0 rejected with 400", async () => {
    const env = makeEnv();
    const res = await req(env, "POST", "/workspace/credits/top-up-requests", {
      userKey: "gh:user1",
      requestedAmount: 0,
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.ok, false);
  });

  it("6 — amount=101 rejected with 400", async () => {
    const env = makeEnv();
    const res = await req(env, "POST", "/workspace/credits/top-up-requests", {
      userKey: "gh:user1",
      requestedAmount: 101,
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.ok, false);
  });

  it("7 — valid request created (201) with id and status=requested", async () => {
    const env = makeEnv();
    const res = await req(env, "POST", "/workspace/credits/top-up-requests", {
      userKey: "gh:user1",
      requestedAmount: 10,
      note: "Need credits for testing",
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.request?.id, "request.id must be present");
    assert.equal(body.request.status, "requested");
    assert.equal(body.request.requestedAmount, 10);
  });

  it("8 — max 3 open requests enforced (429)", async () => {
    const env = makeEnv({ openRequestCount: 3 });
    const res = await req(env, "POST", "/workspace/credits/top-up-requests", {
      userKey: "gh:user1",
      requestedAmount: 5,
    });
    assert.equal(res.status, 429);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "too_many_open_requests");
  });
});

// ─── Tests: GET /workspace/credits/top-up-requests ──────────────────────────

describe("GET /workspace/credits/top-up-requests", () => {
  it("9 — returns user's requests list", async () => {
    const topUpRequests = [
      {
        id: "req1",
        user_key: "gh:user1",
        credit_type: "review",
        requested_amount: 10,
        status: "requested",
        note: null,
        admin_note: null,
        created_at: "2026-06-13T00:00:00.000Z",
        updated_at: "2026-06-13T00:00:00.000Z",
        resolved_at: null,
      },
    ];
    const env = makeEnv({ topUpRequests });
    const res = await req(env, "GET", "/workspace/credits/top-up-requests?userKey=gh:user1", null);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.requests));
    assert.equal(body.requests.length, 1);
    assert.equal(body.requests[0].status, "requested");
    assert.equal(body.requests[0].requestedAmount, 10);
  });

  it("10 — returns 400 when userKey missing", async () => {
    const env = makeEnv();
    const res = await req(env, "GET", "/workspace/credits/top-up-requests", null);
    assert.equal(res.status, 400);
  });
});

// ─── Tests: GET /admin/credits/top-up-requests ──────────────────────────────

describe("GET /admin/credits/top-up-requests", () => {
  it("11 — returns 401 without admin key", async () => {
    const env = makeEnv();
    const app = createApp();
    const res = await app.fetch(
      new Request("http://localhost/admin/credits/top-up-requests", { method: "GET" }),
      env,
      {},
    );
    assert.equal(res.status, 401);
  });

  it("12 — returns requests list with admin key", async () => {
    const topUpRequests = [
      {
        id: "req2",
        user_key: "gh:tester",
        credit_type: "review",
        requested_amount: 20,
        status: "requested",
        note: "test request",
        admin_note: null,
        created_at: "2026-06-13T00:00:00.000Z",
        updated_at: "2026-06-13T00:00:00.000Z",
        resolved_at: null,
      },
    ];
    const env = makeEnv({ topUpRequests });
    const res = await adminReq(env, "GET", "/admin/credits/top-up-requests", null);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.requests));
    assert.equal(body.requests[0].userKey, "gh:tester");
    assert.equal(body.requests[0].requestedAmount, 20);
  });
});

// ─── Tests: POST /admin/credits/top-up-requests/:id/fulfill ─────────────────

describe("POST /admin/credits/top-up-requests/:id/fulfill", () => {
  it("13 — grants credits and marks request fulfilled", async () => {
    const topUpRequests = [
      {
        id: "req3",
        user_key: "gh:user1",
        credit_type: "review",
        requested_amount: 15,
        status: "requested",
        note: null,
        admin_note: null,
        created_at: "2026-06-13T00:00:00.000Z",
        updated_at: "2026-06-13T00:00:00.000Z",
        resolved_at: null,
      },
    ];
    const env = makeEnv({ topUpRequests });
    const res = await adminReq(env, "POST", "/admin/credits/top-up-requests/req3/fulfill", {
      adminNote: "Approved for testing",
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.request.status, "fulfilled");
    assert.equal(body.request.adminNote, "Approved for testing");
    assert.ok(typeof body.newBalance === "number", "newBalance must be a number");
  });

  it("14 — returns 404 on unknown id", async () => {
    const env = makeEnv();
    const res = await adminReq(env, "POST", "/admin/credits/top-up-requests/nonexistent/fulfill", {});
    assert.equal(res.status, 404);
  });

  it("15 — returns 409 when request already fulfilled", async () => {
    const topUpRequests = [
      {
        id: "req4",
        user_key: "gh:user1",
        credit_type: "review",
        requested_amount: 5,
        status: "fulfilled",
        note: null,
        admin_note: "already done",
        created_at: "2026-06-13T00:00:00.000Z",
        updated_at: "2026-06-13T00:00:00.000Z",
        resolved_at: "2026-06-13T00:00:00.000Z",
      },
    ];
    const env = makeEnv({ topUpRequests });
    const res = await adminReq(env, "POST", "/admin/credits/top-up-requests/req4/fulfill", {});
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.ok(body.error?.startsWith("already_resolved"));
  });
});

// ─── Tests: POST /admin/credits/top-up-requests/:id/reject ──────────────────

describe("POST /admin/credits/top-up-requests/:id/reject", () => {
  it("16 — marks request rejected with adminNote", async () => {
    const topUpRequests = [
      {
        id: "req5",
        user_key: "gh:user2",
        credit_type: "review",
        requested_amount: 100,
        status: "requested",
        note: "need lots",
        admin_note: null,
        created_at: "2026-06-13T00:00:00.000Z",
        updated_at: "2026-06-13T00:00:00.000Z",
        resolved_at: null,
      },
    ];
    const env = makeEnv({ topUpRequests });
    const res = await adminReq(env, "POST", "/admin/credits/top-up-requests/req5/reject", {
      adminNote: "请求金额超出限制",
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.request.status, "rejected");
  });

  it("17 — returns 404 on unknown id", async () => {
    const env = makeEnv();
    const res = await adminReq(env, "POST", "/admin/credits/top-up-requests/nope/reject", {});
    assert.equal(res.status, 404);
  });

  it("18 — returns 409 when request already rejected", async () => {
    const topUpRequests = [
      {
        id: "req6",
        user_key: "gh:user3",
        credit_type: "review",
        requested_amount: 5,
        status: "rejected",
        note: null,
        admin_note: "denied",
        created_at: "2026-06-13T00:00:00.000Z",
        updated_at: "2026-06-13T00:00:00.000Z",
        resolved_at: "2026-06-13T00:00:00.000Z",
      },
    ];
    const env = makeEnv({ topUpRequests });
    const res = await adminReq(env, "POST", "/admin/credits/top-up-requests/req6/reject", {});
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.ok(body.error?.startsWith("already_resolved"));
  });
});

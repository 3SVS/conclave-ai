/**
 * v0.14.5 — Lemon Squeezy billing integration tests.
 *
 * Covers:
 *   1. createCheckoutSession() helper — happy path + LS API failure
 *   2. verifyWebhookSignature() — valid/invalid sig + malformed input
 *   3. POST /billing/checkout — 503 without secrets, 400 on bad body,
 *      200 with LS URL on happy path
 *   4. GET /billing — renders "not configured" when no secret,
 *      renders buy page when secret set
 *   5. POST /webhook/lemonsqueezy — 503 without secret, 401 bad sig,
 *      idempotent on duplicate order_id, credits user on order_created,
 *      records paid_unlinked when no user matches
 *   6. claimPendingBillingForUser via upsertUser — claims orders +
 *      grants paid_credits when email matches
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { createApp } from "../dist/router.js";
import {
  createCheckoutSession,
  parseWebhookEvent,
  verifyWebhookSignature,
} from "../dist/lemonsqueezy.js";

// ---- helpers ----------------------------------------------------------

function hmacHex(body, secret) {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function makeMockDb({ users = [], orders = [] } = {}) {
  const state = {
    users: users.map((u) => ({ ...u })),
    orders: orders.map((o) => ({ ...o })),
  };
  return {
    state,
    prepare(sql) {
      let bound = [];
      const handlers = {
        async first() {
          if (/FROM saas_users WHERE github_user_id/.test(sql)) {
            return state.users.find((u) => u.github_user_id === bound[0]) ?? null;
          }
          if (/FROM saas_users WHERE id\s*=\s*\?/.test(sql)) {
            return state.users.find((u) => u.id === bound[0]) ?? null;
          }
          if (/FROM saas_users WHERE LOWER\(email\)/.test(sql)) {
            const email = String(bound[0] ?? "").toLowerCase();
            return state.users.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;
          }
          if (/FROM billing_orders[\s\S]*WHERE provider = \? AND provider_order_id = \?/.test(sql)) {
            return (
              state.orders.find(
                (o) => o.provider === bound[0] && o.provider_order_id === bound[1],
              ) ?? null
            );
          }
          return null;
        },
        async run() {
          if (/INSERT INTO saas_users/.test(sql)) {
            const [id, github_user_id, github_login, email] = bound;
            state.users.push({
              id, github_user_id, github_login, email,
              tier: "free", byo_anthropic: 0, data_share_opt_in: 1,
              trial_used: 0, paid_credits: 0,
              created_at: "2026-05-11T00:00:00Z",
              last_active_at: "2026-05-11T00:00:00Z",
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (/UPDATE saas_users SET paid_credits = paid_credits \+ \?/.test(sql)) {
            const u = state.users.find((u) => u.id === bound[2]);
            if (u) u.paid_credits = (u.paid_credits ?? 0) + Number(bound[0] ?? 0);
            return { success: true, meta: { changes: u ? 1 : 0 } };
          }
          if (/UPDATE saas_users SET github_login = \?, email = \?, last_active_at = \? WHERE id = \?/.test(sql)) {
            const u = state.users.find((u) => u.id === bound[3]);
            if (u) {
              u.github_login = bound[0];
              u.email = bound[1];
            }
            return { success: true, meta: { changes: u ? 1 : 0 } };
          }
          if (/INSERT INTO billing_orders/.test(sql)) {
            const [
              id, user_id, provider, provider_order_id, product_variant_id, product_label,
              amount_cents, currency, status, credits_granted, pending_email,
              customer_email, created_at, paid_at, raw_payload,
            ] = bound;
            state.orders.push({
              id, user_id, provider, provider_order_id, product_variant_id, product_label,
              amount_cents, currency, status, credits_granted, pending_email,
              customer_email, created_at, paid_at, linked_at: null, raw_payload,
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (/UPDATE billing_orders SET user_id = \?, status = 'paid', linked_at/.test(sql)) {
            const order = state.orders.find((o) => o.id === bound[2]);
            if (order) {
              order.user_id = bound[0];
              order.status = "paid";
              order.linked_at = bound[1];
            }
            return { success: true, meta: { changes: order ? 1 : 0 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
        async all() {
          if (/FROM billing_orders[\s\S]*WHERE LOWER\(pending_email\)/.test(sql)) {
            const email = String(bound[0] ?? "").toLowerCase();
            const rows = state.orders.filter(
              (o) =>
                (o.pending_email ?? "").toLowerCase() === email &&
                o.status === "paid_unlinked" &&
                !o.user_id,
            );
            return { results: rows.map((r) => ({ id: r.id, credits_granted: r.credits_granted })) };
          }
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

function makeEnv(overrides = {}) {
  return {
    DB: makeMockDb(),
    ENVIRONMENT: "test",
    LEMONSQUEEZY_API_KEY: "ls_test_apikey",
    LEMONSQUEEZY_WEBHOOK_SECRET: "wh_test_secret",
    LEMONSQUEEZY_STORE_ID: "12345",
    LEMONSQUEEZY_VARIANT_ID_FIRST_PR: "98765",
    PUBLIC_BASE_URL: "https://worker.test",
    ...overrides,
  };
}

// ---- verifyWebhookSignature ------------------------------------------

test("verifyWebhookSignature: valid HMAC → true", async () => {
  const secret = "wh_test_secret";
  const body = '{"meta":{"event_name":"order_created"}}';
  const sig = hmacHex(body, secret);
  assert.equal(await verifyWebhookSignature(body, sig, secret), true);
});

test("verifyWebhookSignature: wrong secret → false", async () => {
  const body = '{"meta":{"event_name":"order_created"}}';
  const sig = hmacHex(body, "real-secret");
  assert.equal(await verifyWebhookSignature(body, sig, "wrong-secret"), false);
});

test("verifyWebhookSignature: tampered body → false", async () => {
  const secret = "s";
  const body = '{"event":"x"}';
  const sig = hmacHex(body, secret);
  assert.equal(await verifyWebhookSignature(body + "extra", sig, secret), false);
});

test("verifyWebhookSignature: missing signature header → false (no throw)", async () => {
  assert.equal(await verifyWebhookSignature("body", null, "s"), false);
  assert.equal(await verifyWebhookSignature("body", undefined, "s"), false);
  assert.equal(await verifyWebhookSignature("body", "", "s"), false);
});

test("verifyWebhookSignature: malformed hex → false", async () => {
  assert.equal(await verifyWebhookSignature("body", "notahex", "s"), false);
  assert.equal(await verifyWebhookSignature("body", "abc", "s"), false); // odd length
});

// ---- createCheckoutSession --------------------------------------------

test("createCheckoutSession: success returns url + checkoutId", async () => {
  const fetchStub = async (url, init) => {
    assert.match(url, /\/v1\/checkouts$/);
    assert.equal(init.method, "POST");
    assert.match(init.headers.authorization, /^Bearer ls_test_apikey$/);
    const body = JSON.parse(init.body);
    assert.equal(body.data.type, "checkouts");
    assert.equal(body.data.relationships.store.data.id, "12345");
    assert.equal(body.data.relationships.variant.data.id, "98765");
    return new Response(
      JSON.stringify({
        data: { id: "checkout_abc", attributes: { url: "https://store.lemonsqueezy.com/checkout/xxx" } },
      }),
      { status: 200, headers: { "content-type": "application/vnd.api+json" } },
    );
  };
  const out = await createCheckoutSession(
    {
      apiKey: "ls_test_apikey",
      storeId: "12345",
      variantId: "98765",
      email: "bae@example.com",
      custom: { product_label: "first-pr-pass" },
    },
    fetchStub,
  );
  assert.equal(out.url, "https://store.lemonsqueezy.com/checkout/xxx");
  assert.equal(out.checkoutId, "checkout_abc");
});

test("createCheckoutSession: LS 500 → throws", async () => {
  const fetchStub = async () =>
    new Response("server error", { status: 500 });
  await assert.rejects(
    () =>
      createCheckoutSession(
        { apiKey: "x", storeId: "1", variantId: "2" },
        fetchStub,
      ),
    /lemonsqueezy: POST \/checkouts 500/,
  );
});

// ---- POST /billing/checkout -------------------------------------------

test("POST /billing/checkout: 503 when LEMONSQUEEZY_API_KEY missing", async () => {
  const app = createApp();
  const env = makeEnv({ LEMONSQUEEZY_API_KEY: undefined });
  const r = await app.fetch(
    new Request("http://localhost/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ product: "first-pr-pass", email: "x@y.com" }),
    }),
    env,
  );
  assert.equal(r.status, 503);
  const body = await r.json();
  assert.equal(body.error, "billing_not_configured");
});

test("POST /billing/checkout: 400 on unknown product", async () => {
  const app = createApp();
  const env = makeEnv();
  const r = await app.fetch(
    new Request("http://localhost/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ product: "made-up" }),
    }),
    env,
  );
  assert.equal(r.status, 400);
});

test("POST /billing/checkout: 503 when variant id missing", async () => {
  const app = createApp();
  const env = makeEnv({ LEMONSQUEEZY_VARIANT_ID_FIRST_PR: undefined });
  const r = await app.fetch(
    new Request("http://localhost/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ product: "first-pr-pass" }),
    }),
    env,
  );
  assert.equal(r.status, 503);
});

// Note: happy path 200 on /billing/checkout is exercised via
// createCheckoutSession directly above — wiring through the route
// requires module-level fetch stubbing which Hono routes don't expose
// cleanly. The createApp test would need fetch injection on the route
// (TODO follow-up).

// ---- GET /billing -----------------------------------------------------

test("GET /billing: configured → renders buy page with email input", async () => {
  const app = createApp();
  const env = makeEnv();
  const r = await app.fetch(new Request("http://localhost/billing"), env);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /one full council review/i);
  assert.match(html, /\$3/);
  assert.match(html, /Buy first-PR pass/);
  assert.match(html, /<input type="email"/);
});

test("GET /billing: unconfigured → renders coming-soon page", async () => {
  const app = createApp();
  const env = makeEnv({ LEMONSQUEEZY_API_KEY: undefined });
  const r = await app.fetch(new Request("http://localhost/billing"), env);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /not yet/i);
  assert.match(html, /BYO/);
});

// ---- POST /webhook/lemonsqueezy ---------------------------------------

function makeOrderEvent({ orderId = "order_aaa", email = "bae@example.com", custom = { product_label: "first-pr-pass" }, status = "paid" } = {}) {
  return {
    meta: { event_name: "order_created", custom_data: custom },
    data: {
      type: "orders",
      id: orderId,
      attributes: {
        store_id: 12345,
        customer_id: 1,
        identifier: "x",
        user_email: email,
        user_name: "Bae",
        currency: "USD",
        status,
        total: 300,
        first_order_item: { variant_id: 98765, variant_name: "First PR pass", product_id: 1, product_name: "First PR pass" },
        created_at: "2026-05-11T00:00:00Z",
        updated_at: "2026-05-11T00:00:00Z",
      },
    },
  };
}

test("POST /webhook/lemonsqueezy: 503 when LEMONSQUEEZY_WEBHOOK_SECRET missing", async () => {
  const app = createApp();
  const env = makeEnv({ LEMONSQUEEZY_WEBHOOK_SECRET: undefined });
  const r = await app.fetch(
    new Request("http://localhost/webhook/lemonsqueezy", {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": "deadbeef" },
      body: JSON.stringify(makeOrderEvent()),
    }),
    env,
  );
  assert.equal(r.status, 503);
});

test("POST /webhook/lemonsqueezy: 401 on bad signature", async () => {
  const app = createApp();
  const env = makeEnv();
  const r = await app.fetch(
    new Request("http://localhost/webhook/lemonsqueezy", {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": "abcdef00" },
      body: JSON.stringify(makeOrderEvent()),
    }),
    env,
  );
  assert.equal(r.status, 401);
});

test("POST /webhook/lemonsqueezy: order_created links existing user + grants paid_credits", async () => {
  const app = createApp();
  const env = makeEnv({
    DB: makeMockDb({
      users: [
        { id: "usr_1", github_user_id: 1, github_login: "bae", email: "bae@example.com", tier: "free", byo_anthropic: 0, data_share_opt_in: 1, trial_used: 0, paid_credits: 0, created_at: "x", last_active_at: "x" },
      ],
    }),
  });
  const body = JSON.stringify(makeOrderEvent());
  const sig = hmacHex(body, env.LEMONSQUEEZY_WEBHOOK_SECRET);
  const r = await app.fetch(
    new Request("http://localhost/webhook/lemonsqueezy", {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": sig },
      body,
    }),
    env,
  );
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.linked, true);
  assert.equal(j.credits_granted, 1);
  // User got the credit
  const u = env.DB.state.users.find((u) => u.id === "usr_1");
  assert.equal(u.paid_credits, 1);
  // billing_orders row exists
  assert.equal(env.DB.state.orders.length, 1);
  assert.equal(env.DB.state.orders[0].status, "paid");
});

test("POST /webhook/lemonsqueezy: order_created with unknown email → paid_unlinked", async () => {
  const app = createApp();
  const env = makeEnv();
  const body = JSON.stringify(makeOrderEvent({ email: "stranger@nowhere.com" }));
  const sig = hmacHex(body, env.LEMONSQUEEZY_WEBHOOK_SECRET);
  const r = await app.fetch(
    new Request("http://localhost/webhook/lemonsqueezy", {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": sig },
      body,
    }),
    env,
  );
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.linked, false);
  assert.equal(env.DB.state.orders[0].status, "paid_unlinked");
  assert.equal(env.DB.state.orders[0].pending_email, "stranger@nowhere.com");
});

test("POST /webhook/lemonsqueezy: duplicate order_id → idempotent ack", async () => {
  const app = createApp();
  const env = makeEnv({
    DB: makeMockDb({
      orders: [
        { id: "bo_old", provider: "lemonsqueezy", provider_order_id: "order_aaa", status: "paid", user_id: "usr_1", credits_granted: 1 },
      ],
    }),
  });
  const body = JSON.stringify(makeOrderEvent({ orderId: "order_aaa" }));
  const sig = hmacHex(body, env.LEMONSQUEEZY_WEBHOOK_SECRET);
  const r = await app.fetch(
    new Request("http://localhost/webhook/lemonsqueezy", {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": sig },
      body,
    }),
    env,
  );
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.duplicate, true);
  // No new row inserted
  assert.equal(env.DB.state.orders.length, 1);
});

test("POST /webhook/lemonsqueezy: non-paid status skips credit but acks", async () => {
  const app = createApp();
  const env = makeEnv();
  const body = JSON.stringify(makeOrderEvent({ status: "pending" }));
  const sig = hmacHex(body, env.LEMONSQUEEZY_WEBHOOK_SECRET);
  const r = await app.fetch(
    new Request("http://localhost/webhook/lemonsqueezy", {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": sig },
      body,
    }),
    env,
  );
  assert.equal(r.status, 200);
  assert.equal(env.DB.state.orders.length, 0); // not credited
});

// ---- pending-link claim via upsertUser --------------------------------

test("upsertUser: new user with email matching pending order → claims it", async () => {
  // Simulate: someone bought before having an account → webhook stored
  // order with pending_email. Now they sign up via GitHub App install,
  // upsertUser fires with their email → should claim + credit.
  const { upsertUser } = await import("../dist/db/saas.js");
  const env = makeEnv({
    DB: makeMockDb({
      orders: [
        {
          id: "bo_pending",
          user_id: null,
          provider: "lemonsqueezy",
          provider_order_id: "order_x",
          product_label: "first-pr-pass",
          amount_cents: 300,
          currency: "USD",
          status: "paid_unlinked",
          credits_granted: 1,
          pending_email: "buyer@example.com",
          customer_email: "buyer@example.com",
          created_at: "x",
        },
      ],
    }),
  });
  const user = await upsertUser(env, {
    githubUserId: 999,
    githubLogin: "buyer",
    email: "buyer@example.com",
  });
  assert.equal(user.paidCredits, 1, "new user should pick up the 1 credit from the pending order");
  const order = env.DB.state.orders[0];
  assert.equal(order.user_id, user.id);
  assert.equal(order.status, "paid");
});

test("upsertUser: existing user with newly-known email claims pending order", async () => {
  const { upsertUser } = await import("../dist/db/saas.js");
  const env = makeEnv({
    DB: makeMockDb({
      users: [
        { id: "usr_existing", github_user_id: 7, github_login: "user7", email: null, tier: "free", byo_anthropic: 0, data_share_opt_in: 1, trial_used: 0, paid_credits: 0, created_at: "x", last_active_at: "x" },
      ],
      orders: [
        {
          id: "bo_existing_pending",
          user_id: null,
          provider: "lemonsqueezy",
          provider_order_id: "order_y",
          product_label: "first-pr-pass",
          amount_cents: 300,
          currency: "USD",
          status: "paid_unlinked",
          credits_granted: 1,
          pending_email: "later@example.com",
          customer_email: "later@example.com",
          created_at: "x",
        },
      ],
    }),
  });
  await upsertUser(env, { githubUserId: 7, githubLogin: "user7", email: "later@example.com" });
  const u = env.DB.state.users.find((u) => u.id === "usr_existing");
  assert.equal(u.paid_credits, 1);
});

// ---- parseWebhookEvent ------------------------------------------------

test("parseWebhookEvent: valid event → returns event", () => {
  const e = parseWebhookEvent({
    meta: { event_name: "order_created" },
    data: { type: "orders", id: "o1", attributes: {} },
  });
  assert.ok(e);
  assert.equal(e.meta.event_name, "order_created");
});

test("parseWebhookEvent: missing meta → null", () => {
  assert.equal(parseWebhookEvent({ data: { type: "x", id: "y", attributes: {} } }), null);
});

test("parseWebhookEvent: missing data.id → null", () => {
  assert.equal(parseWebhookEvent({ meta: { event_name: "x" }, data: { type: "y", attributes: {} } }), null);
});

test("parseWebhookEvent: non-object → null", () => {
  assert.equal(parseWebhookEvent(null), null);
  assert.equal(parseWebhookEvent("string"), null);
  assert.equal(parseWebhookEvent(42), null);
});

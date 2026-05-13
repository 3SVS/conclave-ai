/**
 * Marketplace subscription helper tests — pure unit tests against
 * the four db/saas.ts helpers added for migration 0025. Webhook-level
 * integration is exercised by saas.test.mjs via the /webhook/github
 * route when needed; here we pin the data layer alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  upsertMarketplaceSubscription,
  cancelMarketplaceSubscription,
  notePendingMarketplaceChange,
  clearPendingMarketplaceChange,
} from "../dist/db/saas.js";

function makeMockDb({ subs = [], users = [] } = {}) {
  const state = { subs: [...subs], users: [...users] };
  return {
    state,
    prepare(sql) {
      let bound = [];
      const handlers = {
        async first() {
          if (/SELECT id FROM gh_marketplace_subscriptions/.test(sql)) {
            return state.subs.find((s) => s.github_account_id === bound[0]) ?? null;
          }
          if (/SELECT id FROM saas_users WHERE github_user_id/.test(sql)) {
            return state.users.find((u) => u.github_user_id === bound[0]) ?? null;
          }
          return null;
        },
        async run() {
          if (/INSERT INTO gh_marketplace_subscriptions/.test(sql)) {
            const [
              id, account_id, account_login, account_type, saas_user_id,
              plan_id, plan_name, plan_price, unit_count, billing_cycle,
              on_trial, trial_ends, next_billing, status, pending_plan,
              effective_date, created_at, updated_at,
            ] = bound;
            const existing = state.subs.find((s) => s.github_account_id === account_id);
            if (existing) {
              Object.assign(existing, {
                github_account_login: account_login,
                github_account_type: account_type,
                saas_user_id: saas_user_id ?? existing.saas_user_id,
                plan_id, plan_name, plan_monthly_price_cents: plan_price,
                unit_count, billing_cycle, on_free_trial: on_trial,
                free_trial_ends_on: trial_ends, next_billing_date: next_billing,
                status, pending_change_plan_id: pending_plan,
                effective_date, updated_at,
              });
              return { success: true, meta: { changes: 1 } };
            }
            state.subs.push({
              id, github_account_id: account_id, github_account_login: account_login,
              github_account_type: account_type, saas_user_id,
              plan_id, plan_name, plan_monthly_price_cents: plan_price,
              unit_count, billing_cycle, on_free_trial: on_trial,
              free_trial_ends_on: trial_ends, next_billing_date: next_billing,
              status, pending_change_plan_id: pending_plan,
              effective_date, created_at, updated_at,
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (/UPDATE gh_marketplace_subscriptions/.test(sql) && /status = 'cancelled'/.test(sql)) {
            const [eff, now, accountId] = bound;
            const row = state.subs.find((s) => s.github_account_id === accountId);
            if (!row) return { success: true, meta: { changes: 0 } };
            row.status = "cancelled";
            row.effective_date = eff;
            row.updated_at = now;
            return { success: true, meta: { changes: 1 } };
          }
          if (/pending_change_plan_id = \?/.test(sql) && /status = 'pending_cancellation'/.test(sql)) {
            const [pendingPlan, eff, now, accountId] = bound;
            const row = state.subs.find((s) => s.github_account_id === accountId);
            if (!row) return { success: true, meta: { changes: 0 } };
            row.pending_change_plan_id = pendingPlan;
            row.status = "pending_cancellation";
            row.effective_date = eff;
            row.updated_at = now;
            return { success: true, meta: { changes: 1 } };
          }
          if (/pending_change_plan_id = NULL/.test(sql) && /status = 'active'/.test(sql)) {
            const [now, accountId] = bound;
            const row = state.subs.find((s) => s.github_account_id === accountId);
            if (!row) return { success: true, meta: { changes: 0 } };
            row.pending_change_plan_id = null;
            row.status = "active";
            row.updated_at = now;
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
      };
      return {
        bind(...args) { bound = args; return handlers; },
      };
    },
  };
}

const env = (db) => ({ DB: db });

const baseInput = {
  githubAccountId: 12345,
  githubAccountLogin: "acme-co",
  githubAccountType: "Organization",
  planId: 7001,
  planName: "Solo",
  planMonthlyPriceCents: 1900,
  unitCount: 1,
  billingCycle: "monthly",
  onFreeTrial: false,
  status: "active",
  effectiveDate: "2026-05-13T00:00:00Z",
};

test("upsertMarketplaceSubscription: new row → isNew=true, row persisted", async () => {
  const db = makeMockDb();
  const r = await upsertMarketplaceSubscription(env(db), baseInput);
  assert.equal(r.isNew, true);
  assert.match(r.id, /^mp_/);
  assert.equal(db.state.subs.length, 1);
  assert.equal(db.state.subs[0].plan_name, "Solo");
  assert.equal(db.state.subs[0].status, "active");
});

test("upsertMarketplaceSubscription: existing row → isNew=false, fields updated", async () => {
  const db = makeMockDb({
    subs: [{
      id: "mp_pre",
      github_account_id: 12345,
      github_account_login: "acme-co-old",
      github_account_type: "Organization",
      saas_user_id: null,
      plan_id: 7000, plan_name: "Free", plan_monthly_price_cents: 0,
      unit_count: 1, billing_cycle: null, on_free_trial: 0,
      free_trial_ends_on: null, next_billing_date: null,
      status: "active", pending_change_plan_id: null,
      effective_date: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    }],
  });
  const r = await upsertMarketplaceSubscription(env(db), baseInput);
  assert.equal(r.isNew, false);
  assert.equal(r.id, "mp_pre");
  assert.equal(db.state.subs[0].plan_name, "Solo");
  assert.equal(db.state.subs[0].plan_id, 7001);
  assert.equal(db.state.subs[0].github_account_login, "acme-co");
});

test("upsertMarketplaceSubscription: User account → links to saas_users by github_user_id", async () => {
  const db = makeMockDb({
    users: [{ id: "usr_42", github_user_id: 12345 }],
  });
  await upsertMarketplaceSubscription(env(db), {
    ...baseInput,
    githubAccountType: "User",
  });
  assert.equal(db.state.subs[0].saas_user_id, "usr_42");
});

test("upsertMarketplaceSubscription: Org account → saas_user_id stays null", async () => {
  const db = makeMockDb({
    users: [{ id: "usr_42", github_user_id: 12345 }],
  });
  await upsertMarketplaceSubscription(env(db), baseInput); // Organization
  assert.equal(db.state.subs[0].saas_user_id, null);
});

test("cancelMarketplaceSubscription: flips status to cancelled, sets effective_date", async () => {
  const db = makeMockDb();
  await upsertMarketplaceSubscription(env(db), baseInput);
  const r = await cancelMarketplaceSubscription(env(db), 12345, "2026-06-01T00:00:00Z");
  assert.equal(r.ok, true);
  assert.equal(db.state.subs[0].status, "cancelled");
  assert.equal(db.state.subs[0].effective_date, "2026-06-01T00:00:00Z");
});

test("cancelMarketplaceSubscription: unknown account → ok:false", async () => {
  const db = makeMockDb();
  const r = await cancelMarketplaceSubscription(env(db), 99999, "2026-06-01T00:00:00Z");
  assert.equal(r.ok, false);
});

test("notePendingMarketplaceChange: sets pending plan + status=pending_cancellation", async () => {
  const db = makeMockDb();
  await upsertMarketplaceSubscription(env(db), baseInput);
  const r = await notePendingMarketplaceChange(env(db), 12345, 7002, "2026-07-01T00:00:00Z");
  assert.equal(r.ok, true);
  assert.equal(db.state.subs[0].pending_change_plan_id, 7002);
  assert.equal(db.state.subs[0].status, "pending_cancellation");
});

test("clearPendingMarketplaceChange: clears pending + status back to active", async () => {
  const db = makeMockDb();
  await upsertMarketplaceSubscription(env(db), baseInput);
  await notePendingMarketplaceChange(env(db), 12345, 7002, "2026-07-01T00:00:00Z");
  const r = await clearPendingMarketplaceChange(env(db), 12345);
  assert.equal(r.ok, true);
  assert.equal(db.state.subs[0].pending_change_plan_id, null);
  assert.equal(db.state.subs[0].status, "active");
});

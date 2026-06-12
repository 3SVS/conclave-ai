/**
 * workspace-allowance.test.mjs
 *
 * Stage 22: monthly allowance rules + period helper + getAllowanceDryRun.
 *
 * Tests:
 *  01. getMonthlyAllowanceRule returns rule for workspace_pr_review_run
 *  02. getMonthlyAllowanceRule returns null for unknown event type
 *  03. getMonthlyAllowanceRule returns null for included event
 *  04. getCurrentAllowancePeriod returns YYYY-MM periodKey
 *  05. getCurrentAllowancePeriod periodStart is first day of month UTC
 *  06. getCurrentAllowancePeriod periodEnd is first day of next month UTC
 *  07. getCurrentAllowancePeriod accepts a custom Date
 *  08. getAllowanceDryRun returns null for event without allowance rule
 *  09. getAllowanceDryRun: coveredByAllowance=true when usedThisPeriod=0
 *  10. getAllowanceDryRun: coveredByAllowance=true when usedThisPeriod=4
 *  11. getAllowanceDryRun: coveredByAllowance=false when usedThisPeriod=5
 *  12. getAllowanceDryRun: coveredByAllowance=false when usedThisPeriod=6
 *  13. getAllowanceDryRun: billableUnitsAfterAllowance=0 when covered
 *  14. getAllowanceDryRun: billableUnitsAfterAllowance=1 when not covered
 *  15. getAllowanceDryRun: remainingIncludedRuns = max(0, includedRuns - used)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { getMonthlyAllowanceRule, getCurrentAllowancePeriod } = await import("../dist/workspace/allowance-rules.js");
const { getAllowanceDryRun } = await import("../dist/workspace/allowance-usage.js");

// ─── Mock DB ──────────────────────────────────────────────────────────────────

function makeDb(usedThisPeriod = 0) {
  return {
    prepare(sql) {
      return {
        bind(..._args) {
          return {
            async first() {
              if (sql.includes("SELECT COUNT(*)") && sql.includes("FROM workspace_usage_events")) {
                return { count: usedThisPeriod };
              }
              return null;
            },
          };
        },
      };
    },
  };
}

function makeEnv(usedThisPeriod = 0) {
  return { ENVIRONMENT: "test", DB: makeDb(usedThisPeriod) };
}

// ─── Tests: rule definitions ──────────────────────────────────────────────────

describe("getMonthlyAllowanceRule", () => {
  it("01 — returns rule for workspace_pr_review_run", () => {
    const rule = getMonthlyAllowanceRule("workspace_pr_review_run");
    assert.ok(rule, "rule is not null");
    assert.equal(rule.eventType, "workspace_pr_review_run");
    assert.equal(rule.period, "monthly");
    assert.equal(rule.includedRuns, 5);
    assert.equal(rule.creditType, "review");
  });

  it("02 — returns null for unknown event type", () => {
    const rule = getMonthlyAllowanceRule("workspace_unknown_event");
    assert.equal(rule, null);
  });

  it("03 — returns null for included event (workspace_pr_comment_posted)", () => {
    const rule = getMonthlyAllowanceRule("workspace_pr_comment_posted");
    assert.equal(rule, null);
  });
});

// ─── Tests: period helper ─────────────────────────────────────────────────────

describe("getCurrentAllowancePeriod", () => {
  it("04 — periodKey is YYYY-MM format", () => {
    const { periodKey } = getCurrentAllowancePeriod(new Date("2026-06-15T12:00:00Z"));
    assert.equal(periodKey, "2026-06");
  });

  it("05 — periodStart is first day of month UTC midnight", () => {
    const { periodStart } = getCurrentAllowancePeriod(new Date("2026-06-15T12:00:00Z"));
    assert.equal(periodStart, "2026-06-01T00:00:00.000Z");
  });

  it("06 — periodEnd is first day of next month UTC midnight", () => {
    const { periodEnd } = getCurrentAllowancePeriod(new Date("2026-06-15T12:00:00Z"));
    assert.equal(periodEnd, "2026-07-01T00:00:00.000Z");
  });

  it("07 — accepts a custom Date (December edge case)", () => {
    const { periodKey, periodStart, periodEnd } = getCurrentAllowancePeriod(new Date("2026-12-31T23:59:59Z"));
    assert.equal(periodKey, "2026-12");
    assert.equal(periodStart, "2026-12-01T00:00:00.000Z");
    assert.equal(periodEnd, "2027-01-01T00:00:00.000Z");
  });
});

// ─── Tests: getAllowanceDryRun ─────────────────────────────────────────────────

describe("getAllowanceDryRun", () => {
  it("08 — returns null for event without allowance rule", async () => {
    const env = makeEnv(0);
    const result = await getAllowanceDryRun({ env, userKey: "u1", eventType: "workspace_pr_comment_posted" });
    assert.equal(result, null);
  });

  it("09 — coveredByAllowance=true when usedThisPeriod=0", async () => {
    const env = makeEnv(0);
    const result = await getAllowanceDryRun({ env, userKey: "u1", eventType: "workspace_pr_review_run" });
    assert.ok(result);
    assert.equal(result.coveredByAllowance, true);
    assert.equal(result.usedThisPeriod, 0);
    assert.equal(result.remainingIncludedRuns, 5);
  });

  it("10 — coveredByAllowance=true when usedThisPeriod=4", async () => {
    const env = makeEnv(4);
    const result = await getAllowanceDryRun({ env, userKey: "u1", eventType: "workspace_pr_review_run" });
    assert.ok(result);
    assert.equal(result.coveredByAllowance, true);
    assert.equal(result.usedThisPeriod, 4);
    assert.equal(result.remainingIncludedRuns, 1);
  });

  it("11 — coveredByAllowance=false when usedThisPeriod=5", async () => {
    const env = makeEnv(5);
    const result = await getAllowanceDryRun({ env, userKey: "u1", eventType: "workspace_pr_review_run" });
    assert.ok(result);
    assert.equal(result.coveredByAllowance, false);
    assert.equal(result.usedThisPeriod, 5);
    assert.equal(result.remainingIncludedRuns, 0);
  });

  it("12 — coveredByAllowance=false when usedThisPeriod=6", async () => {
    const env = makeEnv(6);
    const result = await getAllowanceDryRun({ env, userKey: "u1", eventType: "workspace_pr_review_run" });
    assert.ok(result);
    assert.equal(result.coveredByAllowance, false);
    assert.equal(result.remainingIncludedRuns, 0);
  });

  it("13 — billableUnitsAfterAllowance=0 when covered", async () => {
    const env = makeEnv(2);
    const result = await getAllowanceDryRun({ env, userKey: "u1", eventType: "workspace_pr_review_run" });
    assert.ok(result);
    assert.equal(result.billableUnitsAfterAllowance, 0);
  });

  it("14 — billableUnitsAfterAllowance=1 when not covered", async () => {
    const env = makeEnv(5);
    const result = await getAllowanceDryRun({ env, userKey: "u1", eventType: "workspace_pr_review_run" });
    assert.ok(result);
    assert.equal(result.billableUnitsAfterAllowance, 1);
  });

  it("15 — remainingIncludedRuns = max(0, includedRuns - usedThisPeriod)", async () => {
    for (const [used, expected] of [[0, 5], [3, 2], [5, 0], [7, 0]]) {
      const env = makeEnv(used);
      const result = await getAllowanceDryRun({ env, userKey: "u1", eventType: "workspace_pr_review_run" });
      assert.ok(result);
      assert.equal(result.remainingIncludedRuns, expected, `used=${used}`);
    }
  });
});

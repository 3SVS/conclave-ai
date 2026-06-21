// Stage 81: pure aggregator turning project-wide per-pack
// EvolutionImpactComparison results into project Evolution Learning Signals.
// The HTTP endpoint wiring is exercised in workspace-evolution-action-pack.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";

const { buildProjectEvolutionLearning } = await import(
  "../dist/workspace/project-evolution-learning.js"
);

function compare({
  verdict,
  delta,
  limitations = [],
  actionPackId = "weap_x",
} = {}) {
  return {
    actionPackId,
    experimentId: "wexp_x",
    projectId: "proj_x",
    recommendedAction: "fix_selected",
    before: null,
    after: null,
    delta: delta ?? null,
    verdict,
    reasons: [],
    limitations,
  };
}

function entry({
  verdict,
  followed = true,
  recommendedAction = "fix_selected",
  delta,
  limitations = [],
} = {}) {
  return { comparison: compare({ verdict, delta, limitations }), followed, recommendedAction };
}

const POSITIVE = { passRateDelta: 0.1, passedDelta: 1, criticalIssueDelta: -1, notVerifiedDelta: 0, blockerDelta: -1 };
const NEGATIVE = { passRateDelta: -0.1, passedDelta: -1, criticalIssueDelta: 1, notVerifiedDelta: 0, blockerDelta: 1 };
const NEUTRAL  = { passRateDelta: 0,    passedDelta: 0,  criticalIssueDelta: 0,  notVerifiedDelta: 0, blockerDelta: 0  };

const COMMON = { projectId: "proj_x" };

test("no experiments / no entries → not_enough_data", () => {
  const r = buildProjectEvolutionLearning({ ...COMMON, experimentCount: 0, entries: [] });
  assert.equal(r.experimentCount, 0);
  assert.equal(r.actionPackCount, 0);
  assert.equal(r.followedPackCount, 0);
  assert.equal(r.comparablePackCount, 0);
  assert.deepEqual(r.topSignals, [{ type: "not_enough_data" }]);
  assert.equal(r.averageDelta.passRateDelta, null);
});

test("experiments exist but no action packs → not_enough_data", () => {
  const r = buildProjectEvolutionLearning({ ...COMMON, experimentCount: 3, entries: [] });
  assert.equal(r.experimentCount, 3);
  assert.equal(r.actionPackCount, 0);
  assert.deepEqual(r.topSignals, [{ type: "not_enough_data" }]);
});

test("action packs but none comparable (all inconclusive) → not_enough_data", () => {
  const r = buildProjectEvolutionLearning({
    ...COMMON,
    experimentCount: 1,
    entries: [
      entry({ verdict: "inconclusive" }),
      entry({ verdict: "inconclusive" }),
      entry({ verdict: "inconclusive" }),
    ],
  });
  assert.equal(r.comparablePackCount, 0);
  assert.deepEqual(r.topSignals, [{ type: "not_enough_data" }]);
});

test("comparablePackCount excludes inconclusive (incl. mixed_signals with non-null delta)", () => {
  const r = buildProjectEvolutionLearning({
    ...COMMON,
    experimentCount: 1,
    entries: [
      entry({ verdict: "improved",     delta: POSITIVE }),
      entry({ verdict: "regressed",    delta: NEGATIVE }),
      entry({ verdict: "unchanged",    delta: NEUTRAL  }),
      // Mixed signals: verdict is inconclusive even though delta exists.
      entry({ verdict: "inconclusive", delta: POSITIVE }),
    ],
  });
  assert.equal(r.actionPackCount, 4);
  assert.equal(r.comparablePackCount, 3); // improved + regressed + unchanged
});

test("action_often_improves fires when improvementRate >= 0.67 and comparable >= 2", () => {
  const r = buildProjectEvolutionLearning({
    ...COMMON,
    experimentCount: 1,
    entries: [
      entry({ verdict: "improved", delta: POSITIVE, recommendedAction: "fix_selected" }),
      entry({ verdict: "improved", delta: POSITIVE, recommendedAction: "fix_selected" }),
      entry({ verdict: "improved", delta: POSITIVE, recommendedAction: "fix_selected" }),
    ],
  });
  assert.equal(r.comparablePackCount, 3);
  const sig = r.topSignals.find((s) => s.type === "action_often_improves");
  assert.ok(sig, "expected action_often_improves signal");
  assert.equal(sig.recommendedAction, "fix_selected");
  assert.equal(sig.improved, 3);
  assert.equal(sig.totalComparable, 3);
});

test("action_often_regresses fires when regressionRate >= 0.5 and comparable >= 2", () => {
  const r = buildProjectEvolutionLearning({
    ...COMMON,
    experimentCount: 1,
    entries: [
      entry({ verdict: "improved",  delta: POSITIVE, recommendedAction: "rerun_experiment" }),
      entry({ verdict: "regressed", delta: NEGATIVE, recommendedAction: "rerun_experiment" }),
      entry({ verdict: "regressed", delta: NEGATIVE, recommendedAction: "rerun_experiment" }),
      // Bring project comparable total to 3.
      entry({ verdict: "unchanged", delta: NEUTRAL,  recommendedAction: "accept" }),
    ],
  });
  const reg = r.topSignals.find((s) => s.type === "action_often_regresses");
  assert.ok(reg, "expected action_often_regresses signal");
  assert.equal(reg.recommendedAction, "rerun_experiment");
  assert.equal(reg.regressed, 2);
});

test("improvementRate and regressionRate are null when comparable=0 for that action", () => {
  const r = buildProjectEvolutionLearning({
    ...COMMON,
    experimentCount: 1,
    entries: [
      // Enough comparable elsewhere to clear project threshold.
      entry({ verdict: "improved",     delta: POSITIVE, recommendedAction: "fix_selected" }),
      entry({ verdict: "improved",     delta: POSITIVE, recommendedAction: "fix_selected" }),
      entry({ verdict: "improved",     delta: POSITIVE, recommendedAction: "fix_selected" }),
      // create_benchmark only ever shows up as inconclusive (no benchmark by definition).
      entry({ verdict: "inconclusive", recommendedAction: "create_benchmark" }),
    ],
  });
  const cb = r.recommendedActionEffectiveness.find((x) => x.recommendedAction === "create_benchmark");
  assert.ok(cb);
  assert.equal(cb.comparable, 0);
  assert.equal(cb.improvementRate, null);
  assert.equal(cb.regressionRate, null);
});

test("project below MIN_PROJECT_COMPARABLE → not_enough_data even with one strong action", () => {
  const r = buildProjectEvolutionLearning({
    ...COMMON,
    experimentCount: 1,
    entries: [
      entry({ verdict: "improved", delta: POSITIVE }),
      entry({ verdict: "improved", delta: POSITIVE }),
    ],
  });
  // Only 2 comparable, below project threshold of 3.
  assert.equal(r.comparablePackCount, 2);
  assert.deepEqual(r.topSignals, [{ type: "not_enough_data" }]);
});

test("recommendedActionEffectiveness is alphabetically sorted for golden stability", () => {
  const r = buildProjectEvolutionLearning({
    ...COMMON,
    experimentCount: 1,
    entries: [
      entry({ verdict: "improved",  delta: POSITIVE, recommendedAction: "rerun_experiment" }),
      entry({ verdict: "improved",  delta: POSITIVE, recommendedAction: "fix_selected" }),
      entry({ verdict: "regressed", delta: NEGATIVE, recommendedAction: "accept" }),
    ],
  });
  assert.deepEqual(
    r.recommendedActionEffectiveness.map((x) => x.recommendedAction),
    ["accept", "fix_selected", "rerun_experiment"],
  );
});

test("average delta ignores null deltas and uses simple unweighted mean", () => {
  const r = buildProjectEvolutionLearning({
    ...COMMON,
    experimentCount: 1,
    entries: [
      entry({ verdict: "improved", delta: { passRateDelta: 0.10, passedDelta: 2, criticalIssueDelta: -2, notVerifiedDelta: -1, blockerDelta: -3 } }),
      entry({ verdict: "improved", delta: { passRateDelta: 0.30, passedDelta: 5, criticalIssueDelta: -1, notVerifiedDelta: 0,  blockerDelta: -1 } }),
      entry({ verdict: "inconclusive", delta: null }),
    ],
  });
  assert.ok(Math.abs(r.averageDelta.passRateDelta - 0.2) < 1e-9);
  assert.equal(r.averageDelta.criticalIssueDelta, -1.5);
  assert.equal(r.averageDelta.notVerifiedDelta, -0.5);
  assert.equal(r.averageDelta.blockerDelta, -2);
});

test("topSignals capped at 5 entries", () => {
  // 6 actions all clearing the improvement bar → output capped at 5.
  const r = buildProjectEvolutionLearning({
    ...COMMON,
    experimentCount: 1,
    entries: [
      entry({ verdict: "improved", delta: POSITIVE, recommendedAction: "action_a" }),
      entry({ verdict: "improved", delta: POSITIVE, recommendedAction: "action_a" }),
      entry({ verdict: "improved", delta: POSITIVE, recommendedAction: "action_b" }),
      entry({ verdict: "improved", delta: POSITIVE, recommendedAction: "action_b" }),
      entry({ verdict: "improved", delta: POSITIVE, recommendedAction: "action_c" }),
      entry({ verdict: "improved", delta: POSITIVE, recommendedAction: "action_c" }),
      entry({ verdict: "improved", delta: POSITIVE, recommendedAction: "action_d" }),
      entry({ verdict: "improved", delta: POSITIVE, recommendedAction: "action_d" }),
      entry({ verdict: "improved", delta: POSITIVE, recommendedAction: "action_e" }),
      entry({ verdict: "improved", delta: POSITIVE, recommendedAction: "action_e" }),
      entry({ verdict: "improved", delta: POSITIVE, recommendedAction: "action_f" }),
      entry({ verdict: "improved", delta: POSITIVE, recommendedAction: "action_f" }),
    ],
  });
  assert.ok(r.topSignals.length <= 5, `expected ≤5 signals, got ${r.topSignals.length}`);
});

test("limitations dedup + sort across all packs", () => {
  const r = buildProjectEvolutionLearning({
    ...COMMON,
    experimentCount: 1,
    entries: [
      entry({ verdict: "improved", delta: POSITIVE, limitations: ["pack_json_unreadable", "before_benchmark_other_owner"] }),
      entry({ verdict: "improved", delta: POSITIVE, limitations: ["pack_json_unreadable"] }),
      entry({ verdict: "improved", delta: POSITIVE }),
    ],
  });
  assert.deepEqual(r.limitations, ["before_benchmark_other_owner", "pack_json_unreadable"]);
});

test("no userKey/token in any string of the response", () => {
  const r = buildProjectEvolutionLearning({
    ...COMMON,
    experimentCount: 2,
    entries: [
      entry({ verdict: "improved",  delta: POSITIVE, recommendedAction: "fix_selected" }),
      entry({ verdict: "improved",  delta: POSITIVE, recommendedAction: "fix_selected" }),
      entry({ verdict: "regressed", delta: NEGATIVE, recommendedAction: "rerun_experiment" }),
    ],
  });
  const flat = JSON.stringify(r);
  assert.ok(!/userKey/i.test(flat));
  assert.ok(!/uk_/.test(flat));
  assert.ok(!/token/i.test(flat));
});

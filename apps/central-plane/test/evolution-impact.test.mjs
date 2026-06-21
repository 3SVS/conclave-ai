// Stage 79: pure deterministic Before/After Evolution Impact comparison.
// Tests the helper in isolation — the HTTP endpoint wiring is covered
// by workspace-evolution-action-pack.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  buildImpactComparison,
  snapshotFromBenchmark,
  snapshotFromReviewRun,
} = await import("../dist/workspace/evolution-impact.js");

function snap(partial) {
  return {
    source: "benchmark",
    sourceId: "src",
    passRate: 0,
    passedCount: 0,
    failedCount: 0,
    inconclusiveCount: 0,
    needsDecisionCount: 0,
    criticalIssueCount: 0,
    notVerifiedCount: 0,
    blockerCount: 0,
    totalCount: 0,
    ...partial,
  };
}

const COMMON = {
  actionPackId: "weap_x",
  experimentId: "wexp_x",
  projectId: "proj_x",
  recommendedAction: "fix_selected",
};

test("missing before+after → inconclusive + missing_followup + missing_before", () => {
  const c = buildImpactComparison({ ...COMMON, before: null, after: null });
  assert.equal(c.verdict, "inconclusive");
  assert.ok(c.reasons.includes("missing_followup"));
  assert.ok(c.reasons.includes("missing_before"));
  assert.equal(c.delta, null);
});

test("missing only after → inconclusive + missing_after + missing_followup", () => {
  const c = buildImpactComparison({
    ...COMMON,
    before: snap({ passedCount: 5, totalCount: 5, passRate: 1 }),
    after: null,
  });
  assert.equal(c.verdict, "inconclusive");
  assert.ok(c.reasons.includes("missing_after"));
  assert.ok(c.reasons.includes("missing_followup"));
  assert.equal(c.delta, null);
});

test("missing only before → inconclusive + missing_before", () => {
  const c = buildImpactComparison({
    ...COMMON,
    before: null,
    after: snap({ passedCount: 5, totalCount: 5, passRate: 1 }),
  });
  assert.equal(c.verdict, "inconclusive");
  assert.ok(c.reasons.includes("missing_before"));
  assert.equal(c.delta, null);
});

test("clear improvement: pass rate up + blockers down → improved", () => {
  const c = buildImpactComparison({
    ...COMMON,
    before: snap({
      passedCount: 5, failedCount: 2, inconclusiveCount: 1, needsDecisionCount: 0,
      totalCount: 8, passRate: 5 / 8,
      criticalIssueCount: 2, notVerifiedCount: 1, blockerCount: 3,
    }),
    after: snap({
      passedCount: 7, failedCount: 0, inconclusiveCount: 1, needsDecisionCount: 0,
      totalCount: 8, passRate: 7 / 8,
      criticalIssueCount: 0, notVerifiedCount: 1, blockerCount: 1,
    }),
  });
  assert.equal(c.verdict, "improved");
  assert.ok(c.reasons.includes("pass_rate_increased"));
  assert.ok(c.reasons.includes("critical_issues_decreased"));
  assert.ok(c.reasons.includes("blockers_decreased"));
  assert.equal(c.delta.passRateDelta > 0, true);
  assert.equal(c.delta.blockerDelta < 0, true);
});

test("clear regression: pass rate down + critical up → regressed", () => {
  const c = buildImpactComparison({
    ...COMMON,
    before: snap({
      passedCount: 7, totalCount: 8, passRate: 7 / 8,
      criticalIssueCount: 0, blockerCount: 1, notVerifiedCount: 1,
    }),
    after: snap({
      passedCount: 5, failedCount: 2, inconclusiveCount: 1,
      totalCount: 8, passRate: 5 / 8,
      criticalIssueCount: 2, blockerCount: 3, notVerifiedCount: 1,
    }),
  });
  assert.equal(c.verdict, "regressed");
  assert.ok(c.reasons.includes("pass_rate_decreased"));
  assert.ok(c.reasons.includes("critical_issues_increased"));
  assert.ok(c.reasons.includes("blockers_increased"));
});

test("unchanged: identical snapshots → unchanged + no change reasons", () => {
  const same = snap({
    passedCount: 5, totalCount: 5, passRate: 1,
    criticalIssueCount: 0, blockerCount: 0, notVerifiedCount: 0,
  });
  const c = buildImpactComparison({ ...COMMON, before: same, after: { ...same, sourceId: "src2" } });
  assert.equal(c.verdict, "unchanged");
  assert.deepEqual(c.reasons, []);
  assert.equal(c.delta.passRateDelta, 0);
  assert.equal(c.delta.blockerDelta, 0);
});

test("mixed signals: pass rate up but critical up → inconclusive + mixed_signals", () => {
  const c = buildImpactComparison({
    ...COMMON,
    before: snap({
      passedCount: 5, failedCount: 0, inconclusiveCount: 2,
      totalCount: 7, passRate: 5 / 7,
      criticalIssueCount: 0, blockerCount: 2, notVerifiedCount: 2,
    }),
    after: snap({
      passedCount: 6, failedCount: 1, inconclusiveCount: 0,
      totalCount: 7, passRate: 6 / 7,
      criticalIssueCount: 1, blockerCount: 1, notVerifiedCount: 0,
    }),
  });
  assert.equal(c.verdict, "inconclusive");
  assert.ok(c.reasons.includes("mixed_signals"));
  assert.ok(c.reasons.includes("pass_rate_increased"));
  assert.ok(c.reasons.includes("critical_issues_increased"));
});

test("different acceptance set: item IDs differ → inconclusive + different_acceptance_set", () => {
  const c = buildImpactComparison({
    ...COMMON,
    before: snap({
      passedCount: 3, totalCount: 3, passRate: 1, itemIds: ["i1", "i2", "i3"],
    }),
    after: snap({
      passedCount: 3, totalCount: 3, passRate: 1, itemIds: ["i1", "i4", "i5"],
    }),
  });
  assert.equal(c.verdict, "inconclusive");
  assert.ok(c.reasons.includes("different_acceptance_set"));
  assert.ok(c.delta, "delta should still be computed for transparency");
});

test("alignment guard skipped when one side has no item IDs (no false negative)", () => {
  const c = buildImpactComparison({
    ...COMMON,
    before: snap({ passedCount: 3, totalCount: 3, passRate: 1 }), // no itemIds
    after: snap({
      passedCount: 4, totalCount: 4, passRate: 1, itemIds: ["i1", "i2", "i3", "i4"],
    }),
  });
  // No alignment guard fires, so we get the regular verdict (unchanged on score signals
  // — pass rate is identical, blockers identical).
  assert.notEqual(c.verdict, "inconclusive");
});

test("snapshotFromBenchmark: picks selectedCandidateId metrics", () => {
  const benchmark = {
    projectId: "p",
    candidates: [{ id: "a", label: "A", mode: "single_agent", source: "manual" }, { id: "b", label: "B", mode: "multi_agent", source: "codex" }],
    metricsByCandidate: {
      a: { totalItems: 8, passed: 5, failed: 2, inconclusive: 1, needsDecision: 0, acceptancePassRate: 5 / 8, criticalIssueCount: 2, notVerifiedCount: 1, score: 9 },
      b: { totalItems: 8, passed: 7, failed: 1, inconclusive: 0, needsDecision: 0, acceptancePassRate: 7 / 8, criticalIssueCount: 1, notVerifiedCount: 0, score: 18 },
    },
  };
  const s = snapshotFromBenchmark(benchmark, { sourceId: "wab_1", selectedCandidateId: "b" });
  assert.equal(s.passedCount, 7);
  assert.equal(s.criticalIssueCount, 1);
  assert.equal(s.blockerCount, 1);
  assert.equal(s.source, "benchmark");
  assert.equal(s.sourceId, "wab_1");
});

test("snapshotFromBenchmark: falls back to winner → basis → first candidate", () => {
  const benchmark = {
    projectId: "p",
    candidates: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    metricsByCandidate: {
      a: { totalItems: 1, passed: 1, failed: 0, inconclusive: 0, needsDecision: 0, acceptancePassRate: 1, criticalIssueCount: 0, notVerifiedCount: 0, score: 3 },
      b: { totalItems: 1, passed: 0, failed: 1, inconclusive: 0, needsDecision: 0, acceptancePassRate: 0, criticalIssueCount: 1, notVerifiedCount: 0, score: -3 },
    },
    recommendation: { winnerCandidateId: "a", rationale: [], blockers: [] },
  };
  const s = snapshotFromBenchmark(benchmark, { sourceId: "src" });
  assert.equal(s.passedCount, 1);
});

test("snapshotFromReviewRun: counts statuses from resultJson.results", () => {
  const resultJson = JSON.stringify({
    results: [
      { itemId: "i1", title: "Login", status: "passed" },
      { itemId: "i2", title: "Logout", status: "failed", evidence: "no guard" },
      { itemId: "i3", title: "Share", status: "inconclusive" },
      { itemId: "i4", title: "Perms", status: "needs_decision" },
    ],
  });
  const s = snapshotFromReviewRun(resultJson, { sourceId: "wprr_1" });
  assert.equal(s.totalCount, 4);
  assert.equal(s.passedCount, 1);
  assert.equal(s.failedCount, 1);
  assert.equal(s.inconclusiveCount, 1);
  assert.equal(s.needsDecisionCount, 1);
  assert.equal(s.criticalIssueCount, 2); // failed + needs_decision
  assert.equal(s.notVerifiedCount, 1);
  assert.equal(s.blockerCount, 3);
  assert.deepEqual(s.itemIds, ["i1", "i2", "i3", "i4"]);
  assert.equal(s.source, "review_run");
});

test("snapshotFromReviewRun: empty / malformed → null (does not throw)", () => {
  assert.equal(snapshotFromReviewRun(null, { sourceId: "x" }), null);
  assert.equal(snapshotFromReviewRun("{not json", { sourceId: "x" }), null);
  assert.equal(snapshotFromReviewRun(JSON.stringify({ results: [] }), { sourceId: "x" }), null);
});

test("verdict never leaks userKey/token in any reason or limitation string", () => {
  const c = buildImpactComparison({
    ...COMMON,
    before: snap({ passedCount: 5, totalCount: 5, passRate: 1 }),
    after: snap({ passedCount: 7, totalCount: 7, passRate: 1 }),
    limitations: ["before_benchmark_other_owner"],
  });
  const flat = JSON.stringify(c);
  assert.ok(!/userKey/i.test(flat));
  assert.ok(!/uk_/.test(flat));
  assert.ok(!/token/i.test(flat));
});

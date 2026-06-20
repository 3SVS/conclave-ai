// Stage 75: deterministic experiment outcome-quality scorecard.
import { test } from "node:test";
import assert from "node:assert/strict";

const { computeOutcomeScorecard } = await import("../dist/workspace/experiment-outcome-scorecard.js");
const { computeCandidateMetrics } = await import("../dist/workspace/agent-benchmark.js");

function bench(candidateId, counts, items, aligned = true) {
  return {
    projectId: "p",
    candidates: [{ id: candidateId, label: candidateId, mode: "multi_agent", source: "codex" }],
    metricsByCandidate: { [candidateId]: computeCandidateMetrics(counts) },
    ...(items ? { itemOutcomesByCandidate: { [candidateId]: items } } : {}),
    acceptanceSetAlignment: { aligned },
    recommendation: { winnerCandidateId: candidateId, rationale: [], blockers: [] },
    blockerBasisCandidateId: candidateId,
  };
}

test("strong grade → accept", () => {
  const sc = computeOutcomeScorecard({
    experimentId: "e", projectId: "p", decisionStatus: "selected", selectedCandidateId: "b",
    benchmark: bench("b", { passed: 9, failed: 0, inconclusive: 0, needsDecision: 0 }),
  });
  assert.equal(sc.quality.grade, "strong");
  assert.equal(sc.quality.acceptancePassRate, 1);
  assert.equal(sc.nextEvolution.recommendedAction, "accept");
  assert.ok(sc.nextEvolution.reasons.includes("strong_acceptance_result"));
});

test("promising grade (passRate>=0.65, critical<=1)", () => {
  const sc = computeOutcomeScorecard({
    experimentId: "e", projectId: "p", decisionStatus: "selected", selectedCandidateId: "b",
    benchmark: bench("b", { passed: 7, failed: 1, inconclusive: 1, needsDecision: 0 }),
  });
  assert.equal(sc.quality.grade, "promising");
});

test("needs_work grade (critical>=2)", () => {
  const sc = computeOutcomeScorecard({
    experimentId: "e", projectId: "p", decisionStatus: "selected", selectedCandidateId: "b",
    benchmark: bench("b", { passed: 5, failed: 2, inconclusive: 1, needsDecision: 1 }),
  });
  assert.equal(sc.quality.grade, "needs_work");
});

test("inconclusive when no benchmark → create_benchmark", () => {
  const sc = computeOutcomeScorecard({ experimentId: "e", projectId: "p", decisionStatus: "undecided", benchmark: null });
  assert.equal(sc.quality.grade, "inconclusive");
  assert.equal(sc.nextEvolution.recommendedAction, "create_benchmark");
  assert.ok(sc.nextEvolution.reasons.includes("missing_benchmark"));
  assert.equal(sc.signals.hasBenchmark, false);
});

test("missing selected candidate → rerun/clarify + reason", () => {
  const sc = computeOutcomeScorecard({
    experimentId: "e", projectId: "p", decisionStatus: "undecided",
    benchmark: bench("b", { passed: 5, failed: 1, inconclusive: 0, needsDecision: 0 }),
  });
  assert.equal(sc.signals.hasSelectedCandidate, false);
  assert.ok(sc.nextEvolution.reasons.includes("missing_selected_candidate"));
  assert.ok(["rerun_experiment", "clarify_acceptance_items"].includes(sc.nextEvolution.recommendedAction));
});

test("acceptanceSetAligned false → clarify_acceptance_items", () => {
  const sc = computeOutcomeScorecard({
    experimentId: "e", projectId: "p", decisionStatus: "selected", selectedCandidateId: "b",
    benchmark: bench("b", { passed: 7, failed: 1 }, undefined, false),
  });
  assert.equal(sc.nextEvolution.recommendedAction, "clarify_acceptance_items");
  assert.ok(sc.nextEvolution.reasons.includes("acceptance_set_misaligned"));
});

test("remaining blockers (item-level) → fix_selected + focus items prioritized", () => {
  const items = [
    { candidateId: "b", itemId: "i1", title: "Login", status: "passed", evidence: "ok" },
    { candidateId: "b", itemId: "i2", title: "Logout", status: "inconclusive" },
    { candidateId: "b", itemId: "i3", title: "Share", status: "failed", evidence: "no guard" },
    { candidateId: "b", itemId: "i4", title: "Perms", status: "needs_decision" },
  ];
  const sc = computeOutcomeScorecard({
    experimentId: "e", projectId: "p", decisionStatus: "selected", selectedCandidateId: "b",
    benchmark: bench("b", { passed: 1, failed: 1, inconclusive: 1, needsDecision: 1 }, items),
  });
  assert.equal(sc.quality.unresolvedBlockerCount, 3);
  assert.ok(sc.nextEvolution.reasons.includes("selected_candidate_has_remaining_blockers"));
  // failed (i3) before needs_decision (i4) before inconclusive (i2)
  assert.deepEqual(sc.nextEvolution.suggestedFocusItemIds, ["i3", "i4", "i2"]);
  assert.equal(sc.signals.hasItemLevelEvidence, true);
  // evidence coverage: 2 of 4 outcomes have evidence
  assert.equal(sc.quality.evidenceCoverageRate, 0.5);
});

test("evidenceCoverageRate null without item-level evidence", () => {
  const sc = computeOutcomeScorecard({
    experimentId: "e", projectId: "p", decisionStatus: "selected", selectedCandidateId: "b",
    benchmark: bench("b", { passed: 5, failed: 1 }),
  });
  assert.equal(sc.quality.evidenceCoverageRate, null);
  assert.equal(sc.signals.hasItemLevelEvidence, false);
});

test("score formula includes evidence-covered bonus", () => {
  const items = [{ candidateId: "b", itemId: "i1", title: "X", status: "passed", evidence: "e" }];
  const sc = computeOutcomeScorecard({
    experimentId: "e", projectId: "p", decisionStatus: "selected", selectedCandidateId: "b",
    benchmark: bench("b", { passed: 1 }, items),
  });
  // passed*3 + evidenceCovered(1)*0.5 = 3.5
  assert.equal(sc.quality.score, 3.5);
});

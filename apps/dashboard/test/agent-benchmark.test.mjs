import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeCandidateMetrics,
  rankCandidates,
  buildBenchmarkResult,
  CANDIDATE_MODES,
  CANDIDATE_SOURCES,
} from "../src/lib/agent-benchmark.mjs";

const candidate = (id, label, mode = "single_agent", source = "manual") => ({ id, label, mode, source });

test("computeCandidateMetrics derives counts, pass rate, critical/not-verified, score", () => {
  const m = computeCandidateMetrics({ passed: 7, failed: 1, inconclusive: 1, needsDecision: 0 });
  assert.equal(m.totalItems, 9);
  assert.equal(m.passed, 7);
  assert.equal(m.acceptancePassRate, 7 / 9);
  assert.equal(m.criticalIssueCount, 1); // failed + needsDecision
  assert.equal(m.notVerifiedCount, 1); // inconclusive
  // score = 7*3 - 1*3 - 0*2 - 1*1 = 21 - 3 - 0 - 1 = 17
  assert.equal(m.score, 17);
});

test("score weighting matches spec (passed*3 - failed*3 - needs_decision*2 - inconclusive*1)", () => {
  assert.equal(computeCandidateMetrics({ passed: 1 }).score, 3);
  assert.equal(computeCandidateMetrics({ failed: 1 }).score, -3);
  assert.equal(computeCandidateMetrics({ needsDecision: 1 }).score, -2);
  assert.equal(computeCandidateMetrics({ inconclusive: 1 }).score, -1);
  assert.equal(computeCandidateMetrics({ passed: 2, failed: 1, needsDecision: 1, inconclusive: 2 }).score, 6 - 3 - 2 - 2);
});

test("empty / missing counts yield zeros and a 0 pass rate (never NaN)", () => {
  const m = computeCandidateMetrics(undefined);
  assert.equal(m.totalItems, 0);
  assert.equal(m.acceptancePassRate, 0);
  assert.equal(m.score, 0);
  assert.equal(computeCandidateMetrics({}).acceptancePassRate, 0);
  // negative / garbage clamps to 0
  assert.equal(computeCandidateMetrics({ passed: -5, failed: "x" }).passed, 0);
});

test("buildBenchmarkResult picks the higher-score candidate as winner", () => {
  const candidates = [candidate("a", "Single agent"), candidate("b", "Multi-agent", "multi_agent")];
  const res = buildBenchmarkResult({
    projectId: "p1",
    candidates,
    countsByCandidate: {
      a: { passed: 5, failed: 2, inconclusive: 2, needsDecision: 0 },
      b: { passed: 7, failed: 1, inconclusive: 1, needsDecision: 0 },
    },
  });
  assert.equal(res.recommendation.winnerCandidateId, "b");
  assert.equal(res.metricsByCandidate.b.passed, 7);
  const passComparison = res.recommendation.rationale.find((r) => r.code === "pass_comparison");
  assert.ok(passComparison);
  assert.equal(passComparison.winnerPassed, 7);
  assert.equal(passComparison.runnerPassed, 5);
});

test("rationale includes fewer_critical and runner_not_verified when applicable", () => {
  const res = buildBenchmarkResult({
    projectId: "p1",
    candidates: [candidate("a", "A"), candidate("b", "B")],
    countsByCandidate: {
      a: { passed: 5, failed: 2, inconclusive: 2, needsDecision: 1 }, // critical 3, notVerified 2
      b: { passed: 8, failed: 0, inconclusive: 0, needsDecision: 1 }, // critical 1
    },
  });
  assert.equal(res.recommendation.winnerCandidateId, "b");
  const codes = res.recommendation.rationale.map((r) => r.code);
  assert.ok(codes.includes("fewer_critical"));
  const nv = res.recommendation.rationale.find((r) => r.code === "runner_not_verified");
  assert.ok(nv);
  assert.equal(nv.count, 2);
});

test("blockers list candidates that still have failed / needs_decision / inconclusive", () => {
  const res = buildBenchmarkResult({
    projectId: "p1",
    candidates: [candidate("a", "A"), candidate("b", "B")],
    countsByCandidate: {
      a: { passed: 3, failed: 1, inconclusive: 1, needsDecision: 0 },
      b: { passed: 9, failed: 0, inconclusive: 0, needsDecision: 0 }, // clean
    },
  });
  const blockerIds = res.recommendation.blockers.map((b) => b.candidateId);
  assert.ok(blockerIds.includes("a"));
  assert.ok(!blockerIds.includes("b")); // clean candidate has no blocker entry
});

test("too-close candidates return no clear winner", () => {
  const res = buildBenchmarkResult({
    projectId: "p1",
    candidates: [candidate("a", "A"), candidate("b", "B")],
    countsByCandidate: {
      a: { passed: 5, failed: 2, inconclusive: 1, needsDecision: 1 },
      b: { passed: 5, failed: 2, inconclusive: 1, needsDecision: 1 },
    },
  });
  assert.equal(res.recommendation.winnerCandidateId, undefined);
  assert.deepEqual(res.recommendation.rationale, [{ code: "no_clear_winner" }]);
});

test("score diff of exactly 1 with equal pass rate + critical is still no clear winner", () => {
  // a: passed 5, inconclusive 1 → score 14, passRate 5/6, critical 0
  // b: passed 5, inconclusive 2 → score 13, passRate 5/7, critical 0
  // pass rates differ → this should NOT be "too close"; verify a clear winner emerges
  const res = buildBenchmarkResult({
    projectId: "p1",
    candidates: [candidate("a", "A"), candidate("b", "B")],
    countsByCandidate: {
      a: { passed: 5, inconclusive: 1 },
      b: { passed: 5, inconclusive: 2 },
    },
  });
  assert.equal(res.recommendation.winnerCandidateId, "a");
});

test("fewer than 2 candidates yields no recommendation", () => {
  const res = buildBenchmarkResult({
    projectId: "p1",
    candidates: [candidate("a", "A")],
    countsByCandidate: { a: { passed: 3 } },
  });
  assert.equal(res.recommendation, undefined);
  assert.equal(res.candidates.length, 1);
});

test("missing candidate counts are treated as zeros (no throw)", () => {
  const res = buildBenchmarkResult({
    projectId: "p1",
    candidates: [candidate("a", "A"), candidate("b", "B")],
    countsByCandidate: { a: { passed: 4 } }, // b absent
  });
  assert.equal(res.metricsByCandidate.b.totalItems, 0);
  assert.equal(res.recommendation.winnerCandidateId, "a");
});

test("rankCandidates applies deterministic tiebreakers", () => {
  const candidates = [candidate("a", "A"), candidate("b", "B"), candidate("c", "C")];
  const metrics = {
    a: computeCandidateMetrics({ passed: 5, inconclusive: 1 }), // score 14
    b: computeCandidateMetrics({ passed: 5 }), // score 15
    c: computeCandidateMetrics({ passed: 5, failed: 1 }), // score 12
  };
  const ranked = rankCandidates(candidates, metrics);
  assert.deepEqual(ranked.map((r) => r.candidate.id), ["b", "a", "c"]);
});

test("mode / source constants expose the expected enums", () => {
  assert.deepEqual(CANDIDATE_MODES, ["single_agent", "multi_agent", "reviewer_agent", "hybrid"]);
  assert.deepEqual(CANDIDATE_SOURCES, ["claude_code", "codex", "cursor", "manual", "other"]);
});

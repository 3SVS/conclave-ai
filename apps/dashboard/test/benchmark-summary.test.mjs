// Stage 66: deterministic copy-summary assembler.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBenchmarkSummaryText } from "../src/lib/agent-benchmark.mjs";

const base = {
  heading: "Conclave benchmark result",
  projectLine: "Project: proj_x",
  benchmarkLine: "Benchmark: Single vs multi",
  candidatesHeading: "Candidates",
  candidateLines: [
    "Single agent: 5/9 passed, 2 critical issues, 2 not verified, score 9",
    "Multi-agent: 7/9 passed, 1 critical issues, 1 not verified, score 17",
  ],
  whyHeading: "Why",
  blockersHeading: "Remaining blockers",
  noBlockersLine: "No remaining blockers found for the recommended candidate.",
};

test("winner case: includes recommendation, candidates, why, blockers", () => {
  const text = buildBenchmarkSummaryText({
    ...base,
    recommendationLine: "Recommendation: Multi-agent",
    whyLines: ["Multi-agent passed more acceptance items.", "Multi-agent had fewer critical issues."],
    blockerLines: ["Multi-agent: 1 issues, 0 need a decision, 1 not verified"],
  });
  assert.match(text, /^Conclave benchmark result\n\nProject: proj_x\nBenchmark: Single vs multi\nRecommendation: Multi-agent\n\nCandidates:\n- Single agent:/);
  assert.match(text, /\nWhy:\n- Multi-agent passed more acceptance items\./);
  assert.match(text, /\nRemaining blockers:\n- Multi-agent: 1 issues/);
});

test("no-clear-winner case: no Why section, recommendation reads no clear winner", () => {
  const text = buildBenchmarkSummaryText({
    ...base,
    recommendationLine: "Recommendation: No clear winner",
    whyLines: [],
    blockerLines: [],
  });
  assert.match(text, /Recommendation: No clear winner/);
  assert.doesNotMatch(text, /\nWhy:/); // no Why section when there are no lines
  assert.match(text, /\nRemaining blockers:\nNo remaining blockers found/);
});

test("compact matrix insight appended when matrixLines provided", () => {
  const text = buildBenchmarkSummaryText({
    ...base,
    recommendationLine: "Recommendation: Multi-agent",
    whyLines: ["x"],
    blockerLines: [],
    matrixHeading: "Acceptance item matrix",
    matrixLines: ["9 items compared", "3 items had different results across candidates"],
  });
  assert.match(text, /\nAcceptance item matrix:\n- 9 items compared\n- 3 items had different results across candidates/);
});

test("matrix section omitted when no matrixLines (backward compatible)", () => {
  const text = buildBenchmarkSummaryText({
    ...base,
    recommendationLine: "Recommendation: Multi-agent",
    whyLines: ["x"],
    blockerLines: [],
  });
  assert.doesNotMatch(text, /Acceptance item matrix/);
});

test("deterministic: same input → identical output", () => {
  const input = { ...base, recommendationLine: "Recommendation: Multi-agent", whyLines: ["x"], blockerLines: [] };
  assert.equal(buildBenchmarkSummaryText(input), buildBenchmarkSummaryText(input));
});

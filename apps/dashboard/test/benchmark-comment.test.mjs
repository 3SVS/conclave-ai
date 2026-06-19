// Stage 67: deterministic PR-comment markdown + same-PR post-target guard.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveBenchmarkPrTarget,
  buildBenchmarkPrCommentMarkdown,
} from "../src/lib/agent-benchmark-comment.mjs";

const cand = (id, pr) => ({ id, label: id, mode: "single_agent", source: "manual", pullRequestNumber: pr, reviewRunId: `wprr_${id}` });

const baseParts = {
  heading: "Conclave benchmark result",
  intro: "Conclave compared multiple build candidates using acceptance review results.",
  recommendationLabel: "Recommendation",
  columns: { candidate: "Candidate", mode: "Mode", passed: "Passed", critical: "Critical issues", notVerified: "Not verified", score: "Score" },
  rows: [
    { label: "Single agent", mode: "Single agent", passed: 5, total: 9, critical: 2, notVerified: 2, score: 9 },
    { label: "Multi-agent", mode: "Multi-agent", passed: 7, total: 9, critical: 1, notVerified: 1, score: 17 },
  ],
  whyHeading: "Why",
  blockersHeading: "Remaining blockers",
  noBlockersLine: "No remaining blockers found for the recommended candidate.",
  noteHeading: "Note",
  noteText: "Conclave does not guess which agent is smarter. It compares what each implementation actually satisfies.",
};

// ─── PR target ────────────────────────────────────────────────────────────────

test("resolveBenchmarkPrTarget: same PR across candidates → can post", () => {
  const r = resolveBenchmarkPrTarget([cand("a", 7), cand("b", 7)]);
  assert.deepEqual(r, { canPost: true, prNumber: 7 });
});

test("resolveBenchmarkPrTarget: different PRs → cannot post", () => {
  assert.deepEqual(resolveBenchmarkPrTarget([cand("a", 7), cand("b", 8)]), { canPost: false });
});

test("resolveBenchmarkPrTarget: missing PR number → cannot post", () => {
  assert.deepEqual(resolveBenchmarkPrTarget([cand("a", 7), cand("b", undefined)]), { canPost: false });
});

test("resolveBenchmarkPrTarget: empty → cannot post", () => {
  assert.deepEqual(resolveBenchmarkPrTarget([]), { canPost: false });
});

// ─── Markdown builder ─────────────────────────────────────────────────────────

test("winner markdown: recommendation, table, why, blockers, note", () => {
  const md = buildBenchmarkPrCommentMarkdown({
    ...baseParts,
    recommendationValue: "Multi-agent",
    whyLines: ["Multi-agent passed more acceptance items.", "Multi-agent had fewer critical issues."],
    blockerLines: ["Not verified: 1"],
  });
  assert.match(md, /^## Conclave benchmark result\n/);
  assert.match(md, /\*\*Recommendation:\*\* Multi-agent/);
  assert.match(md, /\| Candidate \| Mode \| Passed \| Critical issues \| Not verified \| Score \|/);
  assert.match(md, /\| Multi-agent \| Multi-agent \| 7\/9 \| 1 \| 1 \| 17 \|/);
  assert.match(md, /### Why\n\n- Multi-agent passed more acceptance items\./);
  assert.match(md, /### Remaining blockers\n\n- Not verified: 1/);
  assert.match(md, /### Note\n\nConclave does not guess/);
});

test("no-clear-winner markdown: no Why section, includes body", () => {
  const md = buildBenchmarkPrCommentMarkdown({
    ...baseParts,
    recommendationValue: "No clear winner",
    noClearWinnerBody: "The candidates are too close to recommend one with confidence.",
    whyLines: [],
    blockerLines: [],
  });
  assert.match(md, /\*\*Recommendation:\*\* No clear winner\nThe candidates are too close/);
  assert.doesNotMatch(md, /### Why/);
  assert.match(md, /### Remaining blockers\n\nNo remaining blockers found/);
});

test("misaligned acceptance set adds a blockquote warning", () => {
  const md = buildBenchmarkPrCommentMarkdown({
    ...baseParts,
    recommendationValue: "Multi-agent",
    alignmentWarning: "These candidates were reviewed against different acceptance item sets. Compare results with caution.",
    whyLines: ["x"],
    blockerLines: [],
  });
  assert.match(md, /> Warning: These candidates were reviewed against different acceptance item sets\./);
});

test("no token / userKey leakage in markdown", () => {
  const md = buildBenchmarkPrCommentMarkdown({
    ...baseParts,
    recommendationValue: "Multi-agent",
    whyLines: ["x"],
    blockerLines: [],
  });
  assert.doesNotMatch(md, /userKey|uk_|token|wprr_|Bearer|ghp_/i);
});

test("deterministic: same input → identical markdown", () => {
  const parts = { ...baseParts, recommendationValue: "Multi-agent", whyLines: ["x"], blockerLines: [] };
  assert.equal(buildBenchmarkPrCommentMarkdown(parts), buildBenchmarkPrCommentMarkdown(parts));
});

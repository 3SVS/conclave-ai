// Stage 65: assert the dashboard preview logic matches the SHARED golden
// fixture (the same fixture central-plane's canonical .ts is checked against).
// If this fails, the dashboard .mjs and central-plane .ts have diverged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeCandidateMetrics,
  buildBenchmarkResult,
  computeAcceptanceSetAlignment,
} from "../src/lib/agent-benchmark.mjs";

const golden = JSON.parse(
  readFileSync(new URL("../../central-plane/test/fixtures/agent-benchmark-golden.json", import.meta.url), "utf8"),
);

for (const c of golden.cases) {
  test(`golden parity (dashboard): ${c.name}`, () => {
    // scores per candidate
    for (const [id, expectedScore] of Object.entries(c.expected.scores)) {
      assert.equal(computeCandidateMetrics(c.countsByCandidate[id]).score, expectedScore, `score[${id}]`);
    }

    const result = buildBenchmarkResult({
      projectId: "fixture",
      candidates: c.candidates,
      countsByCandidate: c.countsByCandidate,
      itemResultsByCandidate: c.itemResultsByCandidate,
    });

    if (c.expected.hasRecommendation === false) {
      assert.equal(result.recommendation, undefined);
    } else {
      assert.ok(result.recommendation);
      const expectedWinner = c.expected.winnerCandidateId ?? undefined;
      assert.equal(result.recommendation.winnerCandidateId, expectedWinner);
      if (c.expected.noClearWinner) {
        assert.deepEqual(result.recommendation.rationale, [{ code: "no_clear_winner" }]);
      }
    }

    const alignment = computeAcceptanceSetAlignment(c.candidates, c.selectedItemIdsByCandidate);
    assert.equal(alignment.aligned, c.expected.alignment.aligned, "alignment.aligned");
    if (c.expected.alignment.differingCandidateIds) {
      assert.deepEqual(alignment.differingCandidateIds, c.expected.alignment.differingCandidateIds);
    }

    // Stage 68: item-level evidence parity
    if (c.expectedItems) {
      assert.equal(result.blockerBasisCandidateId, c.expectedItems.blockerBasisCandidateId, "blockerBasisCandidateId");
      assert.deepEqual(result.remainingBlockers, c.expectedItems.remainingBlockers, "remainingBlockers");
      for (const [cid, n] of Object.entries(c.expectedItems.outcomeCounts)) {
        assert.equal(result.itemOutcomesByCandidate[cid].length, n, `outcomeCounts[${cid}]`);
      }
    } else {
      assert.equal(result.remainingBlockers, undefined);
      assert.equal(result.itemOutcomesByCandidate, undefined);
    }
  });
}

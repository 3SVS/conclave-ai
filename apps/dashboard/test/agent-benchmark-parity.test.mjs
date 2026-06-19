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
  });
}

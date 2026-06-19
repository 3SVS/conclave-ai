// Stage 65: the canonical central-plane benchmark logic against the SHARED
// golden fixture (the same one the dashboard .mjs is checked against).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const {
  computeCandidateMetrics,
  buildBenchmarkResult,
  computeAcceptanceSetAlignment,
} = await import("../dist/workspace/agent-benchmark.js");

const golden = JSON.parse(
  readFileSync(new URL("./fixtures/agent-benchmark-golden.json", import.meta.url), "utf8"),
);

for (const c of golden.cases) {
  test(`golden parity (central-plane): ${c.name}`, () => {
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

test("acceptance set alignment: identical sets in different order are aligned", () => {
  const candidates = [
    { id: "a", label: "A", mode: "single_agent", source: "manual" },
    { id: "b", label: "B", mode: "multi_agent", source: "manual" },
  ];
  const alignment = computeAcceptanceSetAlignment(candidates, { a: ["i2", "i1"], b: ["i1", "i2"] });
  assert.equal(alignment.aligned, true);
});

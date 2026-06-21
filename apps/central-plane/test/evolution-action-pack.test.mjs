// Stage 77: canonical central-plane Evolution Action Pack helper, asserted
// against the SHARED golden fixture (the same one the dashboard .mjs is checked
// against). If this drifts, the dashboard mirror has diverged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const {
  buildEvolutionActionPack,
  buildEvolutionActionPackText,
  resolveFocusItems,
  EVOLUTION_ACTIONS,
  DEFAULT_EVOLUTION_STRINGS,
} = await import("../dist/workspace/evolution-action-pack.js");

const golden = JSON.parse(
  readFileSync(new URL("./fixtures/evolution-action-pack-golden.json", import.meta.url), "utf8"),
);

const s = DEFAULT_EVOLUTION_STRINGS;

for (const c of golden.cases) {
  test(`golden parity (central-plane): ${c.name}`, () => {
    const pack = buildEvolutionActionPack(c.input, s);
    assert.equal(pack.recommendedAction, c.expected.recommendedAction);
    assert.equal(pack.targetCandidateId ?? null, c.expected.targetCandidateId ?? null);
    assert.deepEqual(pack.focusItemIds, c.expected.focusItemIds);
    assert.deepEqual(
      pack.sections.map((sec) => sec.title),
      c.expected.sectionTitles,
    );
    if (c.expected.evidenceBodyContains) {
      const evidenceSec = pack.sections.find((sec) => sec.title === s.secEvidence);
      assert.ok(evidenceSec, "expected an evidence section");
      assert.match(evidenceSec.body, new RegExp(c.expected.evidenceBodyContains));
    }
    if (c.expected.focusBodyContains) {
      const body = pack.sections
        .map((sec) => sec.body)
        .join("\n");
      for (const needle of c.expected.focusBodyContains) {
        assert.ok(body.includes(needle), `expected focus body to contain "${needle}"`);
      }
    }
  });
}

test("EVOLUTION_ACTIONS lists the five recommendedAction values", () => {
  assert.deepEqual([...EVOLUTION_ACTIONS].sort(), [
    "accept",
    "clarify_acceptance_items",
    "create_benchmark",
    "fix_selected",
    "rerun_experiment",
  ]);
});

test("resolveFocusItems falls back to itemId when no title is known", () => {
  const scorecard = {
    experimentId: "e",
    projectId: "p",
    decisionStatus: "selected",
    selectedCandidateId: "b",
    quality: {
      acceptancePassRate: null,
      unresolvedBlockerCount: 0,
      criticalIssueCount: 0,
      notVerifiedCount: 0,
      needsDecisionCount: 0,
      evidenceCoverageRate: null,
      score: 0,
      grade: "needs_work",
    },
    signals: { hasBenchmark: false, hasDecision: true, hasSelectedCandidate: true, hasItemLevelEvidence: false },
    nextEvolution: { recommendedAction: "fix_selected", reasons: [], suggestedFocusItemIds: ["i_x"] },
  };
  const resolved = resolveFocusItems(scorecard, null, []);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].title, "i_x");
  assert.equal(resolved[0].status, null);
});

test("buildEvolutionActionPackText is deterministic markdown without userKey/token", () => {
  const scorecard = golden.cases[0].input.scorecard;
  const pack = buildEvolutionActionPack(golden.cases[0].input, s);
  const text = buildEvolutionActionPackText(pack, s, {
    experimentTitle: "Multi-agent split",
    targetCandidateLabel: "Builder B",
  });
  assert.match(text, /^# Conclave Evolution Action Pack/);
  assert.match(text, /Recommended action: Accept this candidate/);
  assert.match(text, /Experiment: Multi-agent split/);
  assert.match(text, /Target candidate: Builder B/);
  assert.ok(!/userKey/i.test(text), "must not contain userKey");
  assert.ok(!/uk_/.test(text), "must not contain a user key token");
  assert.ok(!/token/i.test(text), "must not contain token");
  // Stable: re-render produces the same string.
  const text2 = buildEvolutionActionPackText(pack, s, {
    experimentTitle: "Multi-agent split",
    targetCandidateLabel: "Builder B",
  });
  assert.equal(text2, text);
  assert.equal(scorecard.selectedCandidateId, "b"); // fixture sanity
});

test("create_benchmark pack works without a benchmark + still has four sections", () => {
  const pack = buildEvolutionActionPack(golden.cases[4].input, s);
  assert.equal(pack.recommendedAction, "create_benchmark");
  assert.equal(pack.targetCandidateId, undefined);
  assert.equal(pack.focusItemIds.length, 0);
  assert.equal(pack.sections.length, 4);
});

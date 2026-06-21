// Stage 84 (intro) + Stage 85 (rename): central-plane BRAND constants and how
// they flow into canonical user-visible text. A future rename should update
// BRAND in one place; tests here guard against drift between BRAND and the
// canonical pack heading.
import { test } from "node:test";
import assert from "node:assert/strict";

const { BRAND } = await import("../dist/workspace/brand.js");
const {
  DEFAULT_EVOLUTION_STRINGS,
  buildEvolutionActionPack,
  buildEvolutionActionPackText,
} = await import("../dist/workspace/evolution-action-pack.js");

test("BRAND exports the spec keys with the current Simsa values", () => {
  assert.equal(BRAND.productName, "Simsa");
  assert.equal(BRAND.productShortName, "Simsa");
  assert.equal(BRAND.actionPackHeading, "Simsa Evolution Action Pack");
  assert.equal(BRAND.prCommentHeading, "Simsa Review");
  assert.equal(BRAND.tagline, "The acceptance layer for AI-built software.");
});

test("DEFAULT_EVOLUTION_STRINGS.packHeading is sourced from BRAND.actionPackHeading", () => {
  // The constant lookup is what guarantees a future BRAND change reaches saved
  // packs without a follow-up edit to evolution-action-pack.ts.
  assert.equal(DEFAULT_EVOLUTION_STRINGS.packHeading, BRAND.actionPackHeading);
});

test("buildEvolutionActionPackText starts with the current Simsa-era heading", () => {
  // Stage 85 contract: NEW server-saved packs use the Simsa heading. Saved
  // pack_json rows from before Stage 85 keep their baked-in heading
  // (immutable artifact policy — Stage 77 limitation, Stage 85 §5).
  const scorecard = {
    experimentId: "wexp_t",
    projectId: "proj_t",
    decisionStatus: "undecided",
    quality: {
      acceptancePassRate: null,
      unresolvedBlockerCount: 0,
      criticalIssueCount: 0,
      notVerifiedCount: 0,
      needsDecisionCount: 0,
      evidenceCoverageRate: null,
      score: 0,
      grade: "inconclusive",
    },
    signals: {
      hasBenchmark: false, hasDecision: false, hasSelectedCandidate: false, hasItemLevelEvidence: false,
    },
    nextEvolution: { recommendedAction: "create_benchmark", reasons: [], suggestedFocusItemIds: [] },
  };
  const pack = buildEvolutionActionPack(
    { projectId: "proj_t", experiment: { id: "wexp_t", title: "T" }, scorecard },
    DEFAULT_EVOLUTION_STRINGS,
  );
  const text = buildEvolutionActionPackText(pack, DEFAULT_EVOLUTION_STRINGS);
  assert.match(text, /^# Simsa Evolution Action Pack/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEvolutionActionPack,
  buildEvolutionActionPackText,
  resolveFocusItems,
  EVOLUTION_ACTIONS,
} from "../src/lib/evolution-action-pack.mjs";
import { DICTIONARIES } from "../src/i18n/dictionary.mjs";

const s = DICTIONARIES.en.evolution;

function scorecard(action, opts = {}) {
  return {
    experimentId: "wexp_1",
    projectId: "proj_1",
    selectedCandidateId: opts.selectedCandidateId,
    decisionStatus: opts.decisionStatus ?? "undecided",
    quality: {
      acceptancePassRate: opts.passRate ?? null,
      unresolvedBlockerCount: opts.unresolved ?? 0,
      criticalIssueCount: opts.critical ?? 0,
      notVerifiedCount: opts.notVerified ?? 0,
      needsDecisionCount: 0,
      evidenceCoverageRate: null,
      score: 0,
      grade: "inconclusive",
    },
    signals: { hasBenchmark: !!opts.benchmark, hasDecision: false, hasSelectedCandidate: !!opts.selectedCandidateId, hasItemLevelEvidence: false },
    nextEvolution: {
      recommendedAction: action,
      reasons: [],
      suggestedFocusItemIds: opts.focusIds ?? [],
    },
  };
}

const experiment = { id: "wexp_1", title: "Multi-agent split", candidates: [{ id: "wexc_b", candidateId: "b", label: "Builder B" }] };

test("EVOLUTION_ACTIONS covers the five recommendedAction values", () => {
  assert.deepEqual([...EVOLUTION_ACTIONS].sort(), [
    "accept",
    "clarify_acceptance_items",
    "create_benchmark",
    "fix_selected",
    "rerun_experiment",
  ]);
});

test("accept pack: decision/evidence/pre-merge/next-review, no rewrite instructions", () => {
  const pack = buildEvolutionActionPack(
    { projectId: "proj_1", experiment, scorecard: scorecard("accept", { selectedCandidateId: "b", passRate: 1, critical: 0, notVerified: 0 }) },
    s,
  );
  assert.equal(pack.recommendedAction, "accept");
  assert.equal(pack.targetCandidateId, "b");
  assert.deepEqual(pack.sections.map((x) => x.title), [s.secDecision, s.secEvidence, s.secPreMerge, s.secNextReview]);
  // evidence body filled from metrics
  assert.match(pack.sections[1].body, /100%/);
});

test("fix_selected pack: focus items with status labels, constraints, expected output", () => {
  const benchmark = {
    candidates: [{ id: "b" }],
    itemOutcomesByCandidate: {
      b: [
        { candidateId: "b", itemId: "i1", title: "Task sharing permissions", status: "failed" },
        { candidateId: "b", itemId: "i2", title: "Comment error handling", status: "inconclusive" },
      ],
    },
  };
  const pack = buildEvolutionActionPack(
    {
      projectId: "proj_1",
      experiment,
      benchmark,
      scorecard: scorecard("fix_selected", { selectedCandidateId: "b", focusIds: ["i1", "i2"], unresolved: 2 }),
    },
    s,
  );
  assert.equal(pack.recommendedAction, "fix_selected");
  assert.equal(pack.targetCandidateId, "b");
  assert.deepEqual(pack.focusItemIds, ["i1", "i2"]);
  const titles = pack.sections.map((x) => x.title);
  assert.deepEqual(titles, [s.secGoal, s.focusItems, s.secConstraints, s.secExpectedOutput, s.secAfterCompletion]);
  const focusBody = pack.sections[1].body;
  assert.match(focusBody, /Issue found — Task sharing permissions/);
  assert.match(focusBody, /Not verified — Comment error handling/);
  assert.match(pack.sections[2].body, /Do not rewrite the product intent/);
});

test("rerun_experiment pack sections", () => {
  const pack = buildEvolutionActionPack({ projectId: "proj_1", experiment, scorecard: scorecard("rerun_experiment") }, s);
  assert.deepEqual(pack.sections.map((x) => x.title), [s.secWhyRerun, s.secSetup, s.secRoles, s.secCompare]);
  assert.equal(pack.targetCandidateId, undefined);
});

test("clarify_acceptance_items pack sections include items list", () => {
  const benchmark = {
    candidates: [{ id: "b" }],
    itemOutcomesByCandidate: { b: [{ candidateId: "b", itemId: "i9", title: "Export format", status: "needs_decision" }] },
  };
  const pack = buildEvolutionActionPack(
    { projectId: "proj_1", experiment, benchmark, scorecard: scorecard("clarify_acceptance_items", { selectedCandidateId: "b", focusIds: ["i9"] }) },
    s,
  );
  assert.deepEqual(pack.sections.map((x) => x.title), [s.secWhyClarify, s.secItemsClarify, s.secQuestions, s.secAfterClarify]);
  assert.match(pack.sections[1].body, /Needs decision — Export format/);
});

test("create_benchmark pack sections (no benchmark / inconclusive)", () => {
  const pack = buildEvolutionActionPack({ projectId: "proj_1", experiment, scorecard: scorecard("create_benchmark") }, s);
  assert.deepEqual(pack.sections.map((x) => x.title), [s.secWhyBenchmark, s.secRequiredInputs, s.secSteps, s.secWhatExpect]);
  assert.equal(pack.focusItemIds.length, 0);
});

test("focus item falls back to itemId when no title is found", () => {
  const resolved = resolveFocusItems(scorecard("fix_selected", { selectedCandidateId: "b", focusIds: ["i_unknown"] }), null, []);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].title, "i_unknown");
  assert.equal(resolved[0].status, null);
});

test("focus item resolves title from acceptanceItems when benchmark lacks it", () => {
  const resolved = resolveFocusItems(
    scorecard("fix_selected", { selectedCandidateId: "b", focusIds: ["i5"] }),
    null,
    [{ id: "i5", title: "Login flow" }],
  );
  assert.equal(resolved[0].title, "Login flow");
});

test("copy text is deterministic markdown and contains no userKey/token", () => {
  const pack = buildEvolutionActionPack(
    { projectId: "proj_1", experiment, scorecard: scorecard("fix_selected", { selectedCandidateId: "b", focusIds: [] }) },
    s,
  );
  const text = buildEvolutionActionPackText(pack, s, { experimentTitle: "Multi-agent split", targetCandidateLabel: "Builder B" });
  assert.match(text, /^# Simsa Evolution Action Pack/);
  assert.match(text, /Recommended action: Fix the selected candidate/);
  assert.match(text, /Experiment: Multi-agent split/);
  assert.match(text, /Target candidate: Builder B/);
  assert.ok(!/userKey/i.test(text), "must not contain userKey");
  assert.ok(!/uk_/.test(text), "must not contain a user key token");
  assert.ok(!/token/i.test(text), "must not contain token");
});

// Stage 76: Evolution Action Pack — turn an outcome scorecard's recommendedAction
// + suggestedFocusItemIds into a deterministic, copy-ready instruction pack for a
// human to hand to an agent (Claude Code / Codex / Cursor) or a teammate.
//
// Pure + deterministic. No LLM, no network, no token. All user-facing text comes
// in via the localized `s` (strings) bundle so the pack follows the UI language,
// matching the buildCandidatePrompt convention (already-localized parts in).
//
// Distinct from Fix instructions: Fix instructions improve ONE implementation from a
// PR review / benchmark blocker; an action pack decides the next evolution LOOP
// (accept / fix / rerun / clarify / benchmark) from the experiment outcome scorecard.

export const EVOLUTION_ACTIONS = [
  "accept",
  "fix_selected",
  "rerun_experiment",
  "clarify_acceptance_items",
  "create_benchmark",
];

function actionLabel(action, s) {
  return (
    {
      accept: s.actAccept,
      fix_selected: s.actFixSelected,
      rerun_experiment: s.actRerun,
      clarify_acceptance_items: s.actClarify,
      create_benchmark: s.actCreateBenchmark,
    }[action] ?? action
  );
}

function actionSummary(action, s) {
  return (
    {
      accept: s.summaryAccept,
      fix_selected: s.summaryFixSelected,
      rerun_experiment: s.summaryRerun,
      clarify_acceptance_items: s.summaryClarify,
      create_benchmark: s.summaryCreateBenchmark,
    }[action] ?? s.summaryCreateBenchmark
  );
}

/** Map a benchmark/blocker item status to a localized severity label (or null). */
export function statusLabelFor(status, s) {
  if (status === "failed") return s.statusIssue;
  if (status === "needs_decision") return s.statusDecision;
  if (status === "inconclusive") return s.statusNotVerified;
  return null;
}

/**
 * Resolve suggestedFocusItemIds → { itemId, title, status } using, in order:
 * basis candidate's benchmark item outcomes → remaining blockers → project
 * acceptance items → itemId fallback. Never invents a missing title.
 */
export function resolveFocusItems(scorecard, benchmark, acceptanceItems) {
  const ids = scorecard?.nextEvolution?.suggestedFocusItemIds ?? [];
  const basisId =
    scorecard?.selectedCandidateId ??
    benchmark?.recommendation?.winnerCandidateId ??
    benchmark?.blockerBasisCandidateId ??
    benchmark?.candidates?.[0]?.id;
  const outcomes = basisId ? benchmark?.itemOutcomesByCandidate?.[basisId] ?? [] : [];
  const byId = new Map(outcomes.map((o) => [o.itemId, o]));
  const blockerById = new Map((benchmark?.remainingBlockers ?? []).map((b) => [b.itemId, b]));
  const accById = new Map((acceptanceItems ?? []).map((a) => [a.id, a]));
  return ids.map((itemId) => {
    const o = byId.get(itemId);
    const b = blockerById.get(itemId);
    const a = accById.get(itemId);
    const title = (o && o.title) || (b && b.title) || (a && a.title) || itemId;
    const status = (o && o.status) || (b && b.status) || null;
    return { itemId, title, status };
  });
}

function focusBody(focusItems, s) {
  if (!focusItems.length) return s.noFocus;
  return focusItems
    .map((f, i) => {
      const label = statusLabelFor(f.status, s);
      return `${i + 1}. ${label ? `${label} — ${f.title}` : f.title}`;
    })
    .join("\n");
}

function bullets(lines) {
  return lines.map((l) => `- ${l}`).join("\n");
}

function evidenceBody(quality, s) {
  if (!quality || quality.acceptancePassRate == null) return s.evidenceNoData;
  return s.evidenceTemplate
    .replace("{rate}", `${Math.round(quality.acceptancePassRate * 100)}%`)
    .replace("{crit}", String(quality.criticalIssueCount ?? 0))
    .replace("{nv}", String(quality.notVerifiedCount ?? 0));
}

function sectionsFor(action, s, focusItems, quality) {
  switch (action) {
    case "accept":
      return [
        { title: s.secDecision, body: s.secDecisionBody },
        { title: s.secEvidence, body: evidenceBody(quality, s) },
        { title: s.secPreMerge, body: s.secPreMergeBody },
        { title: s.secNextReview, body: s.secNextReviewBody },
      ];
    case "fix_selected":
      return [
        { title: s.secGoal, body: s.secGoalBody },
        { title: s.focusItems, body: focusBody(focusItems, s) },
        { title: s.secConstraints, body: bullets([s.cIntent, s.cScope, s.cPreserve]) },
        { title: s.secExpectedOutput, body: bullets([s.oUpdate, s.oPr, s.oReport, s.oRerun]) },
        { title: s.secAfterCompletion, body: s.secAfterCompletionBody },
      ];
    case "rerun_experiment":
      return [
        { title: s.secWhyRerun, body: s.secWhyRerunBody },
        { title: s.secSetup, body: s.secSetupBody },
        { title: s.secRoles, body: s.secRolesBody },
        { title: s.secCompare, body: s.secCompareBody },
      ];
    case "clarify_acceptance_items":
      return [
        { title: s.secWhyClarify, body: s.secWhyClarifyBody },
        { title: s.secItemsClarify, body: focusBody(focusItems, s) },
        { title: s.secQuestions, body: s.secQuestionsBody },
        { title: s.secAfterClarify, body: s.secAfterClarifyBody },
      ];
    case "create_benchmark":
    default:
      return [
        { title: s.secWhyBenchmark, body: s.secWhyBenchmarkBody },
        { title: s.secRequiredInputs, body: s.secRequiredInputsBody },
        { title: s.secSteps, body: s.secStepsBody },
        { title: s.secWhatExpect, body: s.secWhatExpectBody },
      ];
  }
}

/**
 * Build a deterministic EvolutionActionPack from a scorecard (+ optional benchmark
 * snapshot for focus-item titles). `s` is the localized strings bundle (t.evolution).
 */
export function buildEvolutionActionPack(input, s) {
  const { projectId, experiment, scorecard, benchmark, acceptanceItems } = input;
  const action = scorecard?.nextEvolution?.recommendedAction ?? "create_benchmark";
  const focusItems = resolveFocusItems(scorecard, benchmark, acceptanceItems);
  const quality = scorecard?.quality;
  const targetCandidateId =
    action === "fix_selected" || action === "accept" ? scorecard?.selectedCandidateId ?? undefined : undefined;
  return {
    projectId,
    experimentId: experiment?.id ?? scorecard?.experimentId ?? "",
    recommendedAction: action,
    title: actionLabel(action, s),
    summary: actionSummary(action, s),
    targetCandidateId,
    focusItemIds: focusItems.map((f) => f.itemId),
    sections: sectionsFor(action, s, focusItems, quality),
  };
}

/**
 * Render a pack as deterministic, readable markdown for copy. `meta` carries the
 * already-localized experiment title + target candidate label for the header.
 * Never includes a userKey or token.
 */
export function buildEvolutionActionPackText(pack, s, meta = {}) {
  const lines = [`# ${s.packHeading}`, "", `${s.recommendedAction}: ${pack.title}`];
  if (meta.experimentTitle) lines.push(`${s.experimentLabel}: ${meta.experimentTitle}`);
  if (pack.targetCandidateId && meta.targetCandidateLabel) {
    lines.push(`${s.targetCandidate}: ${meta.targetCandidateLabel}`);
  }
  for (const sec of pack.sections) {
    lines.push("", `## ${sec.title}`, "", sec.body);
  }
  return lines.join("\n");
}

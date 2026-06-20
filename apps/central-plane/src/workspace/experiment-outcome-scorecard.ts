/**
 * workspace/experiment-outcome-scorecard.ts — Stage 75
 *
 * Deterministic outcome-quality scorecard for a multi-agent experiment. Answers
 * "did this experiment move the idea toward a better product outcome?" using
 * ONLY acceptance results + recorded evidence — NO LLM judgement. Computed on
 * demand (no persistence); the score formula is expected to evolve.
 */
import type { AgentBenchmarkResult } from "./agent-benchmark.js";

export type OutcomeGrade = "strong" | "promising" | "needs_work" | "inconclusive";
export type OutcomeDecisionStatus = "undecided" | "selected" | "needs_fix" | "no_clear_winner";
export type EvolutionAction =
  | "accept"
  | "fix_selected"
  | "rerun_experiment"
  | "clarify_acceptance_items"
  | "create_benchmark";
export type EvolutionReason =
  | "selected_candidate_has_remaining_blockers"
  | "acceptance_set_misaligned"
  | "high_not_verified_count"
  | "strong_acceptance_result"
  | "missing_benchmark"
  | "missing_selected_candidate";

export type ExperimentOutcomeScorecard = {
  experimentId: string;
  projectId: string;
  selectedCandidateId?: string;
  decisionStatus: OutcomeDecisionStatus;
  quality: {
    acceptancePassRate: number | null;
    unresolvedBlockerCount: number;
    criticalIssueCount: number;
    notVerifiedCount: number;
    needsDecisionCount: number;
    evidenceCoverageRate: number | null;
    score: number;
    grade: OutcomeGrade;
  };
  signals: {
    hasBenchmark: boolean;
    hasDecision: boolean;
    hasSelectedCandidate: boolean;
    hasItemLevelEvidence: boolean;
    acceptanceSetAligned?: boolean;
  };
  nextEvolution: {
    recommendedAction: EvolutionAction;
    reasons: EvolutionReason[];
    suggestedFocusItemIds: string[];
  };
};

const HIGH_NOT_VERIFIED = 2;
const HIGH_CRITICAL = 2;
const STATUS_PRIORITY: Record<string, number> = { failed: 0, needs_decision: 1, inconclusive: 2 };

export function computeOutcomeScorecard(input: {
  experimentId: string;
  projectId: string;
  decisionStatus?: string;
  selectedCandidateId?: string;
  benchmark?: AgentBenchmarkResult | null;
}): ExperimentOutcomeScorecard {
  const { experimentId, projectId, selectedCandidateId, benchmark } = input;
  const decisionStatus = ((): OutcomeDecisionStatus => {
    const d = input.decisionStatus;
    return d === "selected" || d === "needs_fix" || d === "no_clear_winner" ? d : "undecided";
  })();

  const hasBenchmark = Boolean(benchmark);
  const hasSelectedCandidate = Boolean(selectedCandidateId);
  const hasDecision = decisionStatus !== "undecided";

  // The candidate the scorecard is about: the selected one, else the benchmark's
  // blocker basis (winner / top-ranked), else the first candidate.
  const basisId =
    selectedCandidateId ??
    benchmark?.recommendation?.winnerCandidateId ??
    benchmark?.blockerBasisCandidateId ??
    benchmark?.candidates?.[0]?.id;

  const metrics = basisId ? benchmark?.metricsByCandidate?.[basisId] : undefined;
  const itemOutcomes = basisId ? benchmark?.itemOutcomesByCandidate?.[basisId] : undefined;
  const hasItemLevelEvidence = Array.isArray(itemOutcomes) && itemOutcomes.length > 0;
  const acceptanceSetAligned = benchmark?.acceptanceSetAlignment?.aligned;

  const passed = metrics?.passed ?? 0;
  const failed = metrics?.failed ?? 0;
  const needsDecisionCount = metrics?.needsDecision ?? 0;
  const notVerifiedCount = metrics?.inconclusive ?? 0;
  const totalItems = metrics?.totalItems ?? 0;
  const criticalIssueCount = failed + needsDecisionCount;
  const acceptancePassRate = metrics && totalItems > 0 ? passed / totalItems : null;

  // Non-passed item outcomes for the basis candidate → blockers + focus items.
  const nonPassed = hasItemLevelEvidence ? itemOutcomes!.filter((o) => o.status !== "passed") : [];
  const unresolvedBlockerCount = hasItemLevelEvidence
    ? nonPassed.length
    : metrics
      ? Math.max(0, totalItems - passed)
      : 0;
  const evidenceCoveredCount = hasItemLevelEvidence ? itemOutcomes!.filter((o) => o.evidence).length : 0;
  const evidenceCoverageRate = hasItemLevelEvidence ? evidenceCoveredCount / itemOutcomes!.length : null;

  const suggestedFocusItemIds = [...nonPassed]
    .sort((a, b) => (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9))
    .slice(0, 5)
    .map((o) => o.itemId);

  const score = passed * 3 - failed * 3 - needsDecisionCount * 2 - notVerifiedCount * 1 + evidenceCoveredCount * 0.5;

  // ── Grade ──
  let grade: OutcomeGrade;
  if (!hasBenchmark || !hasSelectedCandidate || totalItems === 0 || acceptancePassRate === null) {
    grade = "inconclusive";
  } else if (acceptancePassRate >= 0.85 && criticalIssueCount === 0 && notVerifiedCount <= 1) {
    grade = "strong";
  } else if (acceptancePassRate >= 0.65 && criticalIssueCount <= 1) {
    grade = "promising";
  } else {
    grade = "needs_work";
  }

  // ── Reasons (multiple may apply) ──
  const reasons: EvolutionReason[] = [];
  if (!hasBenchmark) reasons.push("missing_benchmark");
  if (!hasSelectedCandidate) reasons.push("missing_selected_candidate");
  if (acceptanceSetAligned === false) reasons.push("acceptance_set_misaligned");
  if (grade === "strong") reasons.push("strong_acceptance_result");
  if (unresolvedBlockerCount > 0) reasons.push("selected_candidate_has_remaining_blockers");
  if (notVerifiedCount >= HIGH_NOT_VERIFIED) reasons.push("high_not_verified_count");

  // ── Recommended next action (first matching rule) ──
  let recommendedAction: EvolutionAction;
  if (!hasBenchmark) {
    recommendedAction = "create_benchmark";
  } else if (!hasSelectedCandidate) {
    recommendedAction = notVerifiedCount >= HIGH_NOT_VERIFIED ? "clarify_acceptance_items" : "rerun_experiment";
  } else if (acceptanceSetAligned === false) {
    recommendedAction = "clarify_acceptance_items";
  } else if (grade === "strong") {
    recommendedAction = "accept";
  } else if (unresolvedBlockerCount > 0) {
    recommendedAction = "fix_selected";
  } else if (notVerifiedCount >= HIGH_NOT_VERIFIED) {
    recommendedAction = "clarify_acceptance_items";
  } else if (criticalIssueCount >= HIGH_CRITICAL) {
    recommendedAction = "rerun_experiment";
  } else {
    recommendedAction = "accept";
  }

  return {
    experimentId,
    projectId,
    selectedCandidateId,
    decisionStatus,
    quality: {
      acceptancePassRate,
      unresolvedBlockerCount,
      criticalIssueCount,
      notVerifiedCount,
      needsDecisionCount,
      evidenceCoverageRate,
      score,
      grade,
    },
    signals: {
      hasBenchmark,
      hasDecision,
      hasSelectedCandidate,
      hasItemLevelEvidence,
      acceptanceSetAligned,
    },
    nextEvolution: {
      recommendedAction,
      reasons,
      suggestedFocusItemIds,
    },
  };
}

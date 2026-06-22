/**
 * workspace/evolution-impact.ts — Stage 79
 *
 * Deterministic Before/After Evolution Impact comparison for a saved Evolution
 * Action Pack. Reads ONLY acceptance results already produced by the original
 * benchmark / review run AND the follow-up benchmark / review run linked in
 * Stage 78 — no LLM judgement, no agent execution, no network, no randomness.
 *
 * Stage 75 outcome scorecard formula unchanged. Impact is computed on demand
 * (no persistence in Stage 79; the comparison formula will keep evolving).
 */
import type {
  AgentBenchmarkResult,
  ReviewItemInput,
} from "./agent-benchmark.js";

export type EvolutionImpactVerdict = "improved" | "regressed" | "unchanged" | "inconclusive";

export type EvolutionImpactReason =
  | "pass_rate_increased"
  | "critical_issues_decreased"
  | "blockers_decreased"
  | "not_verified_decreased"
  | "pass_rate_decreased"
  | "critical_issues_increased"
  | "blockers_increased"
  | "missing_followup"
  | "missing_before"
  | "missing_after"
  | "different_acceptance_set"
  | "mixed_signals";

export type EvolutionImpactSource = "benchmark" | "review_run";

export type EvolutionImpactSnapshot = {
  source: EvolutionImpactSource;
  sourceId: string;
  passRate: number | null;
  passedCount: number;
  failedCount: number;
  inconclusiveCount: number;
  needsDecisionCount: number;
  criticalIssueCount: number;
  notVerifiedCount: number;
  blockerCount: number;
  totalCount: number;
  /** Sorted list of acceptance-item IDs when item-level data is available. */
  itemIds?: string[];
};

export type EvolutionImpactDelta = {
  passRateDelta: number | null;
  passedDelta: number;
  criticalIssueDelta: number;
  notVerifiedDelta: number;
  blockerDelta: number;
};

export type EvolutionImpactComparison = {
  actionPackId: string;
  experimentId: string;
  projectId: string;
  recommendedAction: string;
  before: EvolutionImpactSnapshot | null;
  after: EvolutionImpactSnapshot | null;
  delta: EvolutionImpactDelta | null;
  verdict: EvolutionImpactVerdict;
  reasons: EvolutionImpactReason[];
  limitations: string[];
};

const KNOWN_ITEM_STATUSES = new Set(["passed", "failed", "inconclusive", "needs_decision"]);

function pickCandidateId(
  benchmark: AgentBenchmarkResult,
  selectedCandidateId?: string,
  packTargetCandidateId?: string,
): string | undefined {
  return (
    selectedCandidateId ??
    packTargetCandidateId ??
    benchmark.recommendation?.winnerCandidateId ??
    benchmark.blockerBasisCandidateId ??
    benchmark.candidates?.[0]?.id
  );
}

/** Sorted unique item ids extracted from a benchmark candidate's outcomes. */
function itemIdsFromBenchmark(
  benchmark: AgentBenchmarkResult,
  candidateId: string,
): string[] | undefined {
  const outcomes = benchmark.itemOutcomesByCandidate?.[candidateId];
  if (!outcomes || outcomes.length === 0) return undefined;
  const ids = outcomes.map((o) => o.itemId).filter((id): id is string => typeof id === "string");
  if (!ids.length) return undefined;
  return [...new Set(ids)].sort();
}

/** Build a snapshot from a benchmark + the target candidate (basis/winner/selected). */
export function snapshotFromBenchmark(
  benchmark: AgentBenchmarkResult,
  args: {
    sourceId: string;
    selectedCandidateId?: string;
    packTargetCandidateId?: string;
  },
): EvolutionImpactSnapshot | null {
  const candidateId = pickCandidateId(benchmark, args.selectedCandidateId, args.packTargetCandidateId);
  if (!candidateId) return null;
  const metrics = benchmark.metricsByCandidate?.[candidateId];
  if (!metrics) return null;
  const blockerCount = metrics.failed + metrics.needsDecision + metrics.inconclusive;
  return {
    source: "benchmark",
    sourceId: args.sourceId,
    passRate: metrics.totalItems > 0 ? metrics.passed / metrics.totalItems : null,
    passedCount: metrics.passed,
    failedCount: metrics.failed,
    inconclusiveCount: metrics.inconclusive,
    needsDecisionCount: metrics.needsDecision,
    criticalIssueCount: metrics.criticalIssueCount,
    notVerifiedCount: metrics.notVerifiedCount,
    blockerCount,
    totalCount: metrics.totalItems,
    itemIds: itemIdsFromBenchmark(benchmark, candidateId),
  };
}

/** Build a snapshot from a review-run resultJson by counting item statuses. */
export function snapshotFromReviewRun(
  resultJson: string | null | undefined,
  args: { sourceId: string },
): EvolutionImpactSnapshot | null {
  if (!resultJson) return null;
  let parsed: { results?: unknown; summary?: unknown };
  try {
    parsed = JSON.parse(resultJson) as { results?: unknown; summary?: unknown };
  } catch {
    return null;
  }
  const items: ReviewItemInput[] = Array.isArray(parsed.results)
    ? (parsed.results as ReviewItemInput[])
    : [];
  if (items.length === 0) return null;

  let passed = 0;
  let failed = 0;
  let inconclusive = 0;
  let needsDecision = 0;
  const ids: string[] = [];
  for (const it of items) {
    const status = typeof it.status === "string" ? it.status : "";
    if (!KNOWN_ITEM_STATUSES.has(status)) continue;
    if (status === "passed") passed += 1;
    else if (status === "failed") failed += 1;
    else if (status === "inconclusive") inconclusive += 1;
    else if (status === "needs_decision") needsDecision += 1;
    if (typeof it.itemId === "string" && it.itemId) ids.push(it.itemId);
  }
  const totalCount = passed + failed + inconclusive + needsDecision;
  if (totalCount === 0) return null;
  const criticalIssueCount = failed + needsDecision;
  const notVerifiedCount = inconclusive;
  const blockerCount = failed + needsDecision + inconclusive;
  const itemIds = ids.length > 0 ? [...new Set(ids)].sort() : undefined;
  return {
    source: "review_run",
    sourceId: args.sourceId,
    passRate: passed / totalCount,
    passedCount: passed,
    failedCount: failed,
    inconclusiveCount: inconclusive,
    needsDecisionCount: needsDecision,
    criticalIssueCount,
    notVerifiedCount,
    blockerCount,
    totalCount,
    itemIds,
  };
}

function computeDelta(
  before: EvolutionImpactSnapshot,
  after: EvolutionImpactSnapshot,
): EvolutionImpactDelta {
  const passRateDelta =
    before.passRate === null || after.passRate === null
      ? null
      : after.passRate - before.passRate;
  return {
    passRateDelta,
    passedDelta: after.passedCount - before.passedCount,
    criticalIssueDelta: after.criticalIssueCount - before.criticalIssueCount,
    notVerifiedDelta: after.notVerifiedCount - before.notVerifiedCount,
    blockerDelta: after.blockerCount - before.blockerCount,
  };
}

function sameIdSet(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a || !b) return true; // No item-level data on one side → skip the alignment check.
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Pure verdict from a before/after pair. The route handler stitches before/after
 * loading + ownership; this is the deterministic comparison so tests can assert
 * the formula directly.
 */
export function buildImpactComparison(args: {
  actionPackId: string;
  experimentId: string;
  projectId: string;
  recommendedAction: string;
  before: EvolutionImpactSnapshot | null;
  after: EvolutionImpactSnapshot | null;
  limitations?: string[];
}): EvolutionImpactComparison {
  const { actionPackId, experimentId, projectId, recommendedAction, before, after } = args;
  const limitations = [...(args.limitations ?? [])];
  const reasons: EvolutionImpactReason[] = [];

  if (!before && !after) {
    reasons.push("missing_followup", "missing_before");
    return {
      actionPackId,
      experimentId,
      projectId,
      recommendedAction,
      before: null,
      after: null,
      delta: null,
      verdict: "inconclusive",
      reasons,
      limitations,
    };
  }
  if (!before) {
    reasons.push("missing_before");
    return {
      actionPackId,
      experimentId,
      projectId,
      recommendedAction,
      before: null,
      after,
      delta: null,
      verdict: "inconclusive",
      reasons,
      limitations,
    };
  }
  if (!after) {
    reasons.push("missing_after", "missing_followup");
    return {
      actionPackId,
      experimentId,
      projectId,
      recommendedAction,
      before,
      after: null,
      delta: null,
      verdict: "inconclusive",
      reasons,
      limitations,
    };
  }

  // Acceptance-set alignment guard. Only applies when BOTH sides expose item IDs.
  if (!sameIdSet(before.itemIds, after.itemIds)) {
    reasons.push("different_acceptance_set");
    return {
      actionPackId,
      experimentId,
      projectId,
      recommendedAction,
      before,
      after,
      delta: computeDelta(before, after),
      verdict: "inconclusive",
      reasons,
      limitations,
    };
  }

  const delta = computeDelta(before, after);

  // Improvement signals (per spec): passRate up, critical down, blockers down, not-verified down.
  if (delta.passRateDelta !== null && delta.passRateDelta > 0) reasons.push("pass_rate_increased");
  if (delta.criticalIssueDelta < 0) reasons.push("critical_issues_decreased");
  if (delta.blockerDelta < 0) reasons.push("blockers_decreased");
  if (delta.notVerifiedDelta < 0) reasons.push("not_verified_decreased");
  // Regression signals (per spec): passRate down, critical up, blockers up. (notVerified UP not counted.)
  if (delta.passRateDelta !== null && delta.passRateDelta < 0) reasons.push("pass_rate_decreased");
  if (delta.criticalIssueDelta > 0) reasons.push("critical_issues_increased");
  if (delta.blockerDelta > 0) reasons.push("blockers_increased");

  const hasImprovement =
    (delta.passRateDelta !== null && delta.passRateDelta > 0) ||
    delta.criticalIssueDelta < 0 ||
    delta.blockerDelta < 0 ||
    delta.notVerifiedDelta < 0;
  const hasRegression =
    (delta.passRateDelta !== null && delta.passRateDelta < 0) ||
    delta.criticalIssueDelta > 0 ||
    delta.blockerDelta > 0;

  let verdict: EvolutionImpactVerdict;
  if (hasImprovement && hasRegression) {
    reasons.push("mixed_signals");
    verdict = "inconclusive";
  } else if (hasImprovement) {
    verdict = "improved";
  } else if (hasRegression) {
    verdict = "regressed";
  } else {
    verdict = "unchanged";
  }

  return {
    actionPackId,
    experimentId,
    projectId,
    recommendedAction,
    before,
    after,
    delta,
    verdict,
    reasons,
    limitations,
  };
}

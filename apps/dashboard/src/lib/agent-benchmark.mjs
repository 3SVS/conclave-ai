// Stage 64 — Multi-Agent Build Benchmark (deterministic, dashboard-side).
//
// Pure, locale-agnostic comparison of existing PR review runs as build
// candidates. NO agent execution, NO network, NO LLM judgement — the
// comparison is grounded entirely in acceptance results (passed / failed /
// inconclusive / needs_decision) already produced by review runs.
//
// Design decision (Stage 64): the calculation lives in the dashboard rather
// than central-plane because every input it needs (per-run summary counts) is
// already available client-side via the existing review-history endpoint, the
// logic is pure and unit-testable with `node --test`, and candidate selection
// is inherently a UI concern. The functions are intentionally free of any
// dashboard/React imports so they can be lifted verbatim into central-plane in
// a later stage when persisted, cross-device benchmark history is needed.
//
// rationale/blockers are returned as STRUCTURED items (not pre-formatted
// strings) so the UI can localize them via the i18n dictionary. This is a
// deliberate deviation from a `string[]` shape — formatting English into the
// pure layer would break the EN/KO toggle.

/** Candidate modes — how the implementation was produced. */
export const CANDIDATE_MODES = ["single_agent", "multi_agent", "reviewer_agent", "hybrid"];

/** Candidate sources — which tool produced the implementation. */
export const CANDIDATE_SOURCES = ["claude_code", "codex", "cursor", "manual", "other"];

/** Minimum / maximum candidates for a saveable benchmark. */
export const MIN_CANDIDATES = 2;
export const MAX_CANDIDATES = 5;

/** Whether a benchmark with this many candidates can be saved (2–5). */
export function canSaveBenchmark(candidateCount) {
  return candidateCount >= MIN_CANDIDATES && candidateCount <= MAX_CANDIDATES;
}

/** Coerce to a non-negative integer; undefined/NaN/negatives become 0. */
function count(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Compute deterministic acceptance metrics for one candidate from its review
 * summary counts. Missing counts are treated as 0 (a run with no recorded
 * results contributes zeros, never throws).
 *
 * score = passed*3 - failed*3 - needs_decision*2 - inconclusive*1
 */
export function computeCandidateMetrics(counts) {
  const passed = count(counts?.passed);
  const failed = count(counts?.failed);
  const inconclusive = count(counts?.inconclusive);
  const needsDecision = count(counts?.needsDecision);

  const totalItems = passed + failed + inconclusive + needsDecision;
  const acceptancePassRate = totalItems > 0 ? passed / totalItems : 0;
  const criticalIssueCount = failed + needsDecision;
  const notVerifiedCount = inconclusive;
  const score = passed * 3 - failed * 3 - needsDecision * 2 - inconclusive * 1;

  return {
    totalItems,
    passed,
    failed,
    inconclusive,
    needsDecision,
    acceptancePassRate,
    criticalIssueCount,
    notVerifiedCount,
    score,
  };
}

/**
 * Rank candidates best-first. Deterministic ordering:
 *   1. higher score
 *   2. higher acceptance pass rate
 *   3. fewer critical issues (failed + needs_decision)
 *   4. fewer not-verified (inconclusive)
 *   5. candidate id (stable final tiebreak)
 * Returns an array of { candidate, metrics }.
 */
export function rankCandidates(candidates, metricsByCandidate) {
  return [...(candidates ?? [])]
    .map((candidate) => ({
      candidate,
      metrics: metricsByCandidate[candidate.id] ?? computeCandidateMetrics(undefined),
    }))
    .sort((a, b) => {
      if (b.metrics.score !== a.metrics.score) return b.metrics.score - a.metrics.score;
      if (b.metrics.acceptancePassRate !== a.metrics.acceptancePassRate)
        return b.metrics.acceptancePassRate - a.metrics.acceptancePassRate;
      if (a.metrics.criticalIssueCount !== b.metrics.criticalIssueCount)
        return a.metrics.criticalIssueCount - b.metrics.criticalIssueCount;
      if (a.metrics.notVerifiedCount !== b.metrics.notVerifiedCount)
        return a.metrics.notVerifiedCount - b.metrics.notVerifiedCount;
      return String(a.candidate.id).localeCompare(String(b.candidate.id));
    });
}

/**
 * "No clear winner" when the top two are effectively tied:
 *   score difference <= 1 AND same pass rate AND same critical issue count.
 */
function isTooClose(top, runnerUp) {
  return (
    Math.abs(top.metrics.score - runnerUp.metrics.score) <= 1 &&
    top.metrics.acceptancePassRate === runnerUp.metrics.acceptancePassRate &&
    top.metrics.criticalIssueCount === runnerUp.metrics.criticalIssueCount
  );
}

/** Structured blockers for one ranked entry, or null if it has none. */
function blockerFor(entry) {
  const { failed, needsDecision, inconclusive } = entry.metrics;
  if (failed + needsDecision + inconclusive === 0) return null;
  return {
    candidateId: entry.candidate.id,
    candidateLabel: entry.candidate.label,
    failed,
    needsDecision,
    inconclusive,
  };
}

/**
 * Build the full deterministic benchmark result, including the recommendation.
 * `countsByCandidate` maps candidate id → { passed, failed, inconclusive,
 * needsDecision } (typically a review run's summary). Returns the spec's
 * AgentBenchmarkResult, with structured rationale/blockers for i18n.
 *
 * A recommendation requires at least 2 candidates. With fewer, recommendation
 * is omitted and the UI shows its "need more candidates" empty state.
 */
export function buildBenchmarkResult({ projectId, candidates, countsByCandidate }) {
  const list = candidates ?? [];
  const metricsByCandidate = {};
  for (const c of list) {
    metricsByCandidate[c.id] = computeCandidateMetrics((countsByCandidate ?? {})[c.id]);
  }

  /** @type {{ projectId: string, candidates: unknown[], metricsByCandidate: Record<string, unknown>, recommendation?: unknown }} */
  const result = { projectId, candidates: list, metricsByCandidate };

  if (list.length < 2) return result;

  const ranked = rankCandidates(list, metricsByCandidate);
  const top = ranked[0];
  const runnerUp = ranked[1];

  const blockers = ranked.map(blockerFor).filter(Boolean);

  if (isTooClose(top, runnerUp)) {
    result.recommendation = {
      winnerCandidateId: undefined,
      rationale: [{ code: "no_clear_winner" }],
      blockers,
    };
    return result;
  }

  const rationale = [
    {
      code: "pass_comparison",
      winnerLabel: top.candidate.label,
      winnerPassed: top.metrics.passed,
      winnerTotal: top.metrics.totalItems,
      runnerLabel: runnerUp.candidate.label,
      runnerPassed: runnerUp.metrics.passed,
      runnerTotal: runnerUp.metrics.totalItems,
    },
  ];
  if (top.metrics.criticalIssueCount < runnerUp.metrics.criticalIssueCount) {
    rationale.push({
      code: "fewer_critical",
      winnerLabel: top.candidate.label,
      runnerLabel: runnerUp.candidate.label,
    });
  }
  if (runnerUp.metrics.notVerifiedCount > 0) {
    rationale.push({
      code: "runner_not_verified",
      runnerLabel: runnerUp.candidate.label,
      count: runnerUp.metrics.notVerifiedCount,
    });
  }

  result.recommendation = {
    winnerCandidateId: top.candidate.id,
    rationale,
    blockers,
  };
  return result;
}

/** Sorted unique item ids — compare acceptance sets order-independently. */
function normalizedSet(ids) {
  return [...new Set((ids ?? []).map(String))].sort();
}

/**
 * Same-acceptance-set guard. Candidates whose review run covered a different
 * set of acceptance items are not directly comparable; flag misalignment so
 * the UI can warn. Baseline = the first candidate's set. Mirrors central-plane
 * `computeAcceptanceSetAlignment` (kept in lock-step by the shared golden
 * fixture).
 */
export function computeAcceptanceSetAlignment(candidates, selectedItemIdsByCandidate) {
  const list = candidates ?? [];
  if (list.length < 2) return { aligned: true };

  const baseline = normalizedSet((selectedItemIdsByCandidate ?? {})[list[0].id]);
  const baselineKey = baseline.join(" ");

  const differingCandidateIds = [];
  for (const c of list) {
    const key = normalizedSet((selectedItemIdsByCandidate ?? {})[c.id]).join(" ");
    if (key !== baselineKey) differingCandidateIds.push(c.id);
  }

  if (differingCandidateIds.length === 0) {
    return { aligned: true, baselineItemIds: baseline };
  }
  return {
    aligned: false,
    warning: "acceptance_set_mismatch",
    baselineItemIds: baseline,
    differingCandidateIds,
  };
}

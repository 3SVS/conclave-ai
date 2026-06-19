/**
 * workspace/agent-benchmark.ts — Stage 65
 *
 * CANONICAL deterministic Multi-Agent Build Benchmark logic. This is the
 * source of truth for saved benchmarks; the dashboard keeps a mirror in
 * `apps/dashboard/src/lib/agent-benchmark.mjs` for client-side preview only.
 * The two implementations are kept in lock-step by a shared golden fixture
 * (apps/central-plane/test/fixtures/agent-benchmark-golden.json) asserted by
 * both test suites — change one, change the other, or the fixture test fails.
 *
 * NO agent execution, NO network, NO LLM judgement. The comparison is grounded
 * entirely in acceptance results already produced by review runs.
 */

export type CandidateMode = "single_agent" | "multi_agent" | "reviewer_agent" | "hybrid";
export type CandidateSource = "claude_code" | "codex" | "cursor" | "manual" | "other";

export const CANDIDATE_MODES: CandidateMode[] = ["single_agent", "multi_agent", "reviewer_agent", "hybrid"];
export const CANDIDATE_SOURCES: CandidateSource[] = ["claude_code", "codex", "cursor", "manual", "other"];

export type AgentCandidate = {
  id: string;
  label: string;
  mode: CandidateMode;
  source: CandidateSource;
  pullRequestNumber?: number;
  reviewRunId?: string;
  notes?: string;
};

export type ReviewSummaryCounts = {
  passed?: number;
  failed?: number;
  inconclusive?: number;
  needsDecision?: number;
};

export type AgentCandidateMetrics = {
  totalItems: number;
  passed: number;
  failed: number;
  inconclusive: number;
  needsDecision: number;
  acceptancePassRate: number;
  criticalIssueCount: number;
  notVerifiedCount: number;
  score: number;
};

export type BenchmarkRationaleItem =
  | {
      code: "pass_comparison";
      winnerLabel: string;
      winnerPassed: number;
      winnerTotal: number;
      runnerLabel: string;
      runnerPassed: number;
      runnerTotal: number;
    }
  | { code: "fewer_critical"; winnerLabel: string; runnerLabel: string }
  | { code: "runner_not_verified"; runnerLabel: string; count: number }
  | { code: "no_clear_winner" };

export type BenchmarkBlockerItem = {
  candidateId: string;
  candidateLabel: string;
  failed: number;
  needsDecision: number;
  inconclusive: number;
};

export type AgentBenchmarkRecommendation = {
  winnerCandidateId?: string;
  rationale: BenchmarkRationaleItem[];
  blockers: BenchmarkBlockerItem[];
};

export type AcceptanceSetAlignment = {
  aligned: boolean;
  warning?: string;
  baselineItemIds?: string[];
  differingCandidateIds?: string[];
};

export type AgentBenchmarkResult = {
  projectId: string;
  candidates: AgentCandidate[];
  metricsByCandidate: Record<string, AgentCandidateMetrics>;
  recommendation?: AgentBenchmarkRecommendation;
  acceptanceSetAlignment?: AcceptanceSetAlignment;
};

export type RankedCandidate = { candidate: AgentCandidate; metrics: AgentCandidateMetrics };

/** Coerce to a non-negative integer; undefined/NaN/negatives become 0. */
function count(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Deterministic acceptance metrics for one candidate.
 * score = passed*3 - failed*3 - needs_decision*2 - inconclusive*1
 */
export function computeCandidateMetrics(counts: ReviewSummaryCounts | undefined | null): AgentCandidateMetrics {
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

/** Rank best-first: score → pass rate → fewer critical → fewer not-verified → id. */
export function rankCandidates(
  candidates: AgentCandidate[],
  metricsByCandidate: Record<string, AgentCandidateMetrics>,
): RankedCandidate[] {
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

/** No clear winner when score diff <= 1 AND same pass rate AND same critical count. */
function isTooClose(top: RankedCandidate, runnerUp: RankedCandidate): boolean {
  return (
    Math.abs(top.metrics.score - runnerUp.metrics.score) <= 1 &&
    top.metrics.acceptancePassRate === runnerUp.metrics.acceptancePassRate &&
    top.metrics.criticalIssueCount === runnerUp.metrics.criticalIssueCount
  );
}

function blockerFor(entry: RankedCandidate): BenchmarkBlockerItem | null {
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
 * Build the deterministic benchmark result (metrics + recommendation).
 * A recommendation requires at least 2 candidates.
 */
export function buildBenchmarkResult(input: {
  projectId: string;
  candidates: AgentCandidate[];
  countsByCandidate: Record<string, ReviewSummaryCounts>;
}): AgentBenchmarkResult {
  const { projectId, candidates, countsByCandidate } = input;
  const list = candidates ?? [];
  const metricsByCandidate: Record<string, AgentCandidateMetrics> = {};
  for (const c of list) {
    metricsByCandidate[c.id] = computeCandidateMetrics((countsByCandidate ?? {})[c.id]);
  }

  const result: AgentBenchmarkResult = { projectId, candidates: list, metricsByCandidate };

  if (list.length < 2) return result;

  const ranked = rankCandidates(list, metricsByCandidate);
  const top = ranked[0]!;
  const runnerUp = ranked[1]!;
  const blockers = ranked.map(blockerFor).filter((b): b is BenchmarkBlockerItem => b !== null);

  if (isTooClose(top, runnerUp)) {
    result.recommendation = {
      winnerCandidateId: undefined,
      rationale: [{ code: "no_clear_winner" }],
      blockers,
    };
    return result;
  }

  const rationale: BenchmarkRationaleItem[] = [
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
    rationale.push({ code: "fewer_critical", winnerLabel: top.candidate.label, runnerLabel: runnerUp.candidate.label });
  }
  if (runnerUp.metrics.notVerifiedCount > 0) {
    rationale.push({ code: "runner_not_verified", runnerLabel: runnerUp.candidate.label, count: runnerUp.metrics.notVerifiedCount });
  }

  result.recommendation = { winnerCandidateId: top.candidate.id, rationale, blockers };
  return result;
}

/** Sorted unique item ids — used to compare acceptance sets order-independently. */
function normalizedSet(ids: string[] | undefined | null): string[] {
  return [...new Set((ids ?? []).map(String))].sort();
}

/**
 * Same-acceptance-set guard. Candidates whose review run covered a different
 * set of acceptance items are not directly comparable; we flag misalignment so
 * the UI can warn. Baseline = the first candidate's set.
 */
export function computeAcceptanceSetAlignment(
  candidates: AgentCandidate[],
  selectedItemIdsByCandidate: Record<string, string[]>,
): AcceptanceSetAlignment {
  const list = candidates ?? [];
  if (list.length < 2) return { aligned: true };

  const baseline = normalizedSet(selectedItemIdsByCandidate[list[0]!.id]);
  const baselineKey = baseline.join(" ");

  const differingCandidateIds: string[] = [];
  for (const c of list) {
    const key = normalizedSet(selectedItemIdsByCandidate[c.id]).join(" ");
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

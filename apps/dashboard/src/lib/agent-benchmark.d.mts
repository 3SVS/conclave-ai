// Type declarations for agent-benchmark.mjs (Stage 64).

export type CandidateMode = "single_agent" | "multi_agent" | "reviewer_agent" | "hybrid";
export type CandidateSource = "claude_code" | "codex" | "cursor" | "manual" | "other";

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

// Structured rationale/blockers (deviation from the spec's string[]): the UI
// localizes these via the i18n dictionary instead of embedding English here.
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

export type AgentBenchmarkResult = {
  projectId: string;
  candidates: AgentCandidate[];
  metricsByCandidate: Record<string, AgentCandidateMetrics>;
  recommendation?: AgentBenchmarkRecommendation;
};

export type RankedCandidate = { candidate: AgentCandidate; metrics: AgentCandidateMetrics };

export const CANDIDATE_MODES: CandidateMode[];
export const CANDIDATE_SOURCES: CandidateSource[];

export function computeCandidateMetrics(counts: ReviewSummaryCounts | undefined | null): AgentCandidateMetrics;
export function rankCandidates(
  candidates: AgentCandidate[],
  metricsByCandidate: Record<string, AgentCandidateMetrics>,
): RankedCandidate[];
export function buildBenchmarkResult(input: {
  projectId: string;
  candidates: AgentCandidate[];
  countsByCandidate: Record<string, ReviewSummaryCounts>;
}): AgentBenchmarkResult;

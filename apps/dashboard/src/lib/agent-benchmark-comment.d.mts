// Type declarations for agent-benchmark-comment.mjs (Stage 67).
import type { AgentCandidate } from "./agent-benchmark.mjs";

export type BenchmarkPrTarget = { canPost: true; prNumber: number } | { canPost: false };

export function resolveBenchmarkPrTarget(candidates: AgentCandidate[]): BenchmarkPrTarget;

export type BenchmarkCommentColumns = {
  candidate: string;
  mode: string;
  passed: string;
  critical: string;
  notVerified: string;
  score: string;
};

export type BenchmarkCommentRow = {
  label: string;
  mode: string;
  passed: number;
  total: number;
  critical: number;
  notVerified: number;
  score: number;
};

export type BenchmarkPrCommentParts = {
  heading: string;
  intro: string;
  alignmentWarning?: string | null;
  recommendationLabel: string;
  recommendationValue: string;
  noClearWinnerBody?: string | null;
  columns: BenchmarkCommentColumns;
  rows?: BenchmarkCommentRow[];
  whyHeading: string;
  whyLines?: string[];
  blockersHeading: string;
  blockerLines?: string[];
  noBlockersLine: string;
  noteHeading: string;
  noteText: string;
};

export function buildBenchmarkPrCommentMarkdown(parts: BenchmarkPrCommentParts): string;

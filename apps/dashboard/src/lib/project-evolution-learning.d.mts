// Type declarations for project-evolution-learning.mjs (Stage 81).
import type {
  ProjectEvolutionLearningSignals,
  ProjectLearningSignal,
} from "./workspace-experiment-api";

export function topSignalLabelKey(signal: ProjectLearningSignal | null | undefined): string;
export function formatRatePercent(value: number | null | undefined): string;
export function formatAverageDeltaPercent(value: number | null | undefined): string;
export function formatAverageDeltaCount(value: number | null | undefined): string;
export function learningHasNoData(
  learning: ProjectEvolutionLearningSignals | null | undefined,
): boolean;

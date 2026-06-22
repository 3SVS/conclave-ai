// Type declarations for evolution-impact.mjs (Stage 79).
import type { EvolutionImpactComparison } from "./workspace-experiment-api";

export type ImpactVerdict = "improved" | "regressed" | "unchanged" | "inconclusive";

export const IMPACT_VERDICTS: ImpactVerdict[];

export function impactVerdictLabelKey(verdict: ImpactVerdict | string | null | undefined): string;
export function impactReasonLabelKey(reason: string | null | undefined): string;

export function formatDeltaInt(value: number | null | undefined): string;
export function formatDeltaPercent(value: number | null | undefined): string;
export function formatRate(value: number | null | undefined): string;
export function isImpactEmpty(impact: EvolutionImpactComparison | null | undefined): boolean;

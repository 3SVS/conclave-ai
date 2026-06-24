// Stage 174 — types for stamp-thinking.mjs (Simsa review-stamp thinking/loading).

export type StampThinkingVariant = "compact" | "panel";

export type StampThinkingInput = {
  variant?: StampThinkingVariant | string;
  label?: string;
  stepLabels?: string[];
};

export type StampThinkingDot = { index: number; delayMs: number };

export type StampThinkingA11y = {
  role: "status";
  ariaLive: "polite";
  ariaBusy: true;
};

export type StampThinkingConfig = {
  variant: StampThinkingVariant;
  dotCount: number;
  dots: StampThinkingDot[];
  label: string;
  showVisibleLabel: boolean;
  a11y: StampThinkingA11y;
};

export type StampThinkingLoadingDictionary = {
  reviewingEvidence?: string;
  preparingAcceptance?: string;
  checkingSignals?: string;
  markingCheckpoints?: string;
  stampingTrace?: string;
  finalizingReview?: string;
};

export const STAMP_THINKING_VARIANTS: StampThinkingVariant[];
export const DEFAULT_STAMP_LABEL: string;
export function resolveStampThinking(input?: StampThinkingInput): StampThinkingConfig;
export function getDefaultStampThinkingSteps(
  loadingDictionary?: StampThinkingLoadingDictionary | Record<string, unknown>,
): string[];

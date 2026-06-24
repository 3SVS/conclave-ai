// Stage 174 — Simsa review-stamp ("심사 도장") thinking/loading: pure, deterministic config.
//
// React-free so it is testable under `node --test test/*.test.mjs` (the dashboard's
// test runner). SimsaStampThinking.tsx renders from this config. The motion reads as a
// reviewer pressing a review stamp after checking evidence — NOT an "approved" or
// "certified" stamp. Ink-red uses the existing Tailwind `brand` (oxblood) tokens — no
// new color system. (Supersedes the Stage 160~166 wax-seal metaphor.)

export const STAMP_THINKING_VARIANTS = ["compact", "panel"];
export const DEFAULT_STAMP_LABEL = "Reviewing evidence…";

const DOT_COUNT = { compact: 3, panel: 5 };
const DOT_BASE_DELAY_MS = 0;
const DOT_STEP_MS = 200; // inter-checkpoint cadence (planned 180–240ms)

function str(x) {
  return typeof x === "string" ? x : "";
}

/**
 * Resolve a deterministic render config for the stamp-thinking component.
 * @param {import("./stamp-thinking.d.mts").StampThinkingInput} [input]
 * @returns {import("./stamp-thinking.d.mts").StampThinkingConfig}
 */
export function resolveStampThinking(input = {}) {
  const i = input && typeof input === "object" ? input : {};
  const variant = STAMP_THINKING_VARIANTS.includes(str(i.variant)) ? str(i.variant) : "compact";
  const dotCount = DOT_COUNT[variant];

  const steps = Array.isArray(i.stepLabels)
    ? i.stepLabels.map((s) => str(s).trim()).filter(Boolean)
    : [];
  const labelProp = str(i.label).trim();
  // Precedence (Stage 162): explicit label → first stepLabel → default. Cycling of
  // step labels over time is deferred to a later stage.
  const label = labelProp || (steps.length ? steps[0] : DEFAULT_STAMP_LABEL);

  // Evidence checkpoints (not wax droplets): sequential marks that settle around the stamp.
  const dots = Array.from({ length: dotCount }, (_, index) => ({
    index,
    delayMs: DOT_BASE_DELAY_MS + index * DOT_STEP_MS,
  }));

  return {
    variant,
    dotCount,
    dots,
    label,
    // panel always shows the label; compact keeps it screen-reader accessible.
    showVisibleLabel: variant === "panel",
    a11y: { role: "status", ariaLive: "polite", ariaBusy: true },
  };
}

// Ordered review step labels, in the order a review progresses. Accepts the `loading`
// dictionary object (so this stays decoupled from the i18n module) and drops any
// missing/blank entries. Used to feed `stepLabels` into SimsaStampThinking. The wording
// describes reviewing evidence and leaving a review trace — never "approved"/"certified".
const DEFAULT_STEP_KEYS = [
  "reviewingEvidence",
  "preparingAcceptance",
  "checkingSignals",
  "markingCheckpoints",
  "stampingTrace",
  "finalizingReview",
];

/**
 * @param {Record<string, unknown>} [loadingDictionary]
 * @returns {string[]}
 */
export function getDefaultStampThinkingSteps(loadingDictionary) {
  const d = loadingDictionary && typeof loadingDictionary === "object" ? loadingDictionary : {};
  return DEFAULT_STEP_KEYS.map((k) => str(d[k]).trim()).filter(Boolean);
}

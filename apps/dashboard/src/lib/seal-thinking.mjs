// Stage 161 — Simsa wax-seal thinking/loading: pure, deterministic config.
//
// React-free so it is testable under `node --test test/*.test.mjs` (the dashboard's
// test runner). The SimsaSealThinking.tsx component renders from this config. Brand
// burgundy = existing Tailwind `brand` (oxblood) tokens — no new color system.

export const SEAL_THINKING_VARIANTS = ["compact", "panel"];
export const DEFAULT_SEAL_LABEL = "Preparing preview…";

const DOT_COUNT = { compact: 3, panel: 5 };
const DOT_BASE_DELAY_MS = 0;
const DOT_STEP_MS = 200; // inter-dot cadence (planned 180–240ms)

function str(x) {
  return typeof x === "string" ? x : "";
}

/**
 * Resolve a deterministic render config for the seal-thinking component.
 * @param {import("./seal-thinking.d.mts").SealThinkingInput} [input]
 * @returns {import("./seal-thinking.d.mts").SealThinkingConfig}
 */
export function resolveSealThinking(input = {}) {
  const i = input && typeof input === "object" ? input : {};
  const variant = SEAL_THINKING_VARIANTS.includes(str(i.variant)) ? str(i.variant) : "compact";
  const dotCount = DOT_COUNT[variant];

  const steps = Array.isArray(i.stepLabels)
    ? i.stepLabels.map((s) => str(s).trim()).filter(Boolean)
    : [];
  const labelProp = str(i.label).trim();
  // Stage 161 renders the current (first) label only; cycling is deferred to later stages.
  const label = steps.length ? steps[0] : labelProp || DEFAULT_SEAL_LABEL;

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

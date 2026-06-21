// Stage 81: pure display helpers for the project-level Evolution Learning
// Signals card. The aggregation itself is computed server-side; this module
// only formats the response for the UI.

/** Top-signal `type` → localized label key on t.evolution. */
export function topSignalLabelKey(signal) {
  switch (signal && signal.type) {
    case "action_often_improves":
      return "signalActionImproves";
    case "action_often_regresses":
      return "signalActionRegresses";
    case "not_enough_data":
    default:
      return "signalNotEnoughData";
  }
}

/** Format a rate (0..1) as a signed percentage (44% / 100% / 0% / "—"). */
export function formatRatePercent(value) {
  if (value === null || value === undefined) return "—";
  const pct = Math.round(value * 100);
  return `${pct}%`;
}

/** Format an unweighted average passRate delta as a percentage with sign. */
export function formatAverageDeltaPercent(value) {
  if (value === null || value === undefined) return "—";
  const pct = Math.round(value * 100);
  if (pct > 0) return `+${pct}%`;
  return `${pct}%`;
}

/** Format an unweighted average integer-style delta with one decimal + sign. */
export function formatAverageDeltaCount(value) {
  if (value === null || value === undefined) return "—";
  const rounded = Math.round(value * 10) / 10;
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
}

/** True when the project has no comparable packs to learn from. */
export function learningHasNoData(learning) {
  if (!learning) return true;
  return (
    learning.actionPackCount === 0 ||
    learning.followedPackCount === 0 ||
    learning.comparablePackCount === 0
  );
}

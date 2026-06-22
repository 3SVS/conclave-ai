// Stage 79: pure display helpers for the saved-pack Evolution Impact card.
// Deterministic, no network, no LLM. The impact comparison itself is computed
// server-side; this module only formats the response for the UI.

export const IMPACT_VERDICTS = ["improved", "regressed", "unchanged", "inconclusive"];

/** Verdict → localized label key on t.evolution. */
export function impactVerdictLabelKey(verdict) {
  switch (verdict) {
    case "improved":
      return "verdictImproved";
    case "regressed":
      return "verdictRegressed";
    case "unchanged":
      return "verdictUnchanged";
    case "inconclusive":
    default:
      return "verdictInconclusive";
  }
}

/** Reason enum → localized label key on t.evolution. */
export function impactReasonLabelKey(reason) {
  switch (reason) {
    case "pass_rate_increased":
      return "reasonPassRateUp";
    case "critical_issues_decreased":
      return "reasonCriticalDown";
    case "blockers_decreased":
      return "reasonBlockersDown";
    case "not_verified_decreased":
      return "reasonNotVerifiedDown";
    case "pass_rate_decreased":
      return "reasonPassRateDown";
    case "critical_issues_increased":
      return "reasonCriticalUp";
    case "blockers_increased":
      return "reasonBlockersUp";
    case "missing_followup":
      return "reasonMissingFollowup";
    case "missing_before":
      return "reasonMissingBefore";
    case "missing_after":
      return "reasonMissingAfter";
    case "different_acceptance_set":
      return "reasonDifferentAcceptanceSet";
    case "mixed_signals":
      return "reasonMixedSignals";
    default:
      return "reasonMissingFollowup";
  }
}

/** Format a signed delta integer with explicit sign (+3 / -2 / 0). */
export function formatDeltaInt(value) {
  if (value === null || value === undefined) return "—";
  if (value > 0) return `+${value}`;
  return String(value);
}

/** Format a passRate delta as percentage points with sign (+12% / -5% / 0%). */
export function formatDeltaPercent(value) {
  if (value === null || value === undefined) return "—";
  const pct = Math.round(value * 100);
  if (pct > 0) return `+${pct}%`;
  return `${pct}%`;
}

/** Format a passRate (0..1) → "85%" or "—". */
export function formatRate(value) {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 100)}%`;
}

/** True when the impact has no comparison data to show (verdict block stays
 *  but metric cards should fall back to the localized empty state). */
export function isImpactEmpty(impact) {
  return !impact || (!impact.before && !impact.after);
}

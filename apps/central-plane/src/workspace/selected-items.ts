/**
 * workspace/selected-items.ts
 *
 * Stage 40: defensive normalization for user-supplied `selectedItemIds`.
 *
 * The re-run UX lets a user hand-pick which items to re-check. The request
 * body is untrusted, so before it reaches the review pipeline we:
 *   - require an array (anything else → undefined, i.e. "not provided")
 *   - drop non-string entries
 *   - trim whitespace and drop empties
 *   - de-duplicate (preserving first-seen order)
 *   - cap the count so a pathological payload can't blow up the run
 *
 * Returning `undefined` (not an array) vs `[]` (array, but nothing usable)
 * is preserved on purpose: callers treat a falsy `.length` as "fall back to
 * the source run / linked PR selection", which matches pre-Stage-40 behavior.
 */

/** Hard ceiling on hand-picked items. Real PRs never approach this. */
export const MAX_SELECTED_ITEMS = 500;

export function normalizeSelectedItemIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= MAX_SELECTED_ITEMS) break;
  }
  return out;
}

/**
 * Stage 41: statuses that count as "문제가 남은 항목" — the default selection for
 * a quick re-run. Mirrors the dashboard's recommendedRerunItemIds (안 맞음 /
 * 확인 부족 / 결정 필요). 통과(passed) is excluded.
 */
const RECOMMENDED_RERUN_STATUSES: ReadonlySet<string> = new Set([
  "failed",
  "inconclusive",
  "needs_decision",
]);

/**
 * Item ids worth re-checking from a run's results: failed / inconclusive /
 * needs_decision only. Used by the project history list to power the
 * "남은 문제 다시 확인" quick action without shipping full results.
 */
export function recommendedRerunItemIds(
  results: ReadonlyArray<{ itemId: string; status: string }>,
): string[] {
  return results
    .filter((r) => RECOMMENDED_RERUN_STATUSES.has(r.status))
    .map((r) => r.itemId);
}

/**
 * lib/review-run-comparison.mjs
 *
 * Stage 45: client-side source-vs-current run comparison for the auto-display
 * panel. Mirrors the central-plane classification (pr-review-compare.ts) so the
 * dashboard and server bucket items identically:
 *   passed=4 · needs_decision=2 · inconclusive=1 · failed=0
 *   higher current score → improved; lower → newlyProblematic;
 *   equal → unchanged (passed) / stillOpen (otherwise).
 *
 * Plain ESM (.mjs) + .d.mts so `node --test` runs on the Node 20 CI floor.
 *
 * @typedef {{ itemId: string, title: string, status: "passed" | "failed" | "inconclusive" | "needs_decision" }} ReviewRunItem
 */

/**
 * Pick which run to compare the current run against.
 * Priority: query `fromRunId` > current run's rerun lineage. Self is ignored.
 * @param {{ fromRunId?: string | null, runId: string, rerunOfReviewRunId?: string | null }} args
 * @returns {string | null}
 */
export function pickComparisonSourceRunId({ fromRunId, runId, rerunOfReviewRunId }) {
  if (fromRunId && fromRunId !== runId) return fromRunId;
  if (rerunOfReviewRunId && rerunOfReviewRunId !== runId) return rerunOfReviewRunId;
  return null;
}

/**
 * Stage 46: the "post this comparison to a PR comment" shortcut is only
 * available when the on-screen comparison is comparable AND the current run
 * has rerun lineage — the backend computes the comment comparison from the
 * run's rerun_of_review_run_id (Policy A; fromRunId-only is display-only).
 * @param {{ comparable?: boolean, hasLineage?: boolean }} args
 * @returns {boolean}
 */
export function canPostComparisonToComment({ comparable, hasLineage }) {
  return Boolean(comparable) && Boolean(hasLineage);
}

/**
 * Build the preview/post comment request body for a comparison-aware comment.
 * - reviewRunId = current run id
 * - includeRerunComparison only when both requested AND lineage available
 * - includeComparison is intentionally omitted (never sent with rerun comparison)
 * - selectedItemIds passed through when non-empty
 * @param {{ userKey: string, reviewRunId: string, selectedItemIds?: string[], includeRerunComparison?: boolean, comparisonAvailable?: boolean }} args
 */
export function buildComparisonCommentInput({
  userKey, reviewRunId, selectedItemIds, includeRerunComparison, comparisonAvailable,
}) {
  /** @type {{ userKey: string, reviewRunId: string, includeRerunComparison: boolean, selectedItemIds?: string[] }} */
  const input = {
    userKey,
    reviewRunId,
    includeRerunComparison: Boolean(includeRerunComparison) && Boolean(comparisonAvailable),
  };
  if (Array.isArray(selectedItemIds) && selectedItemIds.length > 0) {
    input.selectedItemIds = selectedItemIds;
  }
  return input;
}

const STATUS_SCORE = { passed: 4, needs_decision: 2, inconclusive: 1, failed: 0 };

function scoreOf(status) {
  return STATUS_SCORE[status] ?? 0;
}

function counts(groups) {
  return {
    improved: groups.improved.length,
    stillOpen: groups.stillOpen.length,
    newlyProblematic: groups.newlyProblematic.length,
    unchanged: groups.unchanged.length,
  };
}

/**
 * Classify item-level changes between a source run and the current run.
 * Groups hold the CURRENT item. comparable=false when either side has no results.
 */
export function compareReviewRunResults({ sourceResults, currentResults }) {
  const empty = { improved: [], stillOpen: [], newlyProblematic: [], unchanged: [] };

  if (!Array.isArray(sourceResults) || sourceResults.length === 0) {
    return { comparable: false, ...empty, summary: counts(empty), reason: "missing_source_results" };
  }
  if (!Array.isArray(currentResults) || currentResults.length === 0) {
    return { comparable: false, ...empty, summary: counts(empty), reason: "missing_current_results" };
  }

  const sourceMap = new Map(sourceResults.map((r) => [r.itemId, r]));
  const improved = [];
  const stillOpen = [];
  const newlyProblematic = [];
  const unchanged = [];

  for (const cur of currentResults) {
    const src = sourceMap.get(cur.itemId);
    if (!src) {
      // item only in the current run
      if (cur.status === "passed") unchanged.push(cur);
      else stillOpen.push(cur);
      continue;
    }
    const curScore = scoreOf(cur.status);
    const srcScore = scoreOf(src.status);
    if (curScore > srcScore) improved.push(cur);
    else if (curScore < srcScore) newlyProblematic.push(cur);
    else if (cur.status === "passed") unchanged.push(cur);
    else stillOpen.push(cur);
  }

  const groups = { improved, stillOpen, newlyProblematic, unchanged };
  return { comparable: true, ...groups, summary: counts(groups) };
}

/**
 * Type declarations for review-run-comparison.mjs (Stage 45).
 */
export type ReviewRunItemStatus = "passed" | "failed" | "inconclusive" | "needs_decision";

/** Structural subset — anything with itemId + title + status fits. */
export type ReviewRunItem = {
  itemId: string;
  title: string;
  status: ReviewRunItemStatus;
};

export type ReviewRunComparison<T extends ReviewRunItem = ReviewRunItem> = {
  comparable: boolean;
  improved: T[];
  stillOpen: T[];
  newlyProblematic: T[];
  unchanged: T[];
  summary: {
    improved: number;
    stillOpen: number;
    newlyProblematic: number;
    unchanged: number;
  };
  reason?: "missing_source_results" | "missing_current_results";
};

/**
 * Pick which run to compare against: query `fromRunId` > rerun lineage; self ignored.
 */
export function pickComparisonSourceRunId(args: {
  fromRunId?: string | null;
  runId: string;
  rerunOfReviewRunId?: string | null;
}): string | null;

/** Stage 46: comparison→comment shortcut is available only when comparable AND lineage exists. */
export function canPostComparisonToComment(args: {
  comparable?: boolean;
  hasLineage?: boolean;
}): boolean;

/** Stage 46: build the comparison-aware comment preview/post request body. */
export function buildComparisonCommentInput(args: {
  userKey: string;
  reviewRunId: string;
  selectedItemIds?: string[];
  includeRerunComparison?: boolean;
  comparisonAvailable?: boolean;
}): {
  userKey: string;
  reviewRunId: string;
  includeRerunComparison: boolean;
  selectedItemIds?: string[];
};

/**
 * Classify item-level changes between a source run and the current run.
 * Groups hold the CURRENT item; comparable=false when either side has no results.
 */
export function compareReviewRunResults<T extends ReviewRunItem>(args: {
  sourceResults: T[];
  currentResults: T[];
}): ReviewRunComparison<T>;

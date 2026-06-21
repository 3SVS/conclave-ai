// Stage 78: pure helpers for the saved-pack follow-up UI. Deterministic, no
// network, no LLM. Tested in test/action-pack-followup.test.mjs.

export const FOLLOWUP_STATUSES = [
  "not_started",
  "copied",
  "in_progress",
  "reviewed",
  "benchmarked",
  "completed",
  "abandoned",
];

/** Map a follow-up status enum → localized label key on t.evolution. */
export function followupStatusLabelKey(status) {
  switch (status) {
    case "not_started":
      return "statusNotStarted";
    case "copied":
      return "statusCopied";
    case "in_progress":
      return "statusInProgress";
    case "reviewed":
      return "statusReviewed";
    case "benchmarked":
      return "statusBenchmarked";
    case "completed":
      return "statusCompleted";
    case "abandoned":
      return "statusAbandoned";
    default:
      return "statusNotStarted";
  }
}

/** Build the PATCH payload for the followup endpoint. Drops empty optionals so
 *  the server keeps any existing value (no accidental clears). */
export function buildFollowupPayload(input) {
  const { userKey, status, pullRequestNumber, reviewRunId, benchmarkId, note } = input;
  const payload = { userKey, status };
  if (typeof pullRequestNumber === "number" && Number.isInteger(pullRequestNumber) && pullRequestNumber >= 1) {
    payload.pullRequestNumber = pullRequestNumber;
  }
  if (typeof reviewRunId === "string" && reviewRunId.trim()) payload.reviewRunId = reviewRunId.trim();
  if (typeof benchmarkId === "string" && benchmarkId.trim()) payload.benchmarkId = benchmarkId.trim();
  if (typeof note === "string" && note.trim()) payload.note = note;
  return payload;
}

/** Convert a SavedEvolutionActionPackListItem → the props the list row needs
 *  to render a status badge. Centralised so the UI never re-derives this. */
export function mapListItemFollowup(item) {
  const status = item?.followupStatus ?? "not_started";
  return {
    status,
    labelKey: followupStatusLabelKey(status),
    pullRequestNumber: item?.followupPullRequestNumber,
    reviewRunId: item?.followupReviewRunId,
    benchmarkId: item?.followupBenchmarkId,
    followedAt: item?.followedAt,
  };
}

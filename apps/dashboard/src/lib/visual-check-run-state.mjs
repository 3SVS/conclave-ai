// Stage 264: pure run-state helpers for one-click visual inspection runs.
//
// PURE — no LLM, no network, no timers, no token/userKey storage. The UI
// (visual-checks list + report detail) derives polling and button behavior
// from these helpers; all user-facing copy stays in the dictionary.

/** Poll cadence while a run is still queued or running. */
export const RUN_POLL_INTERVAL_MS = 5000;

/**
 * A run is "active" only while the backend can still move it forward:
 * queued → running → done|failed. Anything else — done, failed, or an
 * unknown/legacy status — is treated as terminal (defensive: never poll
 * forever on a status this UI doesn't recognize).
 */
export function isActiveStatus(status) {
  return status === "queued" || status === "running";
}

/**
 * Delay before the next status poll, or null when the run is terminal
 * (done/failed/unknown) and polling must stop.
 */
export function nextPollDelayMs(status) {
  return isActiveStatus(status) ? RUN_POLL_INTERVAL_MS : null;
}

/**
 * Run-button availability. An active run wins over a missing website source
 * (the backend enforces one active run per project — 409 run_already_active).
 * reasonKey indexes into t.visualChecks.runErrors; null when enabled.
 */
export function runButtonState({ hasWebsiteSource, hasActiveRun } = {}) {
  if (hasActiveRun) return { disabled: true, reasonKey: "runAlreadyActive" };
  if (!hasWebsiteSource) return { disabled: true, reasonKey: "websiteSourceRequired" };
  return { disabled: false, reasonKey: null };
}

/**
 * Map a backend error code (string), an HTTP status (number), or the client
 * fallback string "HTTP <status>" to a t.visualChecks.runErrors dictionary
 * key. Unknown inputs fall back to "generic" — the UI never crashes on a new
 * backend error code.
 */
export function mapRunError(codeOrStatus) {
  let code = codeOrStatus;
  if (typeof code === "string") {
    const m = /^HTTP\s+(\d{3})$/i.exec(code.trim());
    if (m) code = Number(m[1]);
  }
  if (typeof code === "number") {
    if (code === 409) return "runAlreadyActive";
    if (code === 404) return "projectNotFound";
    if (code === 403) return "forbidden";
    // A bare 400/500 without a JSON error code carries no more detail.
    return "generic";
  }
  switch (code) {
    case "website_source_required":
      return "websiteSourceRequired";
    case "run_already_active":
      return "runAlreadyActive";
    case "project_not_found":
      return "projectNotFound";
    case "forbidden":
      return "forbidden";
    case "invalid_intent":
      return "invalidIntent";
    default:
      return "generic";
  }
}

/**
 * v0.14.4 — pure helpers extracted from server.mjs runJob() so the
 * verdict-coercion + payload-validation + header→env mapping logic is
 * testable without spinning up the HTTP server.
 *
 * runAutofix has FOUR distinct success-shape variants depending on which
 * branch it took:
 *   1. dry-run (review-only): { status: "dry-run", finalVerdict, remainingBlockers, totalCostUsd, ... }
 *   2. autofix approved early: { status: "approved", ... }
 *   3. autofix completed normally: { verdict, reviews, blockers?, ... }
 *   4. autofix bailed: { status: "bailed-no-patches" | "bailed-max-iter" | "errored", reason?, ... }
 *
 * The Worker's /internal/job-done handler expects ONE consistent
 * { verdict, blockers, blockerSummaries, error } envelope. coerceResult
 * normalizes all four variants into that envelope and produces a
 * diagnostic line when verdict can't be determined.
 *
 * No imports — keep this file dependency-free so the container's Node
 * runtime can load it without resolving any paths.
 */

const REQUIRED_RUN_FIELDS = [
  "jobId",
  "repo",
  "prNumber",
  "installationToken",
  "callbackUrl",
  "callbackToken",
];

/**
 * Validate the POST /run payload. Returns { ok: true } when every
 * required field is present, or { ok: false, missing: [...] } so the
 * caller can render a 400 with the specific list.
 */
export function validateRunPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, missing: REQUIRED_RUN_FIELDS };
  }
  const missing = REQUIRED_RUN_FIELDS.filter(
    (k) => payload[k] === undefined || payload[k] === null,
  );
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true };
}

/**
 * Map x-* headers to process.env names. Worker forwards LLM keys + the
 * Telegram bot token via headers (instead of the body) so the payload
 * stays small and keys don't end up in any access log that captures
 * bodies. Pure — returns the (env-name, value) pairs the caller should
 * write into process.env.
 */
const HEADER_ENV_MAP = Object.freeze({
  "x-anthropic-key": "ANTHROPIC_API_KEY",
  "x-openai-key": "OPENAI_API_KEY",
  "x-gemini-key": "GEMINI_API_KEY",
  "x-telegram-bot-token": "TELEGRAM_BOT_TOKEN",
});

export function extractHeaderEnv(headers) {
  const out = {};
  if (!headers || typeof headers !== "object") return out;
  for (const [h, e] of Object.entries(HEADER_ENV_MAP)) {
    const v = headers[h];
    if (typeof v === "string" && v.length > 0) out[e] = v;
  }
  return out;
}

const VERDICT_FROM_STATUS = Object.freeze({
  approved: "approve",
  merged: "approve",
  // dry-run with no finalVerdict means the council reached no consensus —
  // surface as rework so the user knows to push fixes.
  "dry-run": "rework",
  "bailed-no-patches": "rework",
  "bailed-max-iter": "rework",
  errored: "rework",
});

/**
 * Pull a normalized verdict + blocker count + top-N summaries + a
 * diagnostic line out of whatever shape runAutofix returned.
 *
 * Inputs:
 *   result    — the object runAutofix returned (any of the 4 shapes)
 *   exitCode  — the runAutofix return code (0 = clean run)
 *
 * Output:
 *   {
 *     verdict:           "approve" | "rework" | "reject" | undefined,
 *     blockers:          number   | undefined,
 *     blockerSummaries:  Array<{category,severity,message,file,line}> | undefined,
 *     diagnosticError:   string   | undefined,   // populated when verdict === undefined
 *     debugLine:         string                    // structured one-line summary for logs
 *   }
 *
 * `verdict === undefined` is treated as a real error condition: the
 * caller posts the diagnosticError back to the Worker so the row's
 * error_message captures what cli actually returned (instead of a
 * silent "done + null verdict").
 */
export function coerceResult(result, exitCode) {
  const safe = result && typeof result === "object" ? result : {};
  const rawVerdict =
    "verdict" in safe ? safe.verdict :
    "finalVerdict" in safe ? safe.finalVerdict :
    undefined;
  const rawStatus = "status" in safe ? safe.status : undefined;

  const verdict =
    typeof rawVerdict === "string" && (rawVerdict === "approve" || rawVerdict === "rework" || rawVerdict === "reject")
      ? rawVerdict
      : (typeof rawStatus === "string" && rawStatus in VERDICT_FROM_STATUS)
        ? VERDICT_FROM_STATUS[rawStatus]
        : undefined;

  const blockerArray = Array.isArray(safe.remainingBlockers)
    ? safe.remainingBlockers
    : Array.isArray(safe.blockers)
      ? safe.blockers
      : null;
  const blockers = blockerArray ? blockerArray.length : undefined;

  const blockerSummaries = blockerArray
    ? blockerArray.slice(0, 8).map((b) => ({
        category: typeof b?.category === "string" ? b.category : "uncategorized",
        severity: typeof b?.severity === "string" ? b.severity : "minor",
        message: typeof b?.message === "string" ? b.message.slice(0, 240) : "",
        file:
          typeof b?.filePath === "string"
            ? b.filePath
            : typeof b?.path === "string"
              ? b.path
              : "",
        line: typeof b?.line === "number" ? b.line : undefined,
      }))
    : undefined;

  const reasonSnippet =
    typeof safe.reason === "string" ? safe.reason.slice(0, 200) : "";
  const itersCount = Array.isArray(safe.iterations) ? safe.iterations.length : 0;
  const totalCost = typeof safe.totalCostUsd === "number" ? safe.totalCostUsd : 0;
  const keyList = Object.keys(safe).join(",");

  const debugLine =
    `result keys=[${keyList}] status=${rawStatus} verdict=${rawVerdict} ` +
    `reason=${reasonSnippet.slice(0, 80)} iters=${itersCount} cost=$${totalCost}`;

  // Pack the diagnostic only when we couldn't produce a real verdict —
  // otherwise we leak noise into the success row's error_message.
  const diagnosticError =
    verdict === undefined
      ? `cli result: status=${rawStatus} reason=${reasonSnippet || "(none)"} iters=${itersCount} cost=$${totalCost} keys=[${keyList}] exitCode=${exitCode}`
      : undefined;

  return {
    verdict,
    blockers,
    blockerSummaries,
    diagnosticError,
    debugLine,
  };
}

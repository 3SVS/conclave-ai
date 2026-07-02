// Stage 266: pure before/after comparison for Simsa visual-check runs.
//
// PURE — no LLM, no network, no randomness, no token/userKey storage, and
// NO numeric scores anywhere (Simsa policy). The comparison answers one
// non-developer question — "did it get better since last time?" — from two
// persisted runs: verdict transition, findings resolved/remaining/new, and
// screenshot pairs that exist in both runs. All user-facing labels stay in
// the dictionary; this module only returns data.

/**
 * Ordering used for verdict improvement: works true > null (needs a closer
 * look) > false. `decision` free-form text is never compared — it is carried
 * through as a label only (mirrors verdictLabel in visual-check-view.mjs).
 */
function worksRank(works) {
  if (works === true) return 2;
  if (works === false) return 0;
  return 1; // null / undefined / anything else → "needs a closer look"
}

/**
 * Direction of the verdict change from the previous run to the latest run:
 * "improved" | "regressed" | "unchanged". Uses only the works flag with the
 * true > null > false ordering — decision text never affects the direction.
 */
export function compareWorks(prevWorks, latestWorks) {
  const prev = worksRank(prevWorks);
  const latest = worksRank(latestWorks);
  if (latest > prev) return "improved";
  if (latest < prev) return "regressed";
  return "unchanged";
}

/** Normalize a finding `what` for matching: exact string match after trim. */
function normalizeWhat(what) {
  return typeof what === "string" ? what.trim() : "";
}

/**
 * Collect a report's findings into a Map keyed by normalized `what`.
 * Findings with an empty/blank `what` are dropped (nothing to match on);
 * duplicates keep the first occurrence.
 */
function findingsByWhat(report) {
  const map = new Map();
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  for (const f of findings) {
    if (!f || typeof f !== "object") continue;
    const key = normalizeWhat(f.what);
    if (!key || map.has(key)) continue;
    map.set(key, { severity: f.severity, what: key });
  }
  return map;
}

/** Screenshot evidence keys ("screenshots/…"), sorted for stable pairing. */
function screenshotKeys(keys) {
  const list = Array.isArray(keys) ? keys.filter((k) => typeof k === "string") : [];
  return list.filter((k) => k.startsWith("screenshots/")).sort();
}

/**
 * Pair screenshots by identical evidence key (e.g. screenshots/step-00-initial.png)
 * so the UI can render "이전 vs 최신" side by side. Names present on only one
 * side are listed separately per side. Video and unknown keys are ignored.
 */
export function pairEvidenceScreenshots(prevKeys, latestKeys) {
  const prev = screenshotKeys(prevKeys);
  const latestSet = new Set(screenshotKeys(latestKeys));
  const prevSet = new Set(prev);
  return {
    pairs: prev.filter((name) => latestSet.has(name)).map((name) => ({ name, prev: true, latest: true })),
    prevOnly: prev.filter((name) => !latestSet.has(name)),
    latestOnly: [...latestSet].filter((name) => !prevSet.has(name)),
  };
}

/**
 * Compare two persisted visual-check runs (VisualCheckDetail shape).
 * Deterministic; returns { comparable: false, reason } instead of throwing
 * when either run or either non-dev report is missing.
 *
 * - verdictTransition: from/to { works, decision } + direction (see compareWorks)
 * - findings matched by normalized `what` (exact match after trim):
 *   resolved (prev only) / remaining (both, latest severity) / introduced (latest only)
 * - evidencePairs: screenshots with the same name in both runs + per-side leftovers
 */
export function compareVisualChecks(prevCheck, latestCheck) {
  if (!prevCheck || typeof prevCheck !== "object") return { comparable: false, reason: "missing_previous_run" };
  if (!latestCheck || typeof latestCheck !== "object") return { comparable: false, reason: "missing_latest_run" };
  if (!prevCheck.report || typeof prevCheck.report !== "object") {
    return { comparable: false, reason: "missing_previous_report" };
  }
  if (!latestCheck.report || typeof latestCheck.report !== "object") {
    return { comparable: false, reason: "missing_latest_report" };
  }

  const prevFindings = findingsByWhat(prevCheck.report);
  const latestFindings = findingsByWhat(latestCheck.report);

  const resolved = [];
  const remaining = [];
  for (const [key, finding] of prevFindings) {
    const latestMatch = latestFindings.get(key);
    // Remaining carries the latest severity — that is the current state.
    if (latestMatch) remaining.push(latestMatch);
    else resolved.push(finding);
  }
  const introduced = [...latestFindings.values()].filter((f) => !prevFindings.has(f.what));

  return {
    comparable: true,
    verdictTransition: {
      from: { works: prevCheck.works ?? null, decision: String(prevCheck.decision ?? "") },
      to: { works: latestCheck.works ?? null, decision: String(latestCheck.decision ?? "") },
      direction: compareWorks(prevCheck.works, latestCheck.works),
    },
    findings: { resolved, remaining, introduced },
    evidencePairs: pairEvidenceScreenshots(prevCheck.evidenceKeys, latestCheck.evidenceKeys),
  };
}

/** Millisecond timestamp for ordering; NaN-safe (unparseable → null). */
function createdAtMs(iso) {
  const ms = Date.parse(String(iso ?? ""));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * From a run list (VisualCheckListItem shape), pick the run to compare the
 * current one against: the most recent run that is strictly older than the
 * current run, has status "done", and is not the current run itself.
 * Returns null when there is nothing to compare with.
 */
export function pickPreviousDoneCheck(checks, currentId, currentCreatedAt) {
  const currentMs = createdAtMs(currentCreatedAt);
  if (currentMs === null) return null;
  const older = (Array.isArray(checks) ? checks : []).filter((c) => {
    if (!c || typeof c !== "object" || c.status !== "done" || c.id === currentId) return false;
    const ms = createdAtMs(c.createdAt);
    return ms !== null && ms < currentMs;
  });
  older.sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt));
  return older[0] ?? null;
}

/**
 * List-page chip: compare the two most recent done runs and, only when their
 * verdicts differ, describe the transition on the latest done row. Returns
 * null when there are fewer than two done runs or the verdict is unchanged.
 */
export function latestDoneTransition(checks) {
  const done = (Array.isArray(checks) ? checks : []).filter(
    (c) => c && typeof c === "object" && c.status === "done" && createdAtMs(c.createdAt) !== null,
  );
  done.sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt));
  if (done.length < 2) return null;
  const [latest, prev] = done;
  const direction = compareWorks(prev.works, latest.works);
  if (direction === "unchanged") return null;
  return { runId: latest.id, direction, fromWorks: prev.works ?? null, toWorks: latest.works ?? null };
}

// Stage 64 — Multi-Agent Build Benchmark (deterministic, dashboard-side).
//
// Pure, locale-agnostic comparison of existing PR review runs as build
// candidates. NO agent execution, NO network, NO LLM judgement — the
// comparison is grounded entirely in acceptance results (passed / failed /
// inconclusive / needs_decision) already produced by review runs.
//
// Design decision (Stage 64): the calculation lives in the dashboard rather
// than central-plane because every input it needs (per-run summary counts) is
// already available client-side via the existing review-history endpoint, the
// logic is pure and unit-testable with `node --test`, and candidate selection
// is inherently a UI concern. The functions are intentionally free of any
// dashboard/React imports so they can be lifted verbatim into central-plane in
// a later stage when persisted, cross-device benchmark history is needed.
//
// rationale/blockers are returned as STRUCTURED items (not pre-formatted
// strings) so the UI can localize them via the i18n dictionary. This is a
// deliberate deviation from a `string[]` shape — formatting English into the
// pure layer would break the EN/KO toggle.

/** Candidate modes — how the implementation was produced. */
export const CANDIDATE_MODES = ["single_agent", "multi_agent", "reviewer_agent", "hybrid"];

/** Candidate sources — which tool produced the implementation. */
export const CANDIDATE_SOURCES = ["claude_code", "codex", "cursor", "manual", "other"];

/** Minimum / maximum candidates for a saveable benchmark. */
export const MIN_CANDIDATES = 2;
export const MAX_CANDIDATES = 5;

/** Whether a benchmark with this many candidates can be saved (2–5). */
export function canSaveBenchmark(candidateCount) {
  return candidateCount >= MIN_CANDIDATES && candidateCount <= MAX_CANDIDATES;
}

/** Coerce to a non-negative integer; undefined/NaN/negatives become 0. */
function count(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Compute deterministic acceptance metrics for one candidate from its review
 * summary counts. Missing counts are treated as 0 (a run with no recorded
 * results contributes zeros, never throws).
 *
 * score = passed*3 - failed*3 - needs_decision*2 - inconclusive*1
 */
export function computeCandidateMetrics(counts) {
  const passed = count(counts?.passed);
  const failed = count(counts?.failed);
  const inconclusive = count(counts?.inconclusive);
  const needsDecision = count(counts?.needsDecision);

  const totalItems = passed + failed + inconclusive + needsDecision;
  const acceptancePassRate = totalItems > 0 ? passed / totalItems : 0;
  const criticalIssueCount = failed + needsDecision;
  const notVerifiedCount = inconclusive;
  const score = passed * 3 - failed * 3 - needsDecision * 2 - inconclusive * 1;

  return {
    totalItems,
    passed,
    failed,
    inconclusive,
    needsDecision,
    acceptancePassRate,
    criticalIssueCount,
    notVerifiedCount,
    score,
  };
}

/**
 * Rank candidates best-first. Deterministic ordering:
 *   1. higher score
 *   2. higher acceptance pass rate
 *   3. fewer critical issues (failed + needs_decision)
 *   4. fewer not-verified (inconclusive)
 *   5. candidate id (stable final tiebreak)
 * Returns an array of { candidate, metrics }.
 */
export function rankCandidates(candidates, metricsByCandidate) {
  return [...(candidates ?? [])]
    .map((candidate) => ({
      candidate,
      metrics: metricsByCandidate[candidate.id] ?? computeCandidateMetrics(undefined),
    }))
    .sort((a, b) => {
      if (b.metrics.score !== a.metrics.score) return b.metrics.score - a.metrics.score;
      if (b.metrics.acceptancePassRate !== a.metrics.acceptancePassRate)
        return b.metrics.acceptancePassRate - a.metrics.acceptancePassRate;
      if (a.metrics.criticalIssueCount !== b.metrics.criticalIssueCount)
        return a.metrics.criticalIssueCount - b.metrics.criticalIssueCount;
      if (a.metrics.notVerifiedCount !== b.metrics.notVerifiedCount)
        return a.metrics.notVerifiedCount - b.metrics.notVerifiedCount;
      return String(a.candidate.id).localeCompare(String(b.candidate.id));
    });
}

/**
 * "No clear winner" when the top two are effectively tied:
 *   score difference <= 1 AND same pass rate AND same critical issue count.
 */
function isTooClose(top, runnerUp) {
  return (
    Math.abs(top.metrics.score - runnerUp.metrics.score) <= 1 &&
    top.metrics.acceptancePassRate === runnerUp.metrics.acceptancePassRate &&
    top.metrics.criticalIssueCount === runnerUp.metrics.criticalIssueCount
  );
}

/** Structured blockers for one ranked entry, or null if it has none. */
function blockerFor(entry) {
  const { failed, needsDecision, inconclusive } = entry.metrics;
  if (failed + needsDecision + inconclusive === 0) return null;
  return {
    candidateId: entry.candidate.id,
    candidateLabel: entry.candidate.label,
    failed,
    needsDecision,
    inconclusive,
  };
}

/**
 * Build the full deterministic benchmark result, including the recommendation.
 * `countsByCandidate` maps candidate id → { passed, failed, inconclusive,
 * needsDecision } (typically a review run's summary). Returns the spec's
 * AgentBenchmarkResult, with structured rationale/blockers for i18n.
 *
 * A recommendation requires at least 2 candidates. With fewer, recommendation
 * is omitted and the UI shows its "need more candidates" empty state.
 */
// ── Stage 68: item-level evidence (mirrors central-plane agent-benchmark.ts) ──

/** Normalize a stored item status to the canonical 4; unknown → undefined. */
function normalizeItemStatus(s) {
  if (s === "passed" || s === "failed" || s === "inconclusive" || s === "needs_decision") return s;
  return undefined;
}

/** First non-empty stored evidence string, or undefined. */
function firstEvidence(ev) {
  if (Array.isArray(ev)) return ev.find((x) => typeof x === "string" && x.trim().length > 0);
  if (typeof ev === "string" && ev.trim().length > 0) return ev;
  return undefined;
}

function severityFor(status) {
  if (status === "failed") return "issue";
  if (status === "needs_decision") return "decision";
  return "not_verified";
}

/** Normalize one candidate's stored review results to item outcomes. */
export function extractCandidateItemOutcomes(candidateId, items) {
  const out = [];
  for (const it of items ?? []) {
    const status = normalizeItemStatus(it.status);
    if (!status) continue;
    const itemId = typeof it.itemId === "string" ? it.itemId : "";
    const title = typeof it.title === "string" && it.title.trim().length > 0 ? it.title : itemId;
    const evidence = firstEvidence(it.evidence);
    out.push({ candidateId, itemId, title, status, ...(evidence ? { evidence } : {}) });
  }
  return out;
}

function blockersFromOutcomes(outcomes) {
  const blockers = [];
  for (const o of outcomes) {
    if (o.status === "passed") continue;
    blockers.push({
      itemId: o.itemId,
      title: o.title,
      status: o.status,
      severity: severityFor(o.status),
      candidateId: o.candidateId,
      ...(o.evidence ? { evidence: o.evidence } : {}),
    });
  }
  return blockers;
}

export function buildBenchmarkResult({ projectId, candidates, countsByCandidate, itemResultsByCandidate }) {
  const list = candidates ?? [];
  const metricsByCandidate = {};
  for (const c of list) {
    metricsByCandidate[c.id] = computeCandidateMetrics((countsByCandidate ?? {})[c.id]);
  }

  /** @type {Record<string, unknown>} */
  const result = { projectId, candidates: list, metricsByCandidate };

  // Stage 68: per-candidate item outcomes (only when item results supplied).
  let itemOutcomesByCandidate;
  if (itemResultsByCandidate) {
    itemOutcomesByCandidate = {};
    for (const c of list) {
      itemOutcomesByCandidate[c.id] = extractCandidateItemOutcomes(c.id, itemResultsByCandidate[c.id] ?? []);
    }
    result.itemOutcomesByCandidate = itemOutcomesByCandidate;
  }

  if (list.length < 2) return result;

  const ranked = rankCandidates(list, metricsByCandidate);
  const top = ranked[0];
  const runnerUp = ranked[1];

  const blockers = ranked.map(blockerFor).filter(Boolean);

  let recommendation;
  if (isTooClose(top, runnerUp)) {
    recommendation = { winnerCandidateId: undefined, rationale: [{ code: "no_clear_winner" }], blockers };
  } else {
    const rationale = [
      {
        code: "pass_comparison",
        winnerLabel: top.candidate.label,
        winnerPassed: top.metrics.passed,
        winnerTotal: top.metrics.totalItems,
        runnerLabel: runnerUp.candidate.label,
        runnerPassed: runnerUp.metrics.passed,
        runnerTotal: runnerUp.metrics.totalItems,
      },
    ];
    if (top.metrics.criticalIssueCount < runnerUp.metrics.criticalIssueCount) {
      rationale.push({ code: "fewer_critical", winnerLabel: top.candidate.label, runnerLabel: runnerUp.candidate.label });
    }
    if (runnerUp.metrics.notVerifiedCount > 0) {
      rationale.push({ code: "runner_not_verified", runnerLabel: runnerUp.candidate.label, count: runnerUp.metrics.notVerifiedCount });
    }
    recommendation = { winnerCandidateId: top.candidate.id, rationale, blockers };
  }
  result.recommendation = recommendation;

  // Stage 68: item-level remaining blockers from the winner (or top-ranked) candidate.
  if (itemOutcomesByCandidate) {
    const basisId = recommendation.winnerCandidateId ?? top.candidate.id;
    result.blockerBasisCandidateId = basisId;
    result.remainingBlockers = blockersFromOutcomes(itemOutcomesByCandidate[basisId] ?? []);
  }

  return result;
}

/**
 * Deterministic, copy-pasteable benchmark summary text. NO LLM — a pure
 * assembler. The caller passes already-localized lines/labels (so the text
 * follows the UI language); this function only fixes the structure, spacing,
 * and bullet prefixes, and drops empty sections.
 */
export function buildBenchmarkSummaryText(parts) {
  const {
    heading,
    projectLine,
    benchmarkLine,
    recommendationLine,
    candidatesHeading,
    candidateLines = [],
    whyHeading,
    whyLines = [],
    blockersHeading,
    blockerLines = [],
    noBlockersLine,
  } = parts;

  const out = [heading, "", projectLine, benchmarkLine, recommendationLine, "", `${candidatesHeading}:`];
  for (const line of candidateLines) out.push(`- ${line}`);

  if (whyLines.length > 0) {
    out.push("", `${whyHeading}:`);
    for (const line of whyLines) out.push(`- ${line}`);
  }

  out.push("", `${blockersHeading}:`);
  if (blockerLines.length > 0) {
    for (const line of blockerLines) out.push(`- ${line}`);
  } else {
    out.push(noBlockersLine);
  }

  return out.join("\n");
}

/** Sorted unique item ids — compare acceptance sets order-independently. */
function normalizedSet(ids) {
  return [...new Set((ids ?? []).map(String))].sort();
}

/**
 * Same-acceptance-set guard. Candidates whose review run covered a different
 * set of acceptance items are not directly comparable; flag misalignment so
 * the UI can warn. Baseline = the first candidate's set. Mirrors central-plane
 * `computeAcceptanceSetAlignment` (kept in lock-step by the shared golden
 * fixture).
 */
export function computeAcceptanceSetAlignment(candidates, selectedItemIdsByCandidate) {
  const list = candidates ?? [];
  if (list.length < 2) return { aligned: true };

  const baseline = normalizedSet((selectedItemIdsByCandidate ?? {})[list[0].id]);
  const baselineKey = baseline.join(" ");

  const differingCandidateIds = [];
  for (const c of list) {
    const key = normalizedSet((selectedItemIdsByCandidate ?? {})[c.id]).join(" ");
    if (key !== baselineKey) differingCandidateIds.push(c.id);
  }

  if (differingCandidateIds.length === 0) {
    return { aligned: true, baselineItemIds: baseline };
  }
  return {
    aligned: false,
    warning: "acceptance_set_mismatch",
    baselineItemIds: baseline,
    differingCandidateIds,
  };
}

/**
 * workspace/pr-review-run-loader.ts
 *
 * Stage 36: shared helper for loading a specific review run for Fix Pack / comment generation.
 *
 * Policy: for action endpoints (Fix Pack, comment body), parse failures are hard errors —
 * generating a Fix Pack or comment from empty results would produce useless output.
 * Detail-view endpoints can fallback to [] (Stage 35), but action endpoints should not.
 */
import type { Env } from "../env.js";
import { getReviewRunById } from "./pr-review-db.js";

export type LoadedRunResults = {
  itemId: string;
  title: string;
  status: string;
  userLabel: string;
  reason: string;
  evidence: string[];
  nextAction: string;
};

export type LoadedRunSummary = {
  passed: number;
  failed: number;
  inconclusive: number;
  needsDecision: number;
};

export type LoadedReviewRun = {
  id: string;
  status: string;
  createdAt: string;
  rerunOfReviewRunId?: string;
  selectedItemIds: string[];
  results: LoadedRunResults[];
  summary: LoadedRunSummary;
};

export type LoadRunForActionResult =
  | { ok: true; run: LoadedReviewRun }
  | {
      ok: false;
      error: "review_run_not_found" | "review_run_mismatch" | "review_run_parse_failed";
    };

export async function loadPRReviewRunForAction(opts: {
  env: Env;
  projectId: string;
  repoFullName: string;
  prNumber: number;
  reviewRunId: string;
}): Promise<LoadRunForActionResult> {
  const { env, projectId, repoFullName, prNumber, reviewRunId } = opts;

  const dbRun = await getReviewRunById(env, reviewRunId).catch(() => null);
  if (!dbRun) return { ok: false, error: "review_run_not_found" };

  // Ownership: projectId + repoFullName + prNumber must all match
  if (
    dbRun.projectId !== projectId ||
    dbRun.repoFullName !== repoFullName ||
    dbRun.prNumber !== prNumber
  ) {
    return { ok: false, error: "review_run_mismatch" };
  }

  if (!dbRun.resultJson) {
    return { ok: false, error: "review_run_parse_failed" };
  }

  let results: LoadedRunResults[];
  let rawSummary: { passed?: number; failed?: number; inconclusive?: number; needsDecision?: number } = {};

  try {
    const parsed = JSON.parse(dbRun.resultJson) as {
      results?: unknown[];
      summary?: { passed?: number; failed?: number; inconclusive?: number; needsDecision?: number };
    };
    if (!Array.isArray(parsed.results) || parsed.results.length === 0) {
      return { ok: false, error: "review_run_parse_failed" };
    }
    results = parsed.results as LoadedRunResults[];
    rawSummary = parsed.summary ?? {};
  } catch {
    return { ok: false, error: "review_run_parse_failed" };
  }

  const summary: LoadedRunSummary = {
    passed: Number(rawSummary.passed ?? 0),
    failed: Number(rawSummary.failed ?? 0),
    inconclusive: Number(rawSummary.inconclusive ?? 0),
    needsDecision: Number(rawSummary.needsDecision ?? 0),
  };

  return {
    ok: true,
    run: {
      id: dbRun.id,
      status: dbRun.status,
      createdAt: dbRun.createdAt,
      rerunOfReviewRunId: dbRun.rerunOfReviewRunId,
      selectedItemIds: dbRun.selectedItemIds,
      results,
      summary,
    },
  };
}

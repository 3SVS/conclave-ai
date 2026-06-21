/**
 * workspace/project-evolution-learning.ts — Stage 81
 *
 * Pure aggregator: rolls up Stage 79's per-pack EvolutionImpactComparison
 * results across every saved action pack in every experiment of a project
 * (for one userKey) into project-level "learning signals". NO LLM, NO
 * network, NO randomness. Verdict rules are NEVER re-derived here — entries
 * come pre-computed via the Stage 79 helper and we only count + rank.
 *
 * Stage 75 scorecard formula unchanged. Stage 79/80 verdict rules unchanged.
 * No persistence in Stage 81 — the rank thresholds will evolve as we see
 * real project data.
 */
import type { EvolutionImpactComparison } from "./evolution-impact.js";

export type ProjectLearningSignal =
  | {
      type: "action_often_improves";
      recommendedAction: string;
      improved: number;
      totalComparable: number;
    }
  | {
      type: "action_often_regresses";
      recommendedAction: string;
      regressed: number;
      totalComparable: number;
    }
  | { type: "not_enough_data" };

export type ProjectLearningVerdictCounts = {
  improved: number;
  regressed: number;
  unchanged: number;
  inconclusive: number;
};

export type ProjectActionEffectiveness = {
  recommendedAction: string;
  total: number;
  followed: number;
  comparable: number;
  improved: number;
  regressed: number;
  unchanged: number;
  inconclusive: number;
  improvementRate: number | null;
  regressionRate: number | null;
};

export type ProjectLearningAverageDelta = {
  passRateDelta: number | null;
  criticalIssueDelta: number | null;
  notVerifiedDelta: number | null;
  blockerDelta: number | null;
};

export type ProjectEvolutionLearningSignals = {
  projectId: string;
  experimentCount: number;
  actionPackCount: number;
  followedPackCount: number;
  comparablePackCount: number;
  verdictCounts: ProjectLearningVerdictCounts;
  recommendedActionEffectiveness: ProjectActionEffectiveness[];
  averageDelta: ProjectLearningAverageDelta;
  topSignals: ProjectLearningSignal[];
  limitations: string[];
};

export type ProjectLearningEntry = {
  comparison: EvolutionImpactComparison;
  followed: boolean;
  recommendedAction: string;
};

/** Threshold a pack must clear to be "comparable" — i.e. usable as a learning
 *  signal. Per Stage 81 spec recommendation: a non-null delta AND a non-
 *  inconclusive verdict. Excludes mixed_signals / missing / different-set. */
function isComparable(c: EvolutionImpactComparison): boolean {
  return c.delta !== null && c.verdict !== "inconclusive";
}

const MIN_PROJECT_COMPARABLE = 3;
const MIN_ACTION_COMPARABLE = 2;
const IMPROVEMENT_THRESHOLD = 0.67;
const REGRESSION_THRESHOLD = 0.5;
const TOP_SIGNAL_CAP = 5;

function meanOrNull(values: Array<number | null | undefined>): number | null {
  const filtered: number[] = [];
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) filtered.push(v);
  }
  if (filtered.length === 0) return null;
  let sum = 0;
  for (const v of filtered) sum += v;
  return sum / filtered.length;
}

/**
 * Pure aggregator. Tests call this directly with hand-built entries; the
 * route handler computes entries via the Stage 79 loadImpactForActionPack
 * helper to keep the formula in one place.
 */
export function buildProjectEvolutionLearning(args: {
  projectId: string;
  experimentCount: number;
  entries: ProjectLearningEntry[];
}): ProjectEvolutionLearningSignals {
  const { projectId, experimentCount, entries } = args;

  // ── Counts ─────────────────────────────────────────────────────────────
  const actionPackCount = entries.length;
  const followedPackCount = entries.reduce((n, e) => n + (e.followed ? 1 : 0), 0);
  const comparablePackCount = entries.reduce(
    (n, e) => n + (isComparable(e.comparison) ? 1 : 0),
    0,
  );

  const verdictCounts: ProjectLearningVerdictCounts = {
    improved: 0,
    regressed: 0,
    unchanged: 0,
    inconclusive: 0,
  };
  const byAction = new Map<string, ProjectActionEffectiveness>();
  for (const entry of entries) {
    const v = entry.comparison.verdict;
    verdictCounts[v] = (verdictCounts[v] ?? 0) + 1;

    let bucket = byAction.get(entry.recommendedAction);
    if (!bucket) {
      bucket = {
        recommendedAction: entry.recommendedAction,
        total: 0,
        followed: 0,
        comparable: 0,
        improved: 0,
        regressed: 0,
        unchanged: 0,
        inconclusive: 0,
        improvementRate: null,
        regressionRate: null,
      };
      byAction.set(entry.recommendedAction, bucket);
    }
    bucket.total += 1;
    if (entry.followed) bucket.followed += 1;
    if (isComparable(entry.comparison)) bucket.comparable += 1;
    bucket[v] += 1;
  }

  // Compute rates per action AFTER counts are finalised.
  for (const bucket of byAction.values()) {
    bucket.improvementRate =
      bucket.comparable > 0 ? bucket.improved / bucket.comparable : null;
    bucket.regressionRate =
      bucket.comparable > 0 ? bucket.regressed / bucket.comparable : null;
  }

  // Stable order for downstream UIs / golden tests.
  const recommendedActionEffectiveness: ProjectActionEffectiveness[] = [
    ...byAction.values(),
  ].sort((a, b) => a.recommendedAction.localeCompare(b.recommendedAction));

  // ── Average delta (simple unweighted mean of non-null per-pack deltas) ──
  const averageDelta: ProjectLearningAverageDelta = {
    passRateDelta: meanOrNull(entries.map((e) => e.comparison.delta?.passRateDelta)),
    criticalIssueDelta: meanOrNull(entries.map((e) => e.comparison.delta?.criticalIssueDelta)),
    notVerifiedDelta: meanOrNull(entries.map((e) => e.comparison.delta?.notVerifiedDelta)),
    blockerDelta: meanOrNull(entries.map((e) => e.comparison.delta?.blockerDelta)),
  };

  // ── Limitations (unique + sorted) ──────────────────────────────────────
  const limitationSet = new Set<string>();
  for (const e of entries) for (const l of e.comparison.limitations) limitationSet.add(l);
  const limitations = [...limitationSet].sort();

  // ── Top signals (deterministic + conservative) ─────────────────────────
  const topSignals: ProjectLearningSignal[] = [];
  if (comparablePackCount < MIN_PROJECT_COMPARABLE) {
    topSignals.push({ type: "not_enough_data" });
  } else {
    for (const bucket of recommendedActionEffectiveness) {
      if (bucket.comparable < MIN_ACTION_COMPARABLE) continue;
      if (
        bucket.improvementRate !== null &&
        bucket.improvementRate >= IMPROVEMENT_THRESHOLD
      ) {
        topSignals.push({
          type: "action_often_improves",
          recommendedAction: bucket.recommendedAction,
          improved: bucket.improved,
          totalComparable: bucket.comparable,
        });
      }
      if (
        bucket.regressionRate !== null &&
        bucket.regressionRate >= REGRESSION_THRESHOLD
      ) {
        topSignals.push({
          type: "action_often_regresses",
          recommendedAction: bucket.recommendedAction,
          regressed: bucket.regressed,
          totalComparable: bucket.comparable,
        });
      }
      if (topSignals.length >= TOP_SIGNAL_CAP) break;
    }
    // If we crossed the project threshold but no action cleared the per-
    // action bar yet (e.g. 3 comparable packs spread across 3 actions),
    // surface not_enough_data so the UI does not show an empty block.
    if (topSignals.length === 0) topSignals.push({ type: "not_enough_data" });
  }

  return {
    projectId,
    experimentCount,
    actionPackCount,
    followedPackCount,
    comparablePackCount,
    verdictCounts,
    recommendedActionEffectiveness,
    averageDelta,
    topSignals: topSignals.slice(0, TOP_SIGNAL_CAP),
    limitations,
  };
}

// Stage 183 — Simsa Plan Map read-only preview: pure, deterministic view-model builder.
//
// React-free so it runs under `node --test test/*.test.mjs`. Generates a READ-ONLY Plan
// Map ("심사 지도") preview from existing local project data — no server access, no
// persistence, no identity claims, never throws. The page localizes the returned status /
// stage / gate keys via the `planMap.*` dictionary. (Stage 182 IA → this is the P2 slice.)

export const PLAN_MAP_STATUSES = [
  "planned",
  "ready",
  "in_progress",
  "blocked",
  "needs_approval",
  "verifying",
  "completed",
  "skipped",
  "not_verified",
  "deferred",
  "failed_check",
  "merged",
  "deployed",
];

// Statuses that mean a stage no longer needs the user's attention (used to find "current").
const TERMINAL = new Set(["completed", "merged", "deployed", "skipped"]);

// Read-only example gates the Plan Map surfaces (Stage 182 gate model). No approve actions.
export const PLAN_MAP_GATES = [
  { key: "merge", risk: "low" },
  { key: "deploy", risk: "medium" },
  { key: "migration", risk: "high" },
  { key: "mcpPublish", risk: "medium" },
  { key: "npmPublish", risk: "medium" },
  { key: "auth", risk: "high" },
  { key: "payment", risk: "high" },
  { key: "dns", risk: "high" },
  { key: "productionWrite", risk: "medium" },
];

// The illustrative acceptance journey skeleton, in order.
const STAGE_ORDER = ["intake", "brief", "acceptance", "review", "checkpoint", "merge", "deploy"];

/** Coerce any value to a valid Plan-Map status; unknown → not_verified. */
export function normalizePlanMapStatus(s) {
  return PLAN_MAP_STATUSES.includes(s) ? s : "not_verified";
}

// Map an acceptance-item status (passed/failed/inconclusive/needs_decision/…) into a
// Plan-Map status. Anything unknown/missing is treated as not_verified (never invented).
function itemStatusToPlan(s) {
  switch (s) {
    case "passed":
      return "completed";
    case "failed":
      return "failed_check";
    case "needs_decision":
      return "needs_approval";
    case "building":
      return "in_progress";
    case "not_started":
      return "planned";
    case "inconclusive":
    default:
      return "not_verified";
  }
}

function str(x) {
  return typeof x === "string" ? x : "";
}

/**
 * Build a read-only Plan-Map preview view model from local project context.
 * @param {import("./plan-map.d.mts").PlanMapInput} [input]
 * @returns {import("./plan-map.d.mts").PlanMapPreview}
 */
export function buildPlanMapPreview(input = {}) {
  const i = input && typeof input === "object" ? input : {};
  const title = str(i.title).trim();
  const goal = str(i.goal).trim();
  const completeness = Number.isFinite(i.specCompleteness)
    ? Math.max(0, Math.min(100, i.specCompleteness))
    : 0;

  const rawItems = Array.isArray(i.items) ? i.items : [];
  const items = rawItems.map((it, idx) => {
    const o = it && typeof it === "object" ? it : {};
    return {
      id: str(o.id) || `item-${idx}`,
      title: str(o.title),
      status: itemStatusToPlan(str(o.status)),
    };
  });

  const total = items.length;
  const completed = items.filter((x) => x.status === "completed").length;
  const failed = items.filter((x) => x.status === "failed_check").length;
  // not_verified = everything that is neither verified-pass nor a hard failure.
  const notVerifiedCount = Math.max(0, total - completed - failed);

  const stageStatus = {
    intake: title || goal ? "completed" : "ready",
    brief: goal && completeness >= 80 ? "completed" : title || goal ? "in_progress" : "planned",
    acceptance: total === 0 ? "planned" : completed === total ? "completed" : "in_progress",
    review: total === 0 ? "planned" : notVerifiedCount > 0 || failed > 0 ? "verifying" : "completed",
    checkpoint: "needs_approval",
    merge: "needs_approval",
    deploy: "needs_approval",
  };
  const stages = STAGE_ORDER.map((id) => ({ id, status: normalizePlanMapStatus(stageStatus[id]) }));

  // "current" = the first stage that still needs attention; everything before is done.
  let currentIndex = stages.findIndex((s) => !TERMINAL.has(s.status));
  if (currentIndex === -1) currentIndex = stages.length - 1;
  const sections = {
    done: stages.slice(0, currentIndex),
    current: stages[currentIndex] ?? null,
    next: stages[currentIndex + 1] ?? null,
    later: stages.slice(currentIndex + 2),
  };

  const trainKey = currentIndex <= 1 ? "plan" : currentIndex <= 3 ? "acceptance" : "release";

  const blockers = [];
  if (failed > 0) blockers.push({ id: "failedChecks", kind: "failed_check", count: failed });
  if (notVerifiedCount > 0) blockers.push({ id: "evidence", kind: "evidence", count: notVerifiedCount });
  // Collaboration is always gated by the (unmade) auth/identity decision — surfaced honestly.
  blockers.push({ id: "identity", kind: "identity", count: 0 });

  const gates = PLAN_MAP_GATES.map((g) => ({
    key: g.key,
    requiresApproval: true,
    status: "needs_approval",
    risk: g.risk,
  }));

  return {
    readOnly: true,
    title,
    goal,
    position: {
      currentStageId: sections.current ? sections.current.id : STAGE_ORDER[0],
      currentStageStatus: sections.current ? sections.current.status : "planned",
      trainKey,
      nextCheckpointId: "checkpoint",
    },
    sections,
    evidence: { total, completed, failed, notVerifiedCount },
    blockers,
    gates,
    recommendedNextId: sections.current ? sections.current.id : STAGE_ORDER[0],
  };
}

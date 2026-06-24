// Stage 183 — types for plan-map.mjs (Simsa Plan Map read-only preview).

export type PlanMapStatus =
  | "planned"
  | "ready"
  | "in_progress"
  | "blocked"
  | "needs_approval"
  | "verifying"
  | "completed"
  | "skipped"
  | "not_verified"
  | "deferred"
  | "failed_check"
  | "merged"
  | "deployed";

export type PlanMapGateRisk = "low" | "medium" | "high";

export type PlanMapInputItem = {
  id?: string;
  title?: string;
  status?: string;
};

export type PlanMapInput = {
  title?: string;
  goal?: string;
  specCompleteness?: number;
  items?: PlanMapInputItem[];
};

export type PlanMapStage = { id: string; status: PlanMapStatus };

export type PlanMapBlocker = { id: string; kind: string; count: number };

export type PlanMapGate = {
  key: string;
  requiresApproval: boolean;
  status: PlanMapStatus;
  risk: PlanMapGateRisk;
};

export type PlanMapPreview = {
  readOnly: true;
  title: string;
  goal: string;
  position: {
    currentStageId: string;
    currentStageStatus: PlanMapStatus;
    trainKey: "plan" | "acceptance" | "release";
    nextCheckpointId: string;
  };
  sections: {
    done: PlanMapStage[];
    current: PlanMapStage | null;
    next: PlanMapStage | null;
    later: PlanMapStage[];
  };
  evidence: { total: number; completed: number; failed: number; notVerifiedCount: number };
  blockers: PlanMapBlocker[];
  gates: PlanMapGate[];
  recommendedNextId: string;
};

export const PLAN_MAP_STATUSES: PlanMapStatus[];
export const PLAN_MAP_GATES: { key: string; risk: PlanMapGateRisk }[];
export function normalizePlanMapStatus(s: unknown): PlanMapStatus;
export function buildPlanMapPreview(input?: PlanMapInput): PlanMapPreview;

/**
 * acceptance-graph.ts — Stage 257A (Simsa Acceptance Graph foundation).
 *
 * Pure, deterministic data contracts + helpers for the gap between user intent, PRD,
 * build plan, implementation evidence, review evidence, visual evidence, gate decision,
 * and receipt. NO network, NO DB, NO env, NO LLM — deterministic output for deterministic
 * input. This stage defines the *contract* (including the visual/interaction node) but does
 * NOT run any browser/interaction runner.
 *
 * Policy source of truth: docs/simsa-autopilot-operating-model.md (Part II). Hard rules baked in:
 *   - NO numeric scoring (readiness states only).
 *   - Absent evidence is "Not Verified", never "Pass"/"Done".
 *   - Implementation choices over an ambiguous PRD surface as "User Acceptance Required".
 */

/** Where the project entered Simsa. "mixed" = more than one of idea/prd/repo. */
export type IntakeSource = "idea" | "prd" | "repo" | "mixed";

/** Allowed decision states. NO numeric score is ever produced (policy §20). */
export const DECISION_STATES = [
  "Ready",
  "Conditionally Ready",
  "Needs Clarification",
  "Needs Evidence",
  "Needs Expert Review",
  "Not Applicable",
  "Not Judged",
  "Do Not Build Yet",
  "Not Verified",
  "Needs Fix",
  "User Acceptance Required",
] as const;
export type DecisionState = (typeof DECISION_STATES)[number];

export function isDecisionState(v: unknown): v is DecisionState {
  return typeof v === "string" && (DECISION_STATES as readonly string[]).includes(v);
}

/** A single acceptance criterion carried by the PRD. */
export type AcceptanceCriterion = { id: string; text: string };

/** 2. User intent. */
export type UserIntentNode = {
  id: string;
  summary: string;
  targetFirstUser: string;
  desiredBehaviorChange: string;
  nonGoals: string[];
  assumptions: string[];
  unknowns: string[];
  sourceRefs: string[];
};

/** 3. Clarifying answer. */
export type ClarifyingAnswerNode = {
  question: string;
  answer: string;
  reasonAsked: string;
  affects: string[];
};

/** 4. PRD artifact. */
export type PrdArtifactNode = {
  summary: string;
  requirements: string[];
  userFlows: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  edgeCases: string[];
  outOfScope: string[];
  unknowns: string[];
  sourceRefs: string[];
};

/** 5. Build plan. */
export type BuildPlanNode = {
  tasks: string[];
  taskToAcceptanceCriteriaLinks: Array<{ task: string; criteriaIds: string[] }>;
  dependencies: string[];
  riskNotes: string[];
};

/** A test observation, linked to the acceptance criteria it exercises. */
export type TestObservation = {
  name: string;
  status: "pass" | "fail" | "skipped";
  criteriaIds: string[];
};

/** 6. Implementation evidence. */
export type ImplementationEvidenceNode = {
  repo: string | null;
  branch: string | null;
  prNumber: number | null;
  changedFiles: string[];
  diffSummary: string;
  tests: TestObservation[];
  ciStatus: "pass" | "fail" | "pending" | "unknown";
  deploymentStatus: "deployed" | "not_deployed" | "unknown";
  sourceRefs: string[];
};

/** 7. Cross-review evidence. */
export type CrossReviewEvidenceNode = {
  reviewer: string;
  role: string;
  findings: string[];
  severity: "high" | "medium" | "low" | "none";
  affectedCriteria: string[];
  unresolvedBlockers: string[];
};

/**
 * 8. Visual / interaction evidence. CONTRACT ONLY in this stage — there is no runner yet.
 * When absent or `notVerified === true`, product/UI behavior must be reported Not Verified.
 */
export type VisualInteractionEvidenceNode = {
  routesDetected: string[];
  clickableElementsDetected: number;
  clickedSafely: number;
  skippedDestructive: number;
  blockedByAuth: number;
  failedInteractions: string[];
  screenshots: string[];
  consoleErrors: string[];
  networkFailures: string[];
  notVerified: boolean;
};

/** 9. Gate decision. */
export type GateDecisionNode = {
  decision: DecisionState;
  reasons: string[];
  verified: string[];
  broken: string[];
  notVerified: string[];
  assumptions: string[];
  userDecisionNeeded: string[];
  humanGateRequired: boolean;
  nextSafestAction: string;
  doNotDoYet: string[];
};

/** 10. Receipt. */
export type ReceiptType =
  | "idea"
  | "prd"
  | "build"
  | "release_gate"
  | "progress"
  | "technology_recommendation";

export type ReceiptNode = {
  receiptType: ReceiptType;
  summary: string;
  changed: string[];
  improved: string[];
  verified: string[];
  broken: string[];
  notVerified: string[];
  skipped: string[];
  userDecisionNeeded: string[];
  requiredHumanGate: boolean;
  nextSafestAction: string;
  limitations: string[];
};

/** The full acceptance graph. All nodes optional except the project frame. */
export type AcceptanceGraph = {
  projectId: string;
  intakeSource: IntakeSource;
  intent: UserIntentNode | null;
  clarifyingAnswers: ClarifyingAnswerNode[];
  prd: PrdArtifactNode | null;
  buildPlan: BuildPlanNode | null;
  implementation: ImplementationEvidenceNode | null;
  crossReviews: CrossReviewEvidenceNode[];
  visual: VisualInteractionEvidenceNode | null;
};

/** Loose input shape accepted by createAcceptanceGraph (everything optional). */
export type AcceptanceGraphInput = {
  projectId?: string;
  intakeSource?: IntakeSource;
  intent?: Partial<UserIntentNode> | null;
  clarifyingAnswers?: Array<Partial<ClarifyingAnswerNode>>;
  prd?: Partial<PrdArtifactNode> | null;
  buildPlan?: Partial<BuildPlanNode> | null;
  implementation?: Partial<ImplementationEvidenceNode> | null;
  crossReviews?: Array<Partial<CrossReviewEvidenceNode>>;
  visual?: Partial<VisualInteractionEvidenceNode> | null;
};

const arr = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Infer intake source when not explicitly provided (deterministic). */
export function deriveIntakeSource(input: AcceptanceGraphInput): IntakeSource {
  if (input.intakeSource) return input.intakeSource;
  const hasIdea = !!input.intent;
  const hasPrd = !!input.prd;
  const hasRepo = !!input.implementation;
  const count = [hasIdea, hasPrd, hasRepo].filter(Boolean).length;
  if (count > 1) return "mixed";
  if (hasRepo) return "repo";
  if (hasPrd) return "prd";
  return "idea";
}

/**
 * Build a normalized AcceptanceGraph from loose input. Pure, never throws — missing fields
 * become null/[]; presence is what later gap analysis reads. Does NOT invent intent or PRD.
 */
export function createAcceptanceGraph(input: AcceptanceGraphInput = {}): AcceptanceGraph {
  const intent: UserIntentNode | null = input.intent
    ? {
        id: str(input.intent.id) || "intent",
        summary: str(input.intent.summary),
        targetFirstUser: str(input.intent.targetFirstUser),
        desiredBehaviorChange: str(input.intent.desiredBehaviorChange),
        nonGoals: arr(input.intent.nonGoals),
        assumptions: arr(input.intent.assumptions),
        unknowns: arr(input.intent.unknowns),
        sourceRefs: arr(input.intent.sourceRefs),
      }
    : null;

  const prd: PrdArtifactNode | null = input.prd
    ? {
        summary: str(input.prd.summary),
        requirements: arr(input.prd.requirements),
        userFlows: arr(input.prd.userFlows),
        acceptanceCriteria: arr(input.prd.acceptanceCriteria).filter(
          (c): c is AcceptanceCriterion => !!c && typeof c.id === "string" && typeof c.text === "string",
        ),
        edgeCases: arr(input.prd.edgeCases),
        outOfScope: arr(input.prd.outOfScope),
        unknowns: arr(input.prd.unknowns),
        sourceRefs: arr(input.prd.sourceRefs),
      }
    : null;

  const buildPlan: BuildPlanNode | null = input.buildPlan
    ? {
        tasks: arr(input.buildPlan.tasks),
        taskToAcceptanceCriteriaLinks: arr(input.buildPlan.taskToAcceptanceCriteriaLinks).map((l) => ({
          task: str(l?.task),
          criteriaIds: arr(l?.criteriaIds),
        })),
        dependencies: arr(input.buildPlan.dependencies),
        riskNotes: arr(input.buildPlan.riskNotes),
      }
    : null;

  const implementation: ImplementationEvidenceNode | null = input.implementation
    ? {
        repo: input.implementation.repo ?? null,
        branch: input.implementation.branch ?? null,
        prNumber: typeof input.implementation.prNumber === "number" ? input.implementation.prNumber : null,
        changedFiles: arr(input.implementation.changedFiles),
        diffSummary: str(input.implementation.diffSummary),
        tests: arr(input.implementation.tests).map((t) => ({
          name: str(t?.name),
          status: t?.status === "pass" || t?.status === "fail" || t?.status === "skipped" ? t.status : "skipped",
          criteriaIds: arr(t?.criteriaIds),
        })),
        ciStatus:
          input.implementation.ciStatus === "pass" ||
          input.implementation.ciStatus === "fail" ||
          input.implementation.ciStatus === "pending"
            ? input.implementation.ciStatus
            : "unknown",
        deploymentStatus:
          input.implementation.deploymentStatus === "deployed" ||
          input.implementation.deploymentStatus === "not_deployed"
            ? input.implementation.deploymentStatus
            : "unknown",
        sourceRefs: arr(input.implementation.sourceRefs),
      }
    : null;

  const crossReviews: CrossReviewEvidenceNode[] = arr(input.crossReviews).map((r) => ({
    reviewer: str(r?.reviewer),
    role: str(r?.role),
    findings: arr(r?.findings),
    severity: r?.severity === "high" || r?.severity === "medium" || r?.severity === "low" ? r.severity : "none",
    affectedCriteria: arr(r?.affectedCriteria),
    unresolvedBlockers: arr(r?.unresolvedBlockers),
  }));

  const visual: VisualInteractionEvidenceNode | null = input.visual
    ? {
        routesDetected: arr(input.visual.routesDetected),
        clickableElementsDetected: Number(input.visual.clickableElementsDetected ?? 0) || 0,
        clickedSafely: Number(input.visual.clickedSafely ?? 0) || 0,
        skippedDestructive: Number(input.visual.skippedDestructive ?? 0) || 0,
        blockedByAuth: Number(input.visual.blockedByAuth ?? 0) || 0,
        failedInteractions: arr(input.visual.failedInteractions),
        screenshots: arr(input.visual.screenshots),
        consoleErrors: arr(input.visual.consoleErrors),
        networkFailures: arr(input.visual.networkFailures),
        notVerified: input.visual.notVerified !== false,
      }
    : null;

  const graph: AcceptanceGraph = {
    projectId: str(input.projectId) || "project",
    intakeSource: "idea",
    intent,
    clarifyingAnswers: arr(input.clarifyingAnswers).map((c) => ({
      question: str(c?.question),
      answer: str(c?.answer),
      reasonAsked: str(c?.reasonAsked),
      affects: arr(c?.affects),
    })),
    prd,
    buildPlan,
    implementation,
    crossReviews,
    visual,
  };
  graph.intakeSource = deriveIntakeSource({ ...input, intent, prd, implementation });
  return graph;
}

/** True when the intent is missing any of the three fields needed to evaluate a PRD. */
export function isUserIntentAmbiguous(graph: AcceptanceGraph): boolean {
  const i = graph.intent;
  if (!i) return true;
  return !i.summary || !i.targetFirstUser || !i.desiredBehaviorChange;
}

export type CriterionStatus = "verified" | "broken" | "not_verified";
export type CriterionGap = { id: string; text: string; status: CriterionStatus };

/**
 * Per-criterion verification status, derived deterministically from test observations:
 *   - any failing test referencing it           → broken
 *   - else any passing test referencing it       → verified
 *   - else (no test, or only skipped tests)      → not_verified
 * Visual-dependent confirmation is intentionally NOT inferred here; absence stays not_verified.
 */
export function summarizeAcceptanceGap(graph: AcceptanceGraph): {
  criteria: CriterionGap[];
  missingCriteria: boolean;
  verifiedCount: number;
  brokenCount: number;
  notVerifiedCount: number;
} {
  const criteria = graph.prd?.acceptanceCriteria ?? [];
  const tests = graph.implementation?.tests ?? [];
  const gaps: CriterionGap[] = criteria.map((c) => {
    const refs = tests.filter((t) => t.criteriaIds.includes(c.id));
    let status: CriterionStatus = "not_verified";
    if (refs.some((t) => t.status === "fail")) status = "broken";
    else if (refs.some((t) => t.status === "pass")) status = "verified";
    return { id: c.id, text: c.text, status };
  });
  return {
    criteria: gaps,
    missingCriteria: criteria.length === 0,
    verifiedCount: gaps.filter((g) => g.status === "verified").length,
    brokenCount: gaps.filter((g) => g.status === "broken").length,
    notVerifiedCount: gaps.filter((g) => g.status === "not_verified").length,
  };
}

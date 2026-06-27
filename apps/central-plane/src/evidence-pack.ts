/**
 * evidence-pack.ts — Stage 257A (Simsa deterministic Evidence Pack + Receipt).
 *
 * Pure helpers that turn an AcceptanceGraph into a deterministic evidence pack, a gate
 * decision, and a receipt. NO network/DB/env/LLM. Per policy §12 (docs/simsa-autopilot-
 * operating-model.md): risk flags are booleans derived from inputs (changed-file paths +
 * structured nodes) — agent prose is NEVER treated as proof, and absent evidence is
 * "Not Verified", never "Pass". Per policy §20: NO numeric scoring.
 */
import {
  type AcceptanceGraph,
  type DecisionState,
  type GateDecisionNode,
  type ReceiptNode,
  type ReceiptType,
  isUserIntentAmbiguous,
  summarizeAcceptanceGap,
} from "./acceptance-graph.js";

/** Deterministic risk flags. Every flag is a boolean computed from provided inputs. */
export type RiskFlags = {
  migrationChanged: boolean;
  deployConfigChanged: boolean;
  envSecretTouched: boolean;
  authPolicyTouched: boolean;
  paymentTouched: boolean;
  oauthTouched: boolean;
  dnsCorsTouched: boolean;
  d1WriteDetected: boolean;
  destructiveActionDetected: boolean;
  workspaceClaimTouched: boolean;
  publicLaunchTouched: boolean;
  visualEvidenceMissing: boolean;
  acceptanceCriteriaMissing: boolean;
  userIntentAmbiguous: boolean;
};

/** The flags that, when true, force a hard human gate (policy §7). */
export const HARD_GATE_FLAGS: Array<keyof RiskFlags> = [
  "migrationChanged",
  "deployConfigChanged",
  "envSecretTouched",
  "authPolicyTouched",
  "paymentTouched",
  "oauthTouched",
  "dnsCorsTouched",
  "d1WriteDetected",
  "destructiveActionDetected",
  "workspaceClaimTouched",
  "publicLaunchTouched",
];

export type EvidencePack = {
  taskId: string | null;
  stageId: string | null;
  projectId: string;
  intakeSource: AcceptanceGraph["intakeSource"];
  branch: string | null;
  base: string | null;
  head: string | null;
  prNumber: number | null;
  artifactSummary: string;
  changedFiles: string[];
  productEvidence: { intentPresent: boolean; prdPresent: boolean; acceptanceCriteriaCount: number };
  engineeringEvidence: {
    testsPass: number;
    testsFail: number;
    testsSkipped: number;
    ciStatus: string;
    deploymentStatus: string;
  };
  crossReviewEvidence: { reviewers: number; unresolvedBlockers: string[] };
  visualEvidence: { present: boolean; notVerified: boolean; failedInteractions: string[] };
  riskFlags: RiskFlags;
  verified: string[];
  broken: string[];
  skipped: string[];
  notVerified: string[];
  userDecisionNeeded: string[];
  humanGateRequired: boolean;
  requiredApprovalPhrase: string | null;
  nextSafestAction: string;
  doNotDoYet: string[];
  limitations: string[];
};

const matchAny = (files: string[], re: RegExp): boolean => files.some((f) => re.test(f));

/** Compute deterministic risk flags from the graph (changed-file paths + structured nodes). */
export function deriveRiskFlags(graph: AcceptanceGraph): RiskFlags {
  const files = graph.implementation?.changedFiles ?? [];
  const diff = graph.implementation?.diffSummary ?? "";
  const gap = summarizeAcceptanceGap(graph);
  return {
    migrationChanged: matchAny(files, /(^|\/)migrations\/.*\.sql$/i),
    deployConfigChanged: matchAny(files, /(\.github\/workflows\/.*deploy|vercel\.json|\.github\/workflows\/release)/i),
    envSecretTouched: matchAny(files, /(^|\/)(\.env|wrangler\.toml)(\.|$)|\.env($|\.)/i),
    authPolicyTouched: matchAny(files, /auth-signup-policy|auth-topology|better-auth|auth-spike/i),
    paymentTouched: matchAny(files, /billing|lemonsqueezy|payment|checkout/i),
    oauthTouched: matchAny(files, /oauth/i),
    dnsCorsTouched: matchAny(files, /(^|\/)cors\.|dns|domain/i),
    d1WriteDetected: /\b(INSERT|UPDATE|DELETE)\b/i.test(diff),
    destructiveActionDetected: /\b(DROP|TRUNCATE)\b/i.test(diff) || /\bDELETE\b.*\bWHERE\b/i.test(diff),
    workspaceClaimTouched: matchAny(files, /claim/i) || /workspace_projects[\s\S]*\bUPDATE\b|\bUPDATE\b[\s\S]*workspace_projects/i.test(diff),
    publicLaunchTouched: matchAny(files, /launch/i),
    visualEvidenceMissing: !graph.visual || graph.visual.notVerified === true,
    acceptanceCriteriaMissing: gap.missingCriteria,
    userIntentAmbiguous: isUserIntentAmbiguous(graph),
  };
}

function approvalPhraseFor(flags: RiskFlags): string | null {
  if (flags.migrationChanged || flags.d1WriteDetected) return "<feature> production D1 apply approved.";
  if (flags.envSecretTouched || flags.authPolicyTouched) return "<feature> production env provisioning approved.";
  if (flags.deployConfigChanged) return "<feature> central-plane production deploy approved.";
  if (flags.publicLaunchTouched) return "<feature> public launch approved.";
  if (flags.paymentTouched || flags.oauthTouched || flags.dnsCorsTouched || flags.destructiveActionDetected || flags.workspaceClaimTouched)
    return "<feature> production change approved.";
  return null;
}

/**
 * Build the deterministic evidence pack from the acceptance graph.
 * Absent evidence becomes Not Verified, never Pass.
 */
export function deriveEvidencePack(
  graph: AcceptanceGraph,
  meta: { taskId?: string | null; stageId?: string | null; base?: string | null; head?: string | null } = {},
): EvidencePack {
  const gap = summarizeAcceptanceGap(graph);
  const tests = graph.implementation?.tests ?? [];
  const flags = deriveRiskFlags(graph);
  const humanGateRequired = HARD_GATE_FLAGS.some((k) => flags[k]);

  const verified: string[] = gap.criteria.filter((c) => c.status === "verified").map((c) => `criterion ${c.id}: ${c.text}`);
  const broken: string[] = gap.criteria.filter((c) => c.status === "broken").map((c) => `criterion ${c.id}: ${c.text}`);
  const notVerified: string[] = gap.criteria.filter((c) => c.status === "not_verified").map((c) => `criterion ${c.id}: ${c.text}`);
  if (flags.acceptanceCriteriaMissing) notVerified.push("no acceptance criteria provided — nothing can be verified");
  if (flags.visualEvidenceMissing) notVerified.push("visual/interaction evidence missing — product UI behavior not verified");

  // Unresolved cross-review blockers are broken signals (something is wrong, not merely unproven).
  for (const r of graph.crossReviews) for (const b of r.unresolvedBlockers) broken.push(`review blocker (${r.reviewer || r.role}): ${b}`);

  const skipped: string[] = tests.filter((t) => t.status === "skipped").map((t) => `test skipped: ${t.name}`);

  // User decision needed: an implementation choice over an ambiguous PRD (no criteria but code exists).
  const userDecisionNeeded: string[] = [];
  if (graph.implementation && flags.acceptanceCriteriaMissing && !flags.userIntentAmbiguous) {
    userDecisionNeeded.push("implementation exists but PRD has no acceptance criteria — confirm the implemented behavior matches intent");
  }
  if (graph.implementation && graph.intent && !graph.prd) {
    userDecisionNeeded.push("repo-first project without a PRD — confirm intent-to-implementation alignment");
  }

  const limitations = [
    "Risk flags are derived from changed-file paths and diff text only; they do not execute the diff.",
    "Visual/interaction evidence is a contract placeholder in this stage — no browser runner is invoked.",
    "Simsa does not claim to find all bugs or to produce a perfect product.",
  ];

  return {
    taskId: meta.taskId ?? null,
    stageId: meta.stageId ?? null,
    projectId: graph.projectId,
    intakeSource: graph.intakeSource,
    branch: graph.implementation?.branch ?? null,
    base: meta.base ?? null,
    head: meta.head ?? null,
    prNumber: graph.implementation?.prNumber ?? null,
    artifactSummary: graph.prd?.summary || graph.intent?.summary || "",
    changedFiles: graph.implementation?.changedFiles ?? [],
    productEvidence: {
      intentPresent: !!graph.intent,
      prdPresent: !!graph.prd,
      acceptanceCriteriaCount: graph.prd?.acceptanceCriteria.length ?? 0,
    },
    engineeringEvidence: {
      testsPass: tests.filter((t) => t.status === "pass").length,
      testsFail: tests.filter((t) => t.status === "fail").length,
      testsSkipped: tests.filter((t) => t.status === "skipped").length,
      ciStatus: graph.implementation?.ciStatus ?? "unknown",
      deploymentStatus: graph.implementation?.deploymentStatus ?? "unknown",
    },
    crossReviewEvidence: {
      reviewers: graph.crossReviews.length,
      unresolvedBlockers: graph.crossReviews.flatMap((r) => r.unresolvedBlockers),
    },
    visualEvidence: {
      present: !!graph.visual,
      notVerified: flags.visualEvidenceMissing,
      failedInteractions: graph.visual?.failedInteractions ?? [],
    },
    riskFlags: flags,
    verified,
    broken,
    skipped,
    notVerified,
    userDecisionNeeded,
    humanGateRequired,
    requiredApprovalPhrase: humanGateRequired ? approvalPhraseFor(flags) : null,
    nextSafestAction: "", // filled by classifyGateDecision via createReceipt
    doNotDoYet: humanGateRequired ? ["Do not auto-merge", "Do not deploy", "Do not mutate production"] : [],
    limitations,
  };
}

/**
 * Deterministic gate decision from an evidence pack. Priority order is fixed so the same pack
 * always yields the same decision. NO numeric score is produced.
 */
export function classifyGateDecision(pack: EvidencePack): GateDecisionNode {
  const reasons: string[] = [];
  let decision: DecisionState;

  if (pack.riskFlags.userIntentAmbiguous && !pack.productEvidence.prdPresent) {
    decision = "Needs Clarification";
    reasons.push("user intent is incomplete and no PRD is present");
  } else if (pack.broken.length > 0) {
    decision = "Needs Fix";
    reasons.push(`${pack.broken.length} broken item(s) detected`);
  } else if (pack.userDecisionNeeded.length > 0) {
    // An implementation exists but its behavior is unconfirmed against intent/PRD — a user
    // accept/reject decision outranks "author more criteria", since code is already on the table.
    decision = "User Acceptance Required";
    reasons.push("an implementation choice requires user confirmation");
  } else if (pack.riskFlags.acceptanceCriteriaMissing) {
    decision = "Needs Evidence";
    reasons.push("no acceptance criteria — there is nothing to verify against");
  } else if (pack.notVerified.length > 0) {
    decision = "Not Verified";
    reasons.push(`${pack.notVerified.length} item(s) lack verifying evidence`);
  } else if (pack.verified.length > 0) {
    decision = pack.humanGateRequired ? "Conditionally Ready" : "Ready";
    reasons.push(`${pack.verified.length} criterion(s) verified`);
    if (pack.humanGateRequired) reasons.push("a hard human gate is required before production");
  } else {
    decision = "Not Judged";
    reasons.push("insufficient signal to decide");
  }

  const nextSafestAction =
    decision === "Needs Clarification"
      ? "Ask the user the clarifying questions before generating or evaluating a PRD."
      : decision === "Needs Evidence"
        ? "Author acceptance criteria, then gather verifying evidence."
        : decision === "Needs Fix"
          ? "Fix the broken items and re-run verification."
          : decision === "User Acceptance Required"
            ? "Surface the implemented behavior to the user for an accept/reject decision."
            : decision === "Not Verified"
              ? "Add the missing verification (tests and/or visual/interaction evidence)."
              : pack.humanGateRequired
                ? "Request the required human approval; do not auto-advance."
                : "Safe to advance under the autopilot low-risk policy.";

  return {
    decision,
    reasons,
    verified: pack.verified,
    broken: pack.broken,
    notVerified: pack.notVerified,
    assumptions: [],
    userDecisionNeeded: pack.userDecisionNeeded,
    humanGateRequired: pack.humanGateRequired,
    nextSafestAction,
    doNotDoYet: pack.doNotDoYet,
  };
}

export function listNotVerified(pack: EvidencePack): string[] {
  return [...pack.notVerified];
}

export function listUserDecisionNeeded(pack: EvidencePack): string[] {
  return [...pack.userDecisionNeeded];
}

/** Build a receipt from an evidence pack. NO numeric fields are produced (policy §20). */
export function createReceipt(pack: EvidencePack, receiptType: ReceiptType = "release_gate"): ReceiptNode {
  const gate = classifyGateDecision(pack);
  return {
    receiptType,
    summary: `${gate.decision}: ${gate.reasons.join("; ")}`,
    changed: pack.changedFiles,
    improved: [],
    verified: pack.verified,
    broken: pack.broken,
    notVerified: pack.notVerified,
    skipped: pack.skipped,
    userDecisionNeeded: pack.userDecisionNeeded,
    requiredHumanGate: pack.humanGateRequired,
    nextSafestAction: gate.nextSafestAction,
    limitations: pack.limitations,
  };
}

/**
 * Guard: a receipt must never carry a numeric score. Returns true when clean, throws otherwise.
 * Catches "82/100", "score: 76", and any key literally named *score*.
 */
export function assertNoNumericScores(receipt: ReceiptNode): true {
  for (const [key, value] of Object.entries(receipt)) {
    if (/score/i.test(key)) throw new Error(`numeric scoring is forbidden: receipt has a "${key}" field`);
    const texts = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    for (const t of texts) {
      if (typeof t !== "string") continue;
      if (/\b\d{1,3}\s*\/\s*100\b/.test(t)) throw new Error(`numeric scoring is forbidden: found "${t}"`);
      if (/\bscore\s*[:=]\s*\d/i.test(t)) throw new Error(`numeric scoring is forbidden: found "${t}"`);
    }
  }
  return true;
}

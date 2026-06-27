/**
 * evidence-pack.test.mjs — Stage 257A.
 *
 * Deterministic evidence pack → gate decision → receipt. Imports dist. Verifies the 8 mandated
 * cases: idea-only, PRD-first (no impl), repo-first (no PRD), PRD+impl partial coverage, visual
 * evidence missing, implementation-choice → user decision, risk-flag detection, and the hard
 * no-numeric-scoring guarantee.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAcceptanceGraph } from "../dist/acceptance-graph.js";
import {
  deriveEvidencePack,
  deriveRiskFlags,
  classifyGateDecision,
  createReceipt,
  assertNoNumericScores,
  listNotVerified,
  listUserDecisionNeeded,
} from "../dist/evidence-pack.js";

// 1. Idea-only project: intent but no PRD → Needs Clarification, never a fake Done.
test("idea-only project → Needs Clarification (ambiguous intent, no PRD), no fake Done", () => {
  const g = createAcceptanceGraph({ intent: { summary: "an app" } }); // missing targetFirstUser/behavior
  const pack = deriveEvidencePack(g);
  const gate = classifyGateDecision(pack);
  assert.equal(gate.decision, "Needs Clarification");
  assert.equal(pack.verified.length, 0);
});

// 2. PRD-first project: criteria but no implementation → not Ready, implementation Not Verified.
test("PRD-first with criteria but no implementation → Not Verified, not Ready", () => {
  const g = createAcceptanceGraph({
    intent: { summary: "s", targetFirstUser: "u", desiredBehaviorChange: "b" },
    prd: { summary: "p", acceptanceCriteria: [{ id: "AC1", text: "does X" }] },
  });
  const pack = deriveEvidencePack(g);
  const gate = classifyGateDecision(pack);
  assert.notEqual(gate.decision, "Ready");
  assert.equal(gate.decision, "Not Verified");
  assert.ok(listNotVerified(pack).some((s) => s.includes("AC1")));
});

// 3. Repo-first without PRD → user decision / clarification required.
test("repo-first without PRD → user decision needed (intent present) or needs evidence", () => {
  const g = createAcceptanceGraph({
    intent: { summary: "s", targetFirstUser: "u", desiredBehaviorChange: "b" },
    implementation: { repo: "r", branch: "main", changedFiles: ["src/x.ts"], tests: [] },
  });
  const pack = deriveEvidencePack(g);
  const gate = classifyGateDecision(pack);
  assert.ok(listUserDecisionNeeded(pack).length > 0);
  assert.equal(gate.decision, "User Acceptance Required");
});

// 4. PRD + implementation, one criterion covered, one missing → receipt separates verified/not.
test("PRD + impl partial coverage → receipt separates verified and not verified", () => {
  const g = createAcceptanceGraph({
    intent: { summary: "s", targetFirstUser: "u", desiredBehaviorChange: "b" },
    prd: {
      summary: "p",
      acceptanceCriteria: [
        { id: "AC1", text: "covered" },
        { id: "AC2", text: "uncovered" },
      ],
    },
    visual: { notVerified: false, routesDetected: ["/"], clickableElementsDetected: 1, clickedSafely: 1 },
    implementation: {
      repo: "r",
      changedFiles: ["src/x.ts"],
      tests: [{ name: "t1", status: "pass", criteriaIds: ["AC1"] }],
    },
  });
  const pack = deriveEvidencePack(g);
  assert.ok(pack.verified.some((s) => s.includes("AC1")));
  assert.ok(pack.notVerified.some((s) => s.includes("AC2")));
  const gate = classifyGateDecision(pack);
  assert.equal(gate.decision, "Not Verified"); // AC2 still unproven
});

// 5. Build/test pass but visual evidence missing → must NOT claim product Done.
test("tests pass but visual evidence missing → product not claimed Done (Not Verified)", () => {
  const g = createAcceptanceGraph({
    intent: { summary: "s", targetFirstUser: "u", desiredBehaviorChange: "b" },
    prd: { summary: "p", acceptanceCriteria: [{ id: "AC1", text: "ui works" }] },
    implementation: {
      repo: "r",
      changedFiles: ["src/x.ts"],
      ciStatus: "pass",
      tests: [{ name: "t1", status: "pass", criteriaIds: ["AC1"] }],
    },
    // no visual node → visualEvidenceMissing
  });
  const pack = deriveEvidencePack(g);
  assert.equal(pack.riskFlags.visualEvidenceMissing, true);
  assert.ok(pack.notVerified.some((s) => /visual\/interaction evidence missing/.test(s)));
  const gate = classifyGateDecision(pack);
  assert.notEqual(gate.decision, "Ready");
});

// 6. Implementation makes a UX choice the PRD left ambiguous → userDecisionNeeded populated.
test("implementation choice over ambiguous PRD → userDecisionNeeded populated", () => {
  const g = createAcceptanceGraph({
    intent: { summary: "s", targetFirstUser: "u", desiredBehaviorChange: "b" },
    // PRD present but no acceptance criteria = ambiguous spec
    prd: { summary: "p", acceptanceCriteria: [] },
    implementation: { repo: "r", changedFiles: ["src/ui.tsx"], tests: [] },
  });
  const pack = deriveEvidencePack(g);
  assert.ok(listUserDecisionNeeded(pack).length > 0);
});

// 7. Risk flag detection from changedFiles + diff text.
test("risk flags detect migration/deploy/env/auth/payment/oauth/D1/destructive deterministically", () => {
  const g = createAcceptanceGraph({
    implementation: {
      repo: "r",
      changedFiles: [
        "apps/central-plane/migrations/0049_x.sql",
        ".github/workflows/deploy-central-plane.yml",
        "apps/central-plane/wrangler.toml",
        "apps/central-plane/src/auth-signup-policy.ts",
        "apps/central-plane/src/routes/billing.ts",
        "apps/central-plane/src/routes/oauth.ts",
        "apps/central-plane/src/routes/cors.ts",
      ],
      diffSummary: "INSERT INTO workspace_members ...; DROP TABLE old;",
      tests: [],
    },
  });
  const f = deriveRiskFlags(g);
  assert.equal(f.migrationChanged, true);
  assert.equal(f.deployConfigChanged, true);
  assert.equal(f.envSecretTouched, true);
  assert.equal(f.authPolicyTouched, true);
  assert.equal(f.paymentTouched, true);
  assert.equal(f.oauthTouched, true);
  assert.equal(f.dnsCorsTouched, true);
  assert.equal(f.d1WriteDetected, true);
  assert.equal(f.destructiveActionDetected, true);
  const pack = deriveEvidencePack(g);
  assert.equal(pack.humanGateRequired, true);
  assert.ok(pack.requiredApprovalPhrase && pack.requiredApprovalPhrase.length > 0);
});

test("no risk → no hard gate, no approval phrase required", () => {
  const g = createAcceptanceGraph({
    intent: { summary: "s", targetFirstUser: "u", desiredBehaviorChange: "b" },
    prd: { summary: "p", acceptanceCriteria: [{ id: "AC1", text: "x" }] },
    visual: { notVerified: false },
    implementation: { repo: "r", changedFiles: ["docs/readme.md"], diffSummary: "text", tests: [{ name: "t1", status: "pass", criteriaIds: ["AC1"] }] },
  });
  const pack = deriveEvidencePack(g);
  assert.equal(pack.humanGateRequired, false);
  assert.equal(pack.requiredApprovalPhrase, null);
  assert.equal(classifyGateDecision(pack).decision, "Ready");
});

// 8. No numeric scoring anywhere in the receipt.
test("receipt carries NO numeric score; assertNoNumericScores passes for valid receipts", () => {
  const g = createAcceptanceGraph({
    intent: { summary: "s", targetFirstUser: "u", desiredBehaviorChange: "b" },
    prd: { summary: "p", acceptanceCriteria: [{ id: "AC1", text: "x" }] },
    implementation: { repo: "r", tests: [{ name: "t1", status: "pass", criteriaIds: ["AC1"] }] },
  });
  const receipt = createReceipt(deriveEvidencePack(g));
  assert.equal(assertNoNumericScores(receipt), true);
  assert.ok(!("score" in receipt));
  // summary uses a readiness state, not a number
  assert.ok(!/\b\d{1,3}\s*\/\s*100\b/.test(receipt.summary));
});

test("assertNoNumericScores throws if a score field or NN/100 string is injected", () => {
  const bad1 = { receiptType: "build", summary: "ok", changed: [], improved: [], verified: ["score: 82"], broken: [], notVerified: [], skipped: [], userDecisionNeeded: [], requiredHumanGate: false, nextSafestAction: "", limitations: [] };
  assert.throws(() => assertNoNumericScores(bad1), /numeric scoring is forbidden/);
  const bad2 = { receiptType: "build", summary: "quality 82/100", changed: [], improved: [], verified: [], broken: [], notVerified: [], skipped: [], userDecisionNeeded: [], requiredHumanGate: false, nextSafestAction: "", limitations: [] };
  assert.throws(() => assertNoNumericScores(bad2), /numeric scoring is forbidden/);
  const bad3 = { receiptType: "build", summary: "ok", overallScore: 90, changed: [], improved: [], verified: [], broken: [], notVerified: [], skipped: [], userDecisionNeeded: [], requiredHumanGate: false, nextSafestAction: "", limitations: [] };
  assert.throws(() => assertNoNumericScores(bad3), /numeric scoring is forbidden/);
});

test("createReceipt is deterministic: same input → identical receipt", () => {
  const input = {
    intent: { summary: "s", targetFirstUser: "u", desiredBehaviorChange: "b" },
    prd: { summary: "p", acceptanceCriteria: [{ id: "AC1", text: "x" }] },
    implementation: { repo: "r", changedFiles: ["src/x.ts"], tests: [{ name: "t1", status: "pass", criteriaIds: ["AC1"] }] },
  };
  const r1 = createReceipt(deriveEvidencePack(createAcceptanceGraph(input)));
  const r2 = createReceipt(deriveEvidencePack(createAcceptanceGraph(input)));
  assert.deepEqual(r1, r2);
});

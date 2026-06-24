// Stage 136 — MCP Basic intake preview wrapper tests. Pure; no network/mutation.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  previewAcceptanceMap,
  previewStagePlan,
  previewAgentRunPlan,
  previewEvidencePlan,
  previewAcceptanceGraphSummary,
  previewRecurringBlockers,
} from "../src/mcp-basic-preview-tools.mjs";
import {
  buildIntakeAcceptanceMap,
  buildIntakeStagePlan,
  buildAgentRunPlan,
  buildIntakeEvidencePlan,
  buildAcceptanceGraphDerivedView,
} from "@conclave-ai/workspace-preview";

const WRAPPERS = [
  ["acceptance_map", previewAcceptanceMap],
  ["stage_plan", previewStagePlan],
  ["agent_run_plan", previewAgentRunPlan],
  ["evidence_plan", previewEvidencePlan],
];

function assertBoundary(r) {
  assert.equal(r.mutatesState, false);
  assert.equal(r.usesHostedExecution, false);
  assert.equal(r.requiresPayment, false);
  assert.equal(r.derivedPreviewOnly, true);
}

test("each wrapper returns a derived preview + boundary metadata", () => {
  for (const [kind, fn] of WRAPPERS) {
    const r = fn({ type: "github_repo", rawInput: "acme/web-app" });
    assert.equal(r.ok, true, kind);
    assert.equal(r.kind, kind);
    assert.ok(r.preview && typeof r.preview === "object", kind);
    assertBoundary(r);
  }
});

test("preview content matches the shared helper output shape", () => {
  const map = previewAcceptanceMap({ type: "prd", rawInput: "Overview: x. User can submit." });
  assert.ok(Array.isArray(map.preview.items));
  const stage = previewStagePlan({ type: "github_repo", rawInput: "acme/web-app" });
  assert.ok(Array.isArray(stage.preview.stages));
  const run = previewAgentRunPlan({ type: "github_repo", rawInput: "acme/web-app" });
  assert.ok(Array.isArray(run.preview.tasks));
  const ev = previewEvidencePlan({ type: "github_repo", rawInput: "acme/web-app" });
  assert.ok(Array.isArray(ev.preview.expectations));
  assert.equal(ev.preview.overallEvidenceStatus, "not_verified");
});

test("missing input returns safe error object (no throw)", () => {
  for (const [, fn] of WRAPPERS) {
    const r = fn({ type: "github_repo", rawInput: "" });
    assert.equal(r.ok, false);
    assert.equal(r.error, "missing_input");
    assert.ok(r.message.length > 0);
    assertBoundary(r);
  }
});

test("invalid type returns safe error object", () => {
  const r = previewAcceptanceMap({ type: "bogus", rawInput: "x" });
  assert.equal(r.ok, false);
  assert.equal(r.error, "invalid_type");
  assertBoundary(r);
});

test("malformed input does not throw", () => {
  for (const m of [null, undefined, 7, "x", {}, { type: 1, rawInput: 2 }]) {
    for (const [, fn] of WRAPPERS) {
      assert.doesNotThrow(() => fn(m));
    }
  }
});

test("deterministic output", () => {
  const a = previewAcceptanceMap({ type: "github_repo", rawInput: "acme/web-app" });
  const b = previewAcceptanceMap({ type: "github_repo", rawInput: "acme/web-app" });
  assert.deepEqual(a, b);
});

test("no Stripe/payment-provider strings in wrapper output", () => {
  const blob = JSON.stringify(previewEvidencePlan({ type: "github_repo", rawInput: "acme/web-app" })).toLowerCase();
  assert.ok(!blob.includes("stripe"));
});

// ── Stage 137 — snapshot-based graph/blocker wrappers ────────────────────────

function snapshot(type, rawInput) {
  const acceptanceMap = buildIntakeAcceptanceMap({ type, rawInput });
  const stagePlan = buildIntakeStagePlan({ type, rawInput });
  const agentRunPlan = buildAgentRunPlan({ type, rawInput });
  const evidencePlan = buildIntakeEvidencePlan({ type, rawInput });
  return { workflowRecordId: "wawr_t", title: `${type} wf`, sourceSummary: "s", acceptanceMap, stagePlan, agentRunPlan, evidencePlan };
}

test("previewAcceptanceGraphSummary returns ok/kind/preview/boundary", () => {
  const r = previewAcceptanceGraphSummary(snapshot("github_repo", "acme/web-app"));
  assert.equal(r.ok, true);
  assert.equal(r.kind, "acceptance_graph_summary");
  assert.ok(Array.isArray(r.preview.nodes) && Array.isArray(r.preview.edges));
  assert.ok(r.preview.signalSummary && typeof r.preview.signalSummary === "object");
  assertBoundary(r);
});

test("previewRecurringBlockers returns ok/kind/preview/boundary", () => {
  const r = previewRecurringBlockers(snapshot("github_repo", "acme/billing-api"));
  assert.equal(r.ok, true);
  assert.equal(r.kind, "recurring_blockers");
  assert.ok(Array.isArray(r.preview.blockers));
  assert.ok(r.preview.blockerCountByType && typeof r.preview.blockerCountByType === "object");
  assertBoundary(r);
});

test("recurring blockers wrapper derives graph internally when not provided", () => {
  // No acceptanceGraphView supplied — helper builds one from the snapshots.
  const snap = snapshot("github_repo", "acme/web-app");
  delete snap.acceptanceGraphView;
  const r = previewRecurringBlockers(snap);
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.preview.blockers));
});

test("recurring blockers wrapper accepts a provided graph view", () => {
  const snap = snapshot("github_repo", "acme/web-app");
  const graph = buildAcceptanceGraphDerivedView({ title: "g", sourceSummary: "s", ...snap });
  const r = previewRecurringBlockers({ ...snap, acceptanceGraphView: graph });
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.preview.blockers));
});

test("graph/blocker wrappers default title/sourceSummary and do not throw on malformed input", () => {
  for (const m of [null, undefined, 7, "x", {}, { acceptanceMap: "no", evidencePlan: 5 }]) {
    assert.doesNotThrow(() => previewAcceptanceGraphSummary(m));
    assert.doesNotThrow(() => previewRecurringBlockers(m));
  }
  const empty = previewAcceptanceGraphSummary({});
  assert.equal(empty.ok, true);
  assert.equal(empty.preview.title, "Untitled workflow");
});

test("graph/blocker wrappers are mutation/payment/hosted free, no Stripe", () => {
  const g = previewAcceptanceGraphSummary(snapshot("prd", "Overview: x. User can submit."));
  const b = previewRecurringBlockers(snapshot("prd", "Overview: x. User can submit."));
  assertBoundary(g);
  assertBoundary(b);
  // Scan the derived preview only — the boundary metadata legitimately contains
  // the field name "requiresPayment".
  const blob = (JSON.stringify(g.preview) + JSON.stringify(b.preview)).toLowerCase();
  assert.ok(!blob.includes("stripe"));
  assert.ok(!blob.includes("payment"));
});

test("graph/blocker wrappers are deterministic", () => {
  const a = previewAcceptanceGraphSummary(snapshot("github_repo", "acme/web-app"));
  const b = previewAcceptanceGraphSummary(snapshot("github_repo", "acme/web-app"));
  assert.deepEqual(a, b);
});

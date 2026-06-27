/**
 * acceptance-graph.test.mjs — Stage 257A.
 *
 * Pure deterministic contracts for the Simsa Acceptance Graph. Imports dist. Verifies intake
 * inference, intent-ambiguity detection, and per-criterion gap status (verified/broken/not_verified)
 * — including the rule that absent evidence is never "verified".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAcceptanceGraph,
  deriveIntakeSource,
  isUserIntentAmbiguous,
  summarizeAcceptanceGap,
  isDecisionState,
  DECISION_STATES,
} from "../dist/acceptance-graph.js";

test("createAcceptanceGraph is pure and fills safe defaults without inventing intent/PRD", () => {
  const g = createAcceptanceGraph({ projectId: "p1" });
  assert.equal(g.projectId, "p1");
  assert.equal(g.intent, null);
  assert.equal(g.prd, null);
  assert.equal(g.implementation, null);
  assert.deepEqual(g.clarifyingAnswers, []);
  assert.deepEqual(g.crossReviews, []);
});

test("intake source is inferred: idea-only → idea, repo-only → repo, idea+prd+repo → mixed", () => {
  assert.equal(deriveIntakeSource({ intent: { summary: "x" } }), "idea");
  assert.equal(deriveIntakeSource({ implementation: { repo: "r" } }), "repo");
  assert.equal(deriveIntakeSource({ prd: { summary: "p" } }), "prd");
  assert.equal(
    deriveIntakeSource({ intent: { summary: "x" }, prd: { summary: "p" }, implementation: { repo: "r" } }),
    "mixed",
  );
  // explicit override wins
  assert.equal(deriveIntakeSource({ intakeSource: "prd", intent: { summary: "x" } }), "prd");
});

test("intent is ambiguous unless summary + targetFirstUser + desiredBehaviorChange are all present", () => {
  assert.equal(isUserIntentAmbiguous(createAcceptanceGraph({})), true); // no intent
  assert.equal(isUserIntentAmbiguous(createAcceptanceGraph({ intent: { summary: "s" } })), true); // missing two
  const full = createAcceptanceGraph({
    intent: { summary: "s", targetFirstUser: "u", desiredBehaviorChange: "b" },
  });
  assert.equal(isUserIntentAmbiguous(full), false);
});

test("summarizeAcceptanceGap: passing test → verified, failing → broken, no/skip → not_verified", () => {
  const g = createAcceptanceGraph({
    prd: {
      summary: "p",
      acceptanceCriteria: [
        { id: "AC1", text: "login works" },
        { id: "AC2", text: "logout works" },
        { id: "AC3", text: "reset works" },
      ],
    },
    implementation: {
      repo: "r",
      tests: [
        { name: "t-login", status: "pass", criteriaIds: ["AC1"] },
        { name: "t-logout", status: "fail", criteriaIds: ["AC2"] },
        { name: "t-reset", status: "skipped", criteriaIds: ["AC3"] },
      ],
    },
  });
  const gap = summarizeAcceptanceGap(g);
  assert.equal(gap.missingCriteria, false);
  assert.equal(gap.verifiedCount, 1);
  assert.equal(gap.brokenCount, 1);
  assert.equal(gap.notVerifiedCount, 1);
  assert.equal(gap.criteria.find((c) => c.id === "AC1").status, "verified");
  assert.equal(gap.criteria.find((c) => c.id === "AC2").status, "broken");
  assert.equal(gap.criteria.find((c) => c.id === "AC3").status, "not_verified"); // skipped ≠ verified
});

test("a criterion with NO referencing test is not_verified (absent evidence is never a pass)", () => {
  const g = createAcceptanceGraph({
    prd: { summary: "p", acceptanceCriteria: [{ id: "AC1", text: "thing" }] },
    implementation: { repo: "r", tests: [{ name: "unrelated", status: "pass", criteriaIds: ["OTHER"] }] },
  });
  const gap = summarizeAcceptanceGap(g);
  assert.equal(gap.criteria[0].status, "not_verified");
  assert.equal(gap.verifiedCount, 0);
});

test("missingCriteria is true when the PRD has no acceptance criteria (or no PRD)", () => {
  assert.equal(summarizeAcceptanceGap(createAcceptanceGraph({})).missingCriteria, true);
  assert.equal(
    summarizeAcceptanceGap(createAcceptanceGraph({ prd: { summary: "p", acceptanceCriteria: [] } })).missingCriteria,
    true,
  );
});

test("decision states are a closed set and exclude any numeric notion", () => {
  assert.ok(isDecisionState("Ready"));
  assert.ok(isDecisionState("Not Verified"));
  assert.ok(!isDecisionState("82/100"));
  assert.ok(!isDecisionState("Pass"));
  // no state contains a digit
  for (const s of DECISION_STATES) assert.ok(!/\d/.test(s), `${s} must not contain a number`);
});

test("malformed acceptanceCriteria entries are dropped (no throw, deterministic)", () => {
  const g = createAcceptanceGraph({
    prd: { summary: "p", acceptanceCriteria: [{ id: "AC1", text: "ok" }, { id: 5 }, null, { text: "no id" }] },
  });
  assert.equal(g.prd.acceptanceCriteria.length, 1);
  assert.equal(g.prd.acceptanceCriteria[0].id, "AC1");
});

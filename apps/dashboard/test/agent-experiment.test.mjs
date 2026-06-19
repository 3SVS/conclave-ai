// Stage 71: manual multi-agent experiment templates + deterministic prompts.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXPERIMENT_TEMPLATES,
  getExperimentTemplate,
  buildCandidatePrompt,
  buildAllPromptsText,
  canSaveExperiment,
  experimentCandidateStatus,
} from "../src/lib/agent-experiment.mjs";

test("three built-in templates exist with expected modes + candidate counts", () => {
  assert.equal(EXPERIMENT_TEMPLATES.length, 3);
  const byId = Object.fromEntries(EXPERIMENT_TEMPLATES.map((t) => [t.id, t]));
  assert.equal(byId.single_agent_baseline.mode, "single_agent");
  assert.equal(byId.single_agent_baseline.candidates.length, 1);
  assert.equal(byId.multi_agent_split.mode, "multi_agent");
  assert.equal(byId.multi_agent_split.candidates.length, 2);
  assert.equal(byId.builder_reviewer.mode, "hybrid");
  assert.deepEqual(byId.builder_reviewer.candidates.map((c) => c.role), ["builder", "reviewer", "fixer"]);
});

test("getExperimentTemplate returns a template or null", () => {
  assert.equal(getExperimentTemplate("multi_agent_split")?.id, "multi_agent_split");
  assert.equal(getExperimentTemplate("nope"), null);
});

const promptParts = {
  roleInstruction: "You are Builder A. Implement the feature according to the product brief and acceptance items.",
  contextHeading: "Project context",
  context: "Project: Meeting summarizer",
  briefHeading: "Product brief",
  brief: "Summarize uploaded meeting recordings and extract action items.",
  acceptanceHeading: "Acceptance items",
  acceptanceItems: ["Upload audio file", "Generate summary", "Extract action items"],
  constraintsHeading: "Constraints",
  constraints: ["Stay within the product brief and acceptance items."],
  outputHeading: "Expected output",
  output: "A pull request implementing the acceptance items.",
  reportHeading: "Report back",
  report: "Reply with the PR number.",
};

test("candidate prompt includes role instruction, brief, and every acceptance item", () => {
  const p = buildCandidatePrompt(promptParts);
  assert.match(p, /^You are Builder A\./);
  assert.match(p, /## Product brief\nSummarize uploaded meeting recordings/);
  assert.match(p, /## Acceptance items\n- Upload audio file\n- Generate summary\n- Extract action items/);
  assert.match(p, /## Expected output\nA pull request/);
  assert.match(p, /## Report back\nReply with the PR number\./);
});

test("reviewer-style role instruction is preserved verbatim (no LLM rewrite)", () => {
  const p = buildCandidatePrompt({
    ...promptParts,
    roleInstruction: "You are Reviewer Agent. Review the implementation against the acceptance items.",
  });
  assert.match(p, /^You are Reviewer Agent\. Review the implementation against the acceptance items\./);
});

test("copy-all output includes every candidate label and prompt", () => {
  const text = buildAllPromptsText({
    heading: "Conclave Multi-Agent Experiment",
    candidatePrefix: "Candidate",
    candidates: [
      { label: "Builder A", prompt: "PROMPT_A" },
      { label: "Builder B", prompt: "PROMPT_B" },
    ],
  });
  assert.match(text, /^# Conclave Multi-Agent Experiment/);
  assert.match(text, /## Candidate: Builder A\n\nPROMPT_A/);
  assert.match(text, /## Candidate: Builder B\n\nPROMPT_B/);
});

test("no token / userKey leakage in generated prompt text", () => {
  const p = buildCandidatePrompt(promptParts);
  const all = buildAllPromptsText({ heading: "X", candidatePrefix: "Candidate", candidates: [{ label: "A", prompt: p }] });
  assert.doesNotMatch(all, /userKey|uk_|token|Bearer|ghp_|vcp_/i);
});

test("canSaveExperiment requires a title and a known template", () => {
  assert.equal(canSaveExperiment("", "multi_agent_split"), false);
  assert.equal(canSaveExperiment("   ", "multi_agent_split"), false);
  assert.equal(canSaveExperiment("My experiment", "nope"), false);
  assert.equal(canSaveExperiment("My experiment", "multi_agent_split"), true);
});

test("experimentCandidateStatus derives from current links", () => {
  assert.equal(experimentCandidateStatus({}), "planned");
  assert.equal(experimentCandidateStatus({ pullRequestNumber: 7 }), "pr_linked");
  assert.equal(experimentCandidateStatus({ pullRequestNumber: 7, reviewRunId: "wprr_x" }), "reviewed");
  assert.equal(experimentCandidateStatus({ reviewRunId: "wprr_x", benchmarkId: "wabm_y" }), "benchmarked");
});

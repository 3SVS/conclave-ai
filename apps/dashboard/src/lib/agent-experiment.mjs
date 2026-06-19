// Stage 71: Manual Multi-Agent Experiment protocol. PURE — no LLM, no network.
//
// Generates deterministic, copy-pasteable prompts so a human can hand the SAME
// product brief + acceptance items to several coding agents (Claude Code /
// Codex / Cursor / …), have each open a PR, then compare the resulting review
// runs with the Conclave benchmark. This module is data + assemblers only; all
// human-facing text is passed in already-localized (the UI owns i18n) so the
// prompts follow the dashboard language and nothing can leak a token/userKey.

/**
 * Built-in experiment templates. `labelKey` is resolved to a localized string
 * by the UI. Designed to lift into central-plane persistence later (Stage 72).
 */
export const EXPERIMENT_TEMPLATES = [
  {
    id: "single_agent_baseline",
    mode: "single_agent",
    candidates: [
      { id: "single", role: "builder", suggestedAgent: "claude_code", labelKey: "candSingleBuilder" },
    ],
  },
  {
    id: "multi_agent_split",
    mode: "multi_agent",
    candidates: [
      { id: "builder_a", role: "builder", suggestedAgent: "claude_code", labelKey: "candBuilderA" },
      { id: "builder_b", role: "builder", suggestedAgent: "codex", labelKey: "candBuilderB" },
    ],
  },
  {
    id: "builder_reviewer",
    mode: "hybrid",
    candidates: [
      { id: "builder", role: "builder", suggestedAgent: "claude_code", labelKey: "roleBuilder" },
      { id: "reviewer", role: "reviewer", suggestedAgent: "codex", labelKey: "roleReviewer" },
      { id: "fixer", role: "fixer", suggestedAgent: "cursor", labelKey: "roleFixer" },
    ],
  },
];

/** Look up a template by id (or null). */
export function getExperimentTemplate(id) {
  return EXPERIMENT_TEMPLATES.find((t) => t.id === id) ?? null;
}

/**
 * Assemble one candidate's deterministic prompt from already-localized parts.
 * Empty acceptance/constraints lists simply render no bullets.
 */
export function buildCandidatePrompt(parts) {
  const {
    roleInstruction,
    contextHeading,
    context,
    briefHeading,
    brief,
    acceptanceHeading,
    acceptanceItems = [],
    constraintsHeading,
    constraints = [],
    outputHeading,
    output,
    reportHeading,
    report,
  } = parts;

  const out = [roleInstruction, "", `## ${contextHeading}`, context, "", `## ${briefHeading}`, brief, "", `## ${acceptanceHeading}`];
  for (const item of acceptanceItems) out.push(`- ${item}`);
  out.push("", `## ${constraintsHeading}`);
  for (const c of constraints) out.push(`- ${c}`);
  out.push("", `## ${outputHeading}`, output, "", `## ${reportHeading}`, report);
  return out.join("\n");
}

/**
 * Concatenate all candidate prompts into one copy-all block.
 * `candidates` = [{ label, prompt }] in display order.
 */
export function buildAllPromptsText({ heading, candidatePrefix, candidates = [] }) {
  const out = [`# ${heading}`];
  for (const c of candidates) {
    out.push("", `## ${candidatePrefix}: ${c.label}`, "", c.prompt);
  }
  return out.join("\n");
}

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

/** Stage 72: the Save button is enabled only with a title and a known template. */
export function canSaveExperiment(title, templateId) {
  return Boolean(title && title.trim()) && EXPERIMENT_TEMPLATES.some((t) => t.id === templateId);
}

/** Stage 72: a candidate's status derived from its current links (mirrors server). */
export function experimentCandidateStatus(links) {
  if (links?.benchmarkId) return "benchmarked";
  if (links?.reviewRunId) return "reviewed";
  if (typeof links?.pullRequestNumber === "number") return "pr_linked";
  return "planned";
}

/** Stage 73: experiment candidates that have a linked review run. */
export function linkedExperimentCandidates(candidates) {
  return (candidates ?? []).filter((c) => c.reviewRunId);
}

/** Stage 73: a benchmark needs at least 2 candidates with linked review runs. */
export function canCreateBenchmarkFromExperiment(candidates) {
  return linkedExperimentCandidates(candidates).length >= 2;
}

/**
 * Stage 74: build the decision payload from per-candidate outcomes + notes.
 * Only one candidate may be "selected"; decisionStatus is derived. Outcomes of
 * "undecided" are dropped from the payload.
 */
export function buildExperimentDecision(outcomesByCandidate, notesByCandidate = {}, decisionNote) {
  const entries = Object.entries(outcomesByCandidate ?? {});
  const candidateOutcomes = entries
    .filter(([, outcome]) => outcome && outcome !== "undecided")
    .map(([candidateId, outcome]) => {
      const note = (notesByCandidate ?? {})[candidateId];
      return { candidateId, outcome, ...(note && note.trim() ? { note: note.trim() } : {}) };
    });
  const selectedIds = entries.filter(([, o]) => o === "selected").map(([id]) => id);
  const selectedCandidateId = selectedIds.length === 1 ? selectedIds[0] : undefined;
  const decisionStatus =
    selectedIds.length === 1
      ? "selected"
      : entries.some(([, o]) => o === "needs_fix")
        ? "needs_fix"
        : "undecided";
  return {
    selectedCandidateId,
    candidateOutcomes,
    decisionStatus,
    ...(decisionNote && decisionNote.trim() ? { decisionNote: decisionNote.trim() } : {}),
  };
}

/**
 * Stage 73: map an experiment's linked candidates to benchmark candidates.
 * suggestedAgent maps 1:1 to the benchmark source enum.
 */
export function mapExperimentCandidatesToBenchmark(candidates) {
  return linkedExperimentCandidates(candidates).map((c) => ({
    id: c.candidateId,
    label: c.label,
    mode: c.mode,
    source: c.suggestedAgent,
    reviewRunId: c.reviewRunId,
    ...(typeof c.pullRequestNumber === "number" ? { pullRequestNumber: c.pullRequestNumber } : {}),
  }));
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

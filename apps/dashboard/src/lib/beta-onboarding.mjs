// Stage 120 — preview-only onboarding copy + constants.
//
// Centralizes the beta onboarding / "preview language" / safety copy so it stays
// consistent across the intake route and is unit-testable (no completion claims,
// safety notes present). Pure data — no component, no backend.

export const ONBOARDING_HEADING = "How this beta preview works";

export const ONBOARDING_INTRO =
  "Paste an idea, PRD, product URL, repo, PR, or AI-built app description. Simsa turns it into a staged acceptance workflow preview.";

/** The 4-step explanation of the intake preview chain. */
export const ONBOARDING_STEPS = [
  "Understand the artifact",
  "Map acceptance items",
  "Plan role-based review work",
  "Save the workflow plan for later review",
];

/** Top-level safety line — what this flow does NOT do. */
export const ONBOARDING_SAFETY_LINE =
  "This beta flow creates plans and previews. It does not execute agents, collect evidence, run benchmarks, or make final decisions.";

/** Legend explaining repeated preview terms across the chain. */
export const PREVIEW_LANGUAGE_ITEMS = [
  { term: "Candidate", meaning: "a suggested item that still needs review" },
  { term: "Expected evidence", meaning: "proof that should be collected later" },
  { term: "Not verified", meaning: "no evidence has been collected yet" },
  { term: "Recommended tool", meaning: "a suggested tool, not an executed action" },
  { term: "Action preview", meaning: "a suggested next action, not a created action pack" },
];

/** Beta data-safety notes shown around input + saved records. */
export const BETA_SAFETY_NOTES = {
  beforeInput:
    "Avoid pasting confidential secrets, tokens, or sensitive customer data.",
  savedScope:
    "Saved workflow plans are scoped to this browser/user key. This is beta tenant scoping, not full team authentication.",
  savedRetention:
    "Saved workflow plans may include excerpts and generated workflow snapshots. Archive or delete records you no longer need.",
  feedback:
    "Feedback email opens with safe context only. No pasted content or workflow snapshots are included.",
};

/** Empty-state copy. */
export const EMPTY_STATES = {
  beforeInput:
    "Start with what you already have. You can paste a rough idea, a product spec, a URL, a repo, a PR, or a description of an AI-built app. Simsa will create a deterministic acceptance workflow preview from it.",
  noSavedRecords:
    "No saved workflow plans yet. Create a preview above, then save it to reopen the benchmark, decision, and action previews later.",
  noOpenedRecord:
    "Open a saved workflow plan to see benchmark handoff, decision/outcome, and evolution action previews.",
};

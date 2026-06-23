// Stage 122 — beta usage / cost boundary copy.
//
// Honest, conservative copy that makes the beta usage boundary clear: the intake
// preview chain is deterministic and low-cost, saving stores a lightweight
// snapshot, and NO agent/benchmark/LLM execution (and no billing) happens. Pure
// data — no enforcement, no billing, no backend.

export const BETA_USAGE_BOUNDARY_HEADING = "Beta usage boundary";

/** What is happening now + the boundary, as bullet copy. */
export const BETA_USAGE_BOUNDARY_ITEMS = [
  "This flow generates deterministic previews in your browser/app experience.",
  "Saving a workflow stores a lightweight workflow snapshot.",
  "This beta flow does not execute agents, run benchmarks, upload evidence, or make final decisions.",
  "Future AI/agent execution features will need explicit usage limits before beta expansion.",
];

/** Explicit "no billing" line. */
export const BETA_USAGE_NOT_ACTIVE_COPY =
  "No billing or paid usage is active for this beta preview.";

/** Saved workflow section boundary note. */
export const SAVED_WORKFLOW_USAGE_NOTE =
  "Saved workflow plans are stored snapshots for reopening the preview chain. They are not completed agent runs or benchmark results.";

/** Admin console boundary note. */
export const ADMIN_USAGE_BOUNDARY_NOTE =
  "This admin view shows saved workflow record summaries only. It does not show usage charges, billing, agent execution, or benchmark execution.";

/** Admin counts framing. */
export const ADMIN_COUNTS_SIGNAL_NOTE =
  "Use record counts as beta activity signals, not billing metrics.";

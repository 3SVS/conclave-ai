// @conclave-ai/workspace-preview — public entry.
//
// Stage 135: skeleton only. Re-exports the package safety metadata. Pure
// deterministic preview helpers (acceptance map / stage plan / agent run plan /
// evidence plan / acceptance graph / blockers / agent-tool memory / template
// signals) are moved here in Stages 136~138 — not yet present.
export {
  WORKSPACE_PREVIEW_PACKAGE,
  WORKSPACE_PREVIEW_SAFETY_RULES,
  getWorkspacePreviewSafetySummary,
} from "./safety.mjs";

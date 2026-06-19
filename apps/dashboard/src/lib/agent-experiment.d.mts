// Type declarations for agent-experiment.mjs (Stage 71).

export type AgentExperimentMode = "single_agent" | "multi_agent" | "reviewer_agent" | "hybrid";
export type AgentExperimentRole = "builder" | "reviewer" | "fixer" | "integrator";
export type SuggestedAgent = "claude_code" | "codex" | "cursor" | "manual" | "other";

export type ExperimentTemplateCandidate = {
  id: string;
  role: AgentExperimentRole;
  suggestedAgent: SuggestedAgent;
  labelKey: string;
};

export type ExperimentTemplate = {
  id: string;
  mode: AgentExperimentMode;
  candidates: ExperimentTemplateCandidate[];
};

// Forward-looking shapes (persisted in a later stage). Kept here so the model
// is stable now even though Stage 71 only generates prompts.
export type AgentExperimentCandidate = {
  id: string;
  label: string;
  mode: AgentExperimentMode;
  role: AgentExperimentRole;
  suggestedAgent: SuggestedAgent;
  prompt: string;
};

export type AgentExperimentPlan = {
  id: string;
  projectId: string;
  title: string;
  productBriefSummary: string;
  acceptanceItemCount: number;
  candidates: AgentExperimentCandidate[];
  instructions: string[];
};

export const EXPERIMENT_TEMPLATES: ExperimentTemplate[];

export function getExperimentTemplate(id: string): ExperimentTemplate | null;

export type CandidatePromptParts = {
  roleInstruction: string;
  contextHeading: string;
  context: string;
  briefHeading: string;
  brief: string;
  acceptanceHeading: string;
  acceptanceItems?: string[];
  constraintsHeading: string;
  constraints?: string[];
  outputHeading: string;
  output: string;
  reportHeading: string;
  report: string;
};

export function buildCandidatePrompt(parts: CandidatePromptParts): string;

export function buildAllPromptsText(input: {
  heading: string;
  candidatePrefix: string;
  candidates?: Array<{ label: string; prompt: string }>;
}): string;

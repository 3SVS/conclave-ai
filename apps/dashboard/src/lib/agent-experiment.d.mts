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
export function canSaveExperiment(title: string, templateId: string): boolean;
export function experimentCandidateStatus(links: {
  pullRequestNumber?: number;
  reviewRunId?: string;
  benchmarkId?: string;
}): "planned" | "pr_linked" | "reviewed" | "benchmarked";

type LinkableCandidate = {
  candidateId: string;
  label: string;
  mode: string;
  suggestedAgent: string;
  pullRequestNumber?: number;
  reviewRunId?: string;
  benchmarkId?: string;
};
export function linkedExperimentCandidates<T extends LinkableCandidate>(candidates: T[]): T[];
export function canCreateBenchmarkFromExperiment(candidates: LinkableCandidate[]): boolean;
export function mapExperimentCandidatesToBenchmark(candidates: LinkableCandidate[]): Array<{
  id: string;
  label: string;
  mode: string;
  source: string;
  reviewRunId?: string;
  pullRequestNumber?: number;
}>;

export type CandidateOutcome = "selected" | "rejected" | "needs_fix" | "undecided";
export function buildExperimentDecision(
  outcomesByCandidate: Record<string, string>,
  notesByCandidate?: Record<string, string>,
  decisionNote?: string,
): {
  selectedCandidateId?: string;
  candidateOutcomes: Array<{ candidateId: string; outcome: string; note?: string }>;
  decisionStatus: "selected" | "needs_fix" | "undecided";
  decisionNote?: string;
};

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

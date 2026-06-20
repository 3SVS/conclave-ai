// Type declarations for evolution-action-pack.mjs (Stage 76).
import type { OutcomeScorecard } from "./workspace-experiment-api";
import type { SavedExperiment } from "./workspace-experiment-api";
import type { AgentBenchmarkResult } from "./agent-benchmark.d.mts";

export type EvolutionAction =
  | "accept"
  | "fix_selected"
  | "rerun_experiment"
  | "clarify_acceptance_items"
  | "create_benchmark";

export type EvolutionActionPackSection = {
  title: string;
  body: string;
};

export type EvolutionActionPack = {
  projectId: string;
  experimentId: string;
  recommendedAction: EvolutionAction;
  title: string;
  summary: string;
  targetCandidateId?: string;
  focusItemIds: string[];
  sections: EvolutionActionPackSection[];
};

export type ResolvedFocusItem = {
  itemId: string;
  title: string;
  status: string | null;
};

export type AcceptanceItemRef = { id: string; title: string; criteria?: string[] };

export type BuildEvolutionActionPackInput = {
  projectId: string;
  experiment?: SavedExperiment | null;
  scorecard: OutcomeScorecard;
  benchmark?: AgentBenchmarkResult | null;
  acceptanceItems?: AcceptanceItemRef[];
};

export type EvolutionActionPackMeta = {
  experimentTitle?: string;
  targetCandidateLabel?: string;
};

export const EVOLUTION_ACTIONS: EvolutionAction[];

export function statusLabelFor(status: string | null, s: Record<string, string>): string | null;
export function resolveFocusItems(
  scorecard: OutcomeScorecard,
  benchmark: AgentBenchmarkResult | null | undefined,
  acceptanceItems?: AcceptanceItemRef[],
): ResolvedFocusItem[];
export function buildEvolutionActionPack(
  input: BuildEvolutionActionPackInput,
  s: Record<string, string>,
): EvolutionActionPack;
export function buildEvolutionActionPackText(
  pack: EvolutionActionPack,
  s: Record<string, string>,
  meta?: EvolutionActionPackMeta,
): string;

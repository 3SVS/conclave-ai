"use client";

/**
 * Dashboard client for persisted Manual Multi-Agent Experiments (Stage 72).
 */
import type {
  AgentExperimentMode,
  AgentExperimentRole,
  SuggestedAgent,
} from "./agent-experiment.mjs";

const CENTRAL_PLANE_URL =
  process.env.NEXT_PUBLIC_CENTRAL_PLANE_URL ??
  "https://conclave-ai.seunghunbae.workers.dev";

export type SaveExperimentCandidate = {
  id: string;
  label: string;
  mode: AgentExperimentMode;
  role: AgentExperimentRole;
  suggestedAgent: SuggestedAgent;
};

export type ExperimentCandidate = {
  id: string;
  candidateId: string;
  label: string;
  mode: string;
  role: string;
  suggestedAgent: string;
  status: string;
  pullRequestNumber?: number;
  reviewRunId?: string;
  benchmarkId?: string;
  outcome?: string;
  outcomeNote?: string;
  decidedAt?: string;
};

export type SavedExperimentListItem = {
  id: string;
  title: string;
  templateId: string;
  status: string;
  candidateCount: number;
  createdAt: string;
};

export type SavedExperiment = {
  id: string;
  projectId: string;
  title: string;
  templateId: string;
  status: string;
  createdAt: string;
  decisionStatus?: string;
  selectedCandidateId?: string;
  decisionNote?: string;
  decidedAt?: string;
  candidates: ExperimentCandidate[];
};

export type DecisionInput = {
  userKey: string;
  selectedCandidateId?: string;
  candidateOutcomes: Array<{ candidateId: string; outcome: string; note?: string }>;
  decisionStatus: string;
  decisionNote?: string;
};

export type DecisionResponse =
  | { ok: true; experiment: SavedExperiment }
  | { ok: false; error: string };

type SaveResponse = { ok: true; experiment: SavedExperiment } | { ok: false; error: string };
type ListResponse = { ok: true; experiments: SavedExperimentListItem[] } | { ok: false; error: string };
type DetailResponse = { ok: true; experiment: SavedExperiment } | { ok: false; error: string };
type PatchResponse = { ok: true; candidate: ExperimentCandidate } | { ok: false; error: string };

const base = (projectId: string) =>
  `${CENTRAL_PLANE_URL}/workspace/projects/${encodeURIComponent(projectId)}/agent-experiments`;

export async function saveExperiment(
  projectId: string,
  input: { userKey: string; title: string; templateId: string; candidates: SaveExperimentCandidate[] },
): Promise<SaveResponse> {
  try {
    const resp = await fetch(base(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(8000),
    });
    return (await resp.json()) as SaveResponse;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function listExperiments(projectId: string, userKey: string): Promise<ListResponse> {
  try {
    const params = new URLSearchParams({ userKey });
    const resp = await fetch(`${base(projectId)}?${params}`, { signal: AbortSignal.timeout(8000) });
    return (await resp.json()) as ListResponse;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function getExperiment(
  projectId: string,
  experimentId: string,
  userKey: string,
): Promise<DetailResponse> {
  try {
    const params = new URLSearchParams({ userKey });
    const resp = await fetch(`${base(projectId)}/${encodeURIComponent(experimentId)}?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    return (await resp.json()) as DetailResponse;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export type BenchmarkFromExperimentResponse =
  | { ok: true; benchmark: { id: string; title?: string; sourceExperimentId?: string }; experiment: SavedExperiment }
  | { ok: false; error: string };

export async function createBenchmarkFromExperiment(
  projectId: string,
  experimentId: string,
  userKey: string,
): Promise<BenchmarkFromExperimentResponse> {
  try {
    const resp = await fetch(`${base(projectId)}/${encodeURIComponent(experimentId)}/benchmark`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userKey }),
      signal: AbortSignal.timeout(12000),
    });
    return (await resp.json()) as BenchmarkFromExperimentResponse;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export type OutcomeScorecard = {
  experimentId: string;
  projectId: string;
  selectedCandidateId?: string;
  decisionStatus: string;
  quality: {
    acceptancePassRate: number | null;
    unresolvedBlockerCount: number;
    criticalIssueCount: number;
    notVerifiedCount: number;
    needsDecisionCount: number;
    evidenceCoverageRate: number | null;
    score: number;
    grade: string;
  };
  signals: {
    hasBenchmark: boolean;
    hasDecision: boolean;
    hasSelectedCandidate: boolean;
    hasItemLevelEvidence: boolean;
    acceptanceSetAligned?: boolean;
  };
  nextEvolution: {
    recommendedAction: string;
    reasons: string[];
    suggestedFocusItemIds: string[];
  };
};

export type OutcomeScorecardResponse =
  | { ok: true; scorecard: OutcomeScorecard }
  | { ok: false; error: string };

export async function getOutcomeScorecard(
  projectId: string,
  experimentId: string,
  userKey: string,
): Promise<OutcomeScorecardResponse> {
  try {
    const params = new URLSearchParams({ userKey });
    const resp = await fetch(`${base(projectId)}/${encodeURIComponent(experimentId)}/outcome-scorecard?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    return (await resp.json()) as OutcomeScorecardResponse;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function saveExperimentDecision(
  projectId: string,
  experimentId: string,
  input: DecisionInput,
): Promise<DecisionResponse> {
  try {
    const resp = await fetch(`${base(projectId)}/${encodeURIComponent(experimentId)}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(8000),
    });
    return (await resp.json()) as DecisionResponse;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ─── Stage 77: persisted Evolution Action Packs ─────────────────────────────

export type SavedEvolutionActionPackSection = { title: string; body: string };

export type SavedEvolutionActionPack = {
  projectId: string;
  experimentId: string;
  recommendedAction: string;
  title: string;
  summary: string;
  targetCandidateId?: string;
  focusItemIds: string[];
  sections: SavedEvolutionActionPackSection[];
};

export type SavedEvolutionActionPackListItem = {
  id: string;
  experimentId: string;
  recommendedAction: string;
  title: string;
  createdAt: string;
};

export type SavedEvolutionActionPackDetail = {
  id: string;
  experimentId: string;
  recommendedAction: string;
  title: string;
  createdAt: string;
  pack: SavedEvolutionActionPack;
  text: string;
};

type SaveActionPackResponse =
  | { ok: true; actionPack: SavedEvolutionActionPackDetail }
  | { ok: false; error: string };
type ListActionPacksResponse =
  | { ok: true; actionPacks: SavedEvolutionActionPackListItem[] }
  | { ok: false; error: string };
type GetActionPackResponse =
  | { ok: true; actionPack: SavedEvolutionActionPackDetail }
  | { ok: false; error: string };

export async function saveEvolutionActionPack(
  projectId: string,
  experimentId: string,
  userKey: string,
): Promise<SaveActionPackResponse> {
  try {
    const resp = await fetch(
      `${base(projectId)}/${encodeURIComponent(experimentId)}/evolution-action-packs`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userKey }),
        signal: AbortSignal.timeout(8000),
      },
    );
    return (await resp.json()) as SaveActionPackResponse;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function listEvolutionActionPacks(
  projectId: string,
  experimentId: string,
  userKey: string,
): Promise<ListActionPacksResponse> {
  try {
    const params = new URLSearchParams({ userKey });
    const resp = await fetch(
      `${base(projectId)}/${encodeURIComponent(experimentId)}/evolution-action-packs?${params}`,
      { signal: AbortSignal.timeout(8000) },
    );
    return (await resp.json()) as ListActionPacksResponse;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function getEvolutionActionPack(
  projectId: string,
  experimentId: string,
  actionPackId: string,
  userKey: string,
): Promise<GetActionPackResponse> {
  try {
    const params = new URLSearchParams({ userKey });
    const resp = await fetch(
      `${base(projectId)}/${encodeURIComponent(experimentId)}/evolution-action-packs/${encodeURIComponent(actionPackId)}?${params}`,
      { signal: AbortSignal.timeout(8000) },
    );
    return (await resp.json()) as GetActionPackResponse;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function patchExperimentCandidate(
  projectId: string,
  experimentId: string,
  candidateRowId: string,
  input: { userKey: string; pullRequestNumber?: number; reviewRunId?: string; benchmarkId?: string },
): Promise<PatchResponse> {
  try {
    const resp = await fetch(
      `${base(projectId)}/${encodeURIComponent(experimentId)}/candidates/${encodeURIComponent(candidateRowId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(8000),
      },
    );
    return (await resp.json()) as PatchResponse;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

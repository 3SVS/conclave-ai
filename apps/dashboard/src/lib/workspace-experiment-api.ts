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
  candidates: ExperimentCandidate[];
};

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

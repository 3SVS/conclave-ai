"use client";

/**
 * Dashboard client for the persisted Multi-Agent Build Benchmark endpoints
 * (Stage 65). Saved benchmarks come from central-plane (source of truth); the
 * dashboard's agent-benchmark.mjs is used only for live, unsaved preview.
 */
import type {
  AgentBenchmarkResult,
  CandidateMode,
  CandidateSource,
} from "./agent-benchmark.mjs";

const CENTRAL_PLANE_URL =
  process.env.NEXT_PUBLIC_CENTRAL_PLANE_URL ??
  "https://conclave-ai.seunghunbae.workers.dev";

export type SaveBenchmarkCandidate = {
  id: string;
  label: string;
  mode: CandidateMode;
  source: CandidateSource;
  reviewRunId: string;
};

export type SavedBenchmarkListItem = {
  id: string;
  title?: string;
  createdAt: string;
  candidateCount: number;
  winnerCandidateId?: string;
  noClearWinner: boolean;
};

export type SavedBenchmark = {
  id: string;
  projectId: string;
  title?: string;
  createdAt: string;
  candidateCount: number;
  winnerCandidateId?: string;
  noClearWinner: boolean;
  sourceExperimentId?: string;
  result: AgentBenchmarkResult;
};

export type SaveBenchmarkResponse =
  | { ok: true; benchmark: SavedBenchmark }
  | { ok: false; error: string };

export type ListBenchmarksResponse =
  | { ok: true; benchmarks: SavedBenchmarkListItem[] }
  | { ok: false; error: string };

export type GetBenchmarkResponse =
  | { ok: true; benchmark: SavedBenchmark }
  | { ok: false; error: string };

export async function saveBenchmark(
  projectId: string,
  input: { userKey: string; title?: string; candidates: SaveBenchmarkCandidate[] },
): Promise<SaveBenchmarkResponse> {
  try {
    const resp = await fetch(
      `${CENTRAL_PLANE_URL}/workspace/projects/${encodeURIComponent(projectId)}/agent-benchmarks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(8000),
      },
    );
    return (await resp.json()) as SaveBenchmarkResponse;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function listSavedBenchmarks(
  projectId: string,
  userKey: string,
): Promise<ListBenchmarksResponse> {
  try {
    const params = new URLSearchParams({ userKey });
    const resp = await fetch(
      `${CENTRAL_PLANE_URL}/workspace/projects/${encodeURIComponent(projectId)}/agent-benchmarks?${params}`,
      { signal: AbortSignal.timeout(8000) },
    );
    return (await resp.json()) as ListBenchmarksResponse;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function getSavedBenchmark(
  projectId: string,
  benchmarkId: string,
  userKey: string,
): Promise<GetBenchmarkResponse> {
  try {
    const params = new URLSearchParams({ userKey });
    const resp = await fetch(
      `${CENTRAL_PLANE_URL}/workspace/projects/${encodeURIComponent(projectId)}/agent-benchmarks/${encodeURIComponent(benchmarkId)}?${params}`,
      { signal: AbortSignal.timeout(8000) },
    );
    return (await resp.json()) as GetBenchmarkResponse;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

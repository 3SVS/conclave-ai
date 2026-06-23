"use client";

/**
 * Dashboard client for persisted Agent Workflow Records (Stage 112 + 112B).
 *
 * Saves the deterministic intake workflow snapshot (acceptance map + stage plan
 * + agent run plan + evidence plan) to central-plane so it can be listed and
 * reopened later. This is NOT agent execution — no real evidence, decisions,
 * outcomes, benchmark ids, or evolution action packs are persisted. Saving is
 * optional; the preview works without it.
 *
 * Stage 112B: every record is scoped to the caller's workspace `userKey`
 * (from getUserKey()), passed the same way as the rest of the workspace API —
 * in the POST body and as a GET query param.
 */
const CENTRAL_PLANE_URL =
  process.env.NEXT_PUBLIC_CENTRAL_PLANE_URL ??
  "https://conclave-ai.seunghunbae.workers.dev";

export type WorkflowRecordStatus = "draft" | "planned" | "needs_evidence" | "archived";

export type SaveWorkflowRecordInput = {
  userKey: string;
  projectId?: string;
  intakeType: string;
  title: string;
  sourceSummary: string;
  rawInputExcerpt?: string;
  acceptanceMap: unknown;
  stagePlan: unknown;
  agentRunPlan: unknown;
  evidencePlan: unknown;
  status?: WorkflowRecordStatus;
};

export type WorkflowRecord = {
  id: string;
  projectId: string | null;
  intakeType: string;
  title: string;
  sourceSummary: string;
  rawInputExcerpt: string | null;
  acceptanceMap: unknown;
  stagePlan: unknown;
  agentRunPlan: unknown;
  evidencePlan: unknown;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowRecordListItem = {
  id: string;
  projectId: string | null;
  intakeType: string;
  title: string;
  sourceSummary: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type SaveResponse = { ok: true; record: WorkflowRecord } | { ok: false; error: string };
type ListResponse = { ok: true; records: WorkflowRecordListItem[] } | { ok: false; error: string };
type DetailResponse = { ok: true; record: WorkflowRecord } | { ok: false; error: string };

const base = `${CENTRAL_PLANE_URL}/workspace/agent-workflows`;

export async function saveWorkflowRecord(input: SaveWorkflowRecordInput): Promise<SaveResponse> {
  try {
    const resp = await fetch(base, {
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

export async function listWorkflowRecords(
  userKey: string,
  projectId?: string,
): Promise<ListResponse> {
  try {
    const params = new URLSearchParams({ userKey });
    if (projectId) params.set("projectId", projectId);
    const resp = await fetch(`${base}?${params}`, { signal: AbortSignal.timeout(8000) });
    return (await resp.json()) as ListResponse;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function getWorkflowRecord(id: string, userKey: string): Promise<DetailResponse> {
  try {
    const params = new URLSearchParams({ userKey });
    const resp = await fetch(`${base}/${encodeURIComponent(id)}?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    return (await resp.json()) as DetailResponse;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

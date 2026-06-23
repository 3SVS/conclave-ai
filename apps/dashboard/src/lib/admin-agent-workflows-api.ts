"use client";

/**
 * admin-agent-workflows-api.ts — Stage 121
 *
 * Client for the beta admin console over saved agent workflow records. The admin
 * key is entered by the operator at query time and sent as `x-admin-key` — never
 * stored (matches workspace-admin-api.ts). Admin list returns summaries only (no
 * snapshot JSON). Records are scoped by client-supplied userKey, NOT full auth.
 */
const BASE_URL =
  process.env.NEXT_PUBLIC_CENTRAL_PLANE_URL ?? "https://conclave-ai.seunghunbae.workers.dev";

const base = `${BASE_URL}/workspace/admin/agent-workflows`;

export type AdminWorkflowRecord = {
  id: string;
  userKey: string;
  projectId: string | null;
  intakeType: string;
  title: string;
  sourceSummary: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminWorkflowSummary = {
  total: number;
  byStatus: Record<string, number>;
  byIntakeType: Record<string, number>;
  uniqueUserKeys: number;
};

export type AdminListResponse =
  | { ok: true; records: AdminWorkflowRecord[]; summary: AdminWorkflowSummary }
  | { ok: false; error: string };

export type AdminMutateResponse =
  | { ok: true; record?: AdminWorkflowRecord; deleted?: boolean; id?: string }
  | { ok: false; error: string };

export async function listAdminAgentWorkflows(
  adminKey: string,
  filters: { userKey?: string; status?: string; includeArchived?: boolean; limit?: number } = {},
): Promise<AdminListResponse> {
  try {
    const params = new URLSearchParams();
    if (filters.userKey) params.set("userKey", filters.userKey);
    if (filters.status) params.set("status", filters.status);
    if (filters.includeArchived) params.set("includeArchived", "true");
    if (filters.limit) params.set("limit", String(filters.limit));
    const qs = params.toString();
    const resp = await fetch(qs ? `${base}?${qs}` : base, {
      headers: { "x-admin-key": adminKey },
      signal: AbortSignal.timeout(8000),
    });
    return (await resp.json()) as AdminListResponse;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function updateAdminAgentWorkflowStatus(
  adminKey: string,
  id: string,
  status: "planned" | "needs_evidence" | "archived",
): Promise<AdminMutateResponse> {
  try {
    const resp = await fetch(`${base}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-admin-key": adminKey },
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(8000),
    });
    return (await resp.json()) as AdminMutateResponse;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function deleteAdminAgentWorkflow(
  adminKey: string,
  id: string,
): Promise<AdminMutateResponse> {
  try {
    const resp = await fetch(`${base}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-admin-key": adminKey },
      signal: AbortSignal.timeout(8000),
    });
    return (await resp.json()) as AdminMutateResponse;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

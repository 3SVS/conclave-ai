"use client";

/**
 * Dashboard client for the workspace export-builder-pack endpoint.
 * Deterministic on the server side — no rate limits.
 */

const CENTRAL_PLANE_URL =
  process.env.NEXT_PUBLIC_CENTRAL_PLANE_URL ??
  "https://conclave-ai.seunghunbae.workers.dev";

// ─── Types (mirrors central-plane export.ts) ──────────────────────────────────

export type ExportTarget = "claude_code" | "codex" | "both";

export type ExportFile = {
  path: string;
  content: string;
};

export type ExportBuilderPackResponse = {
  ok: true;
  source: "deterministic";
  bundle: { files: ExportFile[] };
  summary: { fileCount: number; recommendedNextStep: string };
};

export type ExportApiError =
  | { ok: false; error: "network" | "server"; message: string };

export type ExportBuilderPackInput = {
  projectId?: string;
  project?: {
    title: string;
    idea?: string;
    productSpec: unknown;
    items: Array<{ id: string; title: string; status: string; criteria: string[] }>;
    checkResults?: unknown;
    fixSuggestions?: unknown;
  };
  target: ExportTarget;
};

export async function callExportBuilderPackApi(
  input: ExportBuilderPackInput,
): Promise<ExportBuilderPackResponse | ExportApiError> {
  try {
    const resp = await fetch(`${CENTRAL_PLANE_URL}/workspace/export-builder-pack`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, format: "json", locale: "ko" }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return { ok: false, error: "server", message: `HTTP ${resp.status}` };
    return (await resp.json()) as ExportBuilderPackResponse;
  } catch (err) {
    return { ok: false, error: "network", message: String(err) };
  }
}

/**
 * workspace-agent-workflow.ts — Stage 112 (+ Stage 112B tenant scoping)
 *
 * Persisted Agent Workflow Records. Saves the deterministic intake workflow
 * snapshot (acceptance map + stage plan + agent run plan + evidence plan) so it
 * can be listed and reopened later. This is NOT agent execution — no real
 * evidence, decisions, outcomes, benchmark ids, or evolution action packs are
 * stored. Saving is optional; the dashboard preview works without it.
 *
 * Stage 112B: every endpoint is scoped to the caller's `userKey` (the workspace
 * key, supplied the same way as the rest of the workspace API — body for POST,
 * query for GET). This repo's workspace model has no server-side session/header
 * auth (see workspace-agent-experiments / workspace-agent-benchmarks): the
 * userKey IS the tenant identifier the client presents. Records are created
 * under that key and only ever read back under the same key, so a record made by
 * one userKey is invisible to another (list excludes it; detail returns 404).
 *
 * POST /workspace/agent-workflows
 * GET  /workspace/agent-workflows
 * GET  /workspace/agent-workflows/:id
 */
import { Hono } from "hono";
import { corsMiddleware } from "./cors.js";
import type { Env } from "../env.js";
import {
  insertWorkflowRecord,
  listWorkflowRecords,
  getOwnedWorkflowRecordById,
  WORKFLOW_RECORD_STATUSES,
  type WorkflowRecordStatus,
} from "../workspace/agent-workflow-record-db.js";

// Mirror the dashboard's WORKSPACE_INTAKE_TYPES (Stage 101).
const INTAKE_TYPES = ["idea", "prd", "product_url", "github_repo", "pull_request", "ai_built_app"];

const TITLE_MAX = 200;
const SUMMARY_MAX = 2000;
const RAW_EXCERPT_MAX = 2000;
// Guard against storing huge pasted blobs as a "snapshot". The deterministic
// plans are small; anything above this is almost certainly not a real plan.
const SNAPSHOT_JSON_MAX = 200_000;

function trimTo(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Stringify a snapshot, enforcing presence (required) + a size ceiling. */
function snapshotJson(value: unknown): { ok: true; json: string } | { ok: false } {
  if (value === undefined || value === null) return { ok: false };
  if (typeof value !== "object") return { ok: false };
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    return { ok: false };
  }
  if (json.length > SNAPSHOT_JSON_MAX) return { ok: false };
  return { ok: true, json };
}

export function createWorkspaceAgentWorkflowRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // Stage 91: browser-facing CORS (preflight + headers on every response).
  app.use("*", corsMiddleware);

  // ── POST create ─────────────────────────────────────────────────────────────
  app.post("/workspace/agent-workflows", async (c) => {
    let body: {
      userKey?: unknown;
      projectId?: unknown;
      intakeType?: unknown;
      title?: unknown;
      sourceSummary?: unknown;
      rawInputExcerpt?: unknown;
      acceptanceMap?: unknown;
      stagePlan?: unknown;
      agentRunPlan?: unknown;
      evidencePlan?: unknown;
      status?: unknown;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "invalid_json" }, 400);
    }

    // Tenant scope: the record is created under this userKey and is only ever
    // readable with the same userKey. There is no separate "trusted" identity to
    // override it with — this matches the rest of the workspace API.
    const userKey = typeof body.userKey === "string" ? body.userKey : "";
    if (!userKey) return c.json({ ok: false, error: "userKey_required" }, 400);

    const intakeType = typeof body.intakeType === "string" ? body.intakeType : "";
    if (!INTAKE_TYPES.includes(intakeType)) {
      return c.json({ ok: false, error: "invalid_intake_type" }, 400);
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return c.json({ ok: false, error: "title_required" }, 400);

    const sourceSummary = typeof body.sourceSummary === "string" ? body.sourceSummary.trim() : "";
    if (!sourceSummary) return c.json({ ok: false, error: "sourceSummary_required" }, 400);

    // status: optional; default planned; reject unknown values (no silent coerce).
    let status: WorkflowRecordStatus = "planned";
    if (body.status !== undefined && body.status !== null) {
      if (typeof body.status !== "string" || !WORKFLOW_RECORD_STATUSES.includes(body.status as WorkflowRecordStatus)) {
        return c.json({ ok: false, error: "invalid_status" }, 400);
      }
      status = body.status as WorkflowRecordStatus;
    }

    const acceptanceMap = snapshotJson(body.acceptanceMap);
    if (!acceptanceMap.ok) return c.json({ ok: false, error: "acceptanceMap_required" }, 400);
    const stagePlan = snapshotJson(body.stagePlan);
    if (!stagePlan.ok) return c.json({ ok: false, error: "stagePlan_required" }, 400);
    const agentRunPlan = snapshotJson(body.agentRunPlan);
    if (!agentRunPlan.ok) return c.json({ ok: false, error: "agentRunPlan_required" }, 400);
    const evidencePlan = snapshotJson(body.evidencePlan);
    if (!evidencePlan.ok) return c.json({ ok: false, error: "evidencePlan_required" }, 400);

    const projectId =
      typeof body.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : null;
    const rawInputExcerpt =
      typeof body.rawInputExcerpt === "string" && body.rawInputExcerpt
        ? trimTo(body.rawInputExcerpt, RAW_EXCERPT_MAX)
        : null;

    try {
      const record = await insertWorkflowRecord(c.env, {
        userKey,
        projectId,
        intakeType,
        title: trimTo(title, TITLE_MAX),
        sourceSummary: trimTo(sourceSummary, SUMMARY_MAX),
        rawInputExcerpt,
        acceptanceMapJson: acceptanceMap.json,
        stagePlanJson: stagePlan.json,
        agentRunPlanJson: agentRunPlan.json,
        evidencePlanJson: evidencePlan.json,
        status,
      });
      return c.json({ ok: true, record }, 201);
    } catch (err) {
      console.error("[workspace/agent-workflows POST] save failed:", err);
      return c.json({ ok: false, error: "save_failed" }, 500);
    }
  });

  // ── GET list (scoped to userKey) ─────────────────────────────────────────────
  app.get("/workspace/agent-workflows", async (c) => {
    const userKey = c.req.query("userKey") ?? "";
    if (!userKey) return c.json({ ok: false, error: "userKey_required" }, 400);
    const projectId = c.req.query("projectId") || undefined;
    try {
      const records = await listWorkflowRecords(c.env, { userKey, projectId, limit: 50 });
      return c.json({ ok: true, records });
    } catch (err) {
      console.error("[workspace/agent-workflows GET] failed:", err);
      return c.json({ ok: false, error: "query_failed" }, 500);
    }
  });

  // ── GET detail (own record only) ─────────────────────────────────────────────
  app.get("/workspace/agent-workflows/:id", async (c) => {
    const id = c.req.param("id");
    const userKey = c.req.query("userKey") ?? "";
    if (!userKey) return c.json({ ok: false, error: "userKey_required" }, 400);
    try {
      const owned = await getOwnedWorkflowRecordById(c.env, id);
      // 404 (not 403) when the record is missing OR owned by another userKey —
      // do not reveal that another tenant's record exists.
      if (!owned || owned.userKey !== userKey) {
        return c.json({ ok: false, error: "not_found" }, 404);
      }
      // Do not expose user_key in the response (matches the rest of the API).
      const record = {
        id: owned.id,
        projectId: owned.projectId,
        intakeType: owned.intakeType,
        title: owned.title,
        sourceSummary: owned.sourceSummary,
        rawInputExcerpt: owned.rawInputExcerpt,
        acceptanceMap: owned.acceptanceMap,
        stagePlan: owned.stagePlan,
        agentRunPlan: owned.agentRunPlan,
        evidencePlan: owned.evidencePlan,
        status: owned.status,
        createdAt: owned.createdAt,
        updatedAt: owned.updatedAt,
      };
      return c.json({ ok: true, record });
    } catch (err) {
      console.error("[workspace/agent-workflows detail GET] failed:", err);
      return c.json({ ok: false, error: "query_failed" }, 500);
    }
  });

  return app;
}

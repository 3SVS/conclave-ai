/**
 * v0.16.15 — Sprint E4 (scaffold): prompt-variant admin routes.
 *
 *   POST /admin/prompt-variants
 *     body { agent_id, variant_id, description?, system_prompt, is_baseline? }
 *     register a variant. Status starts 'inactive'.
 *
 *   GET  /admin/prompt-variants[?agent_id=…&status=…]
 *     list registered variants.
 *
 *   POST /admin/prompt-variants/:id/status
 *     body { status: 'inactive'|'shadow'|'promoted'|'archived' }
 *     manual status flip. Future automated promoter will hit the same
 *     setVariantStatus helper.
 *
 * All endpoints require INTERNAL_CALLBACK_TOKEN.
 *
 * NOTE: A/B routing (which variant a given /saas/review uses) is NOT
 * wired today. This scaffold ships the data model + CRUD so an
 * operator can populate variants in advance. Wiring lands in a
 * follow-up once Sprint D telemetry has accumulated enough signal.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import {
  listPromptVariants,
  recordVariantOutcome,
  registerPromptVariant,
  setVariantStatus,
  type VariantStatus,
} from "../prompt-evolution.js";

const VALID_STATUSES = ["inactive", "shadow", "promoted", "archived"] as const;

export function createPromptVariantsRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  function requireAdmin(c: { req: { header: (k: string) => string | undefined }; env: Env }):
    | { ok: true }
    | { ok: false; status: 401 | 503; body: { error: string } } {
    const expected = c.env.INTERNAL_CALLBACK_TOKEN;
    if (!expected) return { ok: false, status: 503, body: { error: "admin_disabled" } };
    const auth = c.req.header("authorization") ?? c.req.header("Authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m || m[1] !== expected) return { ok: false, status: 401, body: { error: "unauthorized" } };
    return { ok: true };
  }

  app.post("/admin/prompt-variants", async (c) => {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json(auth.body, auth.status);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "invalid_request", error_description: "JSON body required" }, 400);
    }
    if (typeof body.agent_id !== "string" || body.agent_id.length === 0) {
      return c.json({ error: "invalid_request", error_description: "agent_id required" }, 400);
    }
    if (typeof body.variant_id !== "string" || body.variant_id.length === 0) {
      return c.json({ error: "invalid_request", error_description: "variant_id required" }, 400);
    }
    if (typeof body.system_prompt !== "string" || body.system_prompt.length === 0) {
      return c.json({ error: "invalid_request", error_description: "system_prompt required" }, 400);
    }
    try {
      const result = await registerPromptVariant(c.env, {
        agent_id: body.agent_id,
        variant_id: body.variant_id,
        system_prompt: body.system_prompt,
        ...(typeof body.description === "string" ? { description: body.description } : {}),
        ...(body.is_baseline === true ? { is_baseline: true } : {}),
      });
      return c.json(result, 201);
    } catch (err) {
      const msg = (err as Error).message ?? "insert_failed";
      if (msg.includes("UNIQUE")) {
        return c.json({ error: "already_exists", error_description: "agent_id + variant_id pair exists" }, 409);
      }
      return c.json({ error: "insert_failed", error_description: msg.slice(0, 200) }, 500);
    }
  });

  app.get("/admin/prompt-variants", async (c) => {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json(auth.body, auth.status);
    const agentId = c.req.query("agent_id");
    const statusParam = c.req.query("status");
    const status =
      statusParam && (VALID_STATUSES as readonly string[]).includes(statusParam)
        ? (statusParam as VariantStatus)
        : undefined;
    const variants = await listPromptVariants(c.env, {
      ...(agentId ? { agent_id: agentId } : {}),
      ...(status ? { status } : {}),
    });
    return c.json({ count: variants.length, variants });
  });

  app.post("/admin/prompt-variants/:id/status", async (c) => {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json(auth.body, auth.status);
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => null)) as { status?: unknown } | null;
    const newStatus = body?.status;
    if (
      newStatus !== "inactive" &&
      newStatus !== "shadow" &&
      newStatus !== "promoted" &&
      newStatus !== "archived"
    ) {
      return c.json(
        {
          error: "invalid_status",
          error_description: `status must be one of: ${VALID_STATUSES.join(", ")}`,
        },
        400,
      );
    }
    const ok = await setVariantStatus(c.env, id, newStatus);
    if (!ok) return c.json({ error: "not_found" }, 404);
    return c.json({ id, status: newStatus });
  });

  // v0.16.16 — Sprint E4 activation: outcome ingestion. CLI POSTs one
  // row per agent per review when a promoted variant was used.
  app.post("/admin/prompt-variant-outcomes", async (c) => {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json(auth.body, auth.status);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "invalid_request", error_description: "JSON body required" }, 400);
    }
    if (typeof body.variant_pk !== "string" || typeof body.agent_id !== "string" || typeof body.review_id !== "string") {
      return c.json(
        { error: "invalid_request", error_description: "variant_pk + agent_id + review_id required" },
        400,
      );
    }
    const verdict =
      body.verdict === "approve" || body.verdict === "rework" || body.verdict === "reject"
        ? body.verdict
        : undefined;
    const blockerCount = typeof body.blocker_count === "number" ? body.blocker_count : undefined;
    const costUsd = typeof body.cost_usd === "number" ? body.cost_usd : undefined;
    const latencyMs = typeof body.latency_ms === "number" ? body.latency_ms : undefined;
    await recordVariantOutcome(c.env, {
      variant_pk: body.variant_pk,
      agent_id: body.agent_id,
      review_id: body.review_id,
      ...(verdict ? { verdict } : {}),
      ...(blockerCount !== undefined ? { blocker_count: blockerCount } : {}),
      ...(costUsd !== undefined ? { cost_usd: costUsd } : {}),
      ...(latencyMs !== undefined ? { latency_ms: latencyMs } : {}),
    });
    return c.json({ recorded: true }, 201);
  });

  // v0.16.16 — Sprint E4 activation: evaluation. Reads aggregated
  // outcomes per variant and computes a Bayesian beta-binomial 95%
  // confidence interval on the "approved without rework" rate. Pure
  // read-only; never auto-promotes — operators decide.
  app.get("/admin/prompt-evaluation", async (c) => {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json(auth.body, auth.status);
    const agentId = c.req.query("agent_id");
    const sql = agentId
      ? `SELECT v.id as variant_pk, v.agent_id, v.variant_id, v.is_baseline, v.status,
                COUNT(o.id) as outcomes,
                SUM(CASE WHEN o.verdict = 'approve' THEN 1 ELSE 0 END) as approves,
                SUM(CASE WHEN o.verdict = 'rework'  THEN 1 ELSE 0 END) as reworks,
                SUM(CASE WHEN o.verdict = 'reject'  THEN 1 ELSE 0 END) as rejects,
                AVG(o.cost_usd) as avg_cost_usd,
                AVG(o.latency_ms) as avg_latency_ms,
                AVG(o.blocker_count) as avg_blockers
           FROM prompt_variants v
           LEFT JOIN prompt_variant_outcomes o ON o.variant_pk = v.id
          WHERE v.removed_at IS NULL AND v.agent_id = ?
          GROUP BY v.id
          ORDER BY v.agent_id, v.created_at DESC`
      : `SELECT v.id as variant_pk, v.agent_id, v.variant_id, v.is_baseline, v.status,
                COUNT(o.id) as outcomes,
                SUM(CASE WHEN o.verdict = 'approve' THEN 1 ELSE 0 END) as approves,
                SUM(CASE WHEN o.verdict = 'rework'  THEN 1 ELSE 0 END) as reworks,
                SUM(CASE WHEN o.verdict = 'reject'  THEN 1 ELSE 0 END) as rejects,
                AVG(o.cost_usd) as avg_cost_usd,
                AVG(o.latency_ms) as avg_latency_ms,
                AVG(o.blocker_count) as avg_blockers
           FROM prompt_variants v
           LEFT JOIN prompt_variant_outcomes o ON o.variant_pk = v.id
          WHERE v.removed_at IS NULL
          GROUP BY v.id
          ORDER BY v.agent_id, v.created_at DESC`;
    const stmt = c.env.DB.prepare(sql);
    const r = agentId ? await stmt.bind(agentId).all() : await stmt.all();
    const rows = (r.results ?? []) as Array<Record<string, unknown>>;
    const evaluations = rows.map((row) => {
      const approves = Number(row.approves ?? 0);
      const outcomes = Number(row.outcomes ?? 0);
      // Beta-binomial conjugate. Prior Beta(1, 1) (uniform). Posterior
      // mean = (approves + 1) / (outcomes + 2). 95% interval via
      // wilson-score approximation since exact beta-quantile is
      // overkill here.
      const p = (approves + 1) / Math.max(1, outcomes + 2);
      const se = Math.sqrt((p * (1 - p)) / Math.max(1, outcomes + 2));
      const lo = Math.max(0, p - 1.96 * se);
      const hi = Math.min(1, p + 1.96 * se);
      return {
        variant_pk: String(row.variant_pk),
        agent_id: String(row.agent_id),
        variant_id: String(row.variant_id),
        is_baseline: Number(row.is_baseline ?? 0) === 1,
        status: String(row.status),
        outcomes,
        approves,
        reworks: Number(row.reworks ?? 0),
        rejects: Number(row.rejects ?? 0),
        approve_rate_estimate: Number(p.toFixed(4)),
        approve_rate_95ci: [Number(lo.toFixed(4)), Number(hi.toFixed(4))],
        avg_cost_usd: row.avg_cost_usd === null || row.avg_cost_usd === undefined ? null : Number(row.avg_cost_usd),
        avg_latency_ms: row.avg_latency_ms === null || row.avg_latency_ms === undefined ? null : Number(row.avg_latency_ms),
        avg_blockers: row.avg_blockers === null || row.avg_blockers === undefined ? null : Number(row.avg_blockers),
      };
    });
    return c.json({ count: evaluations.length, evaluations });
  });

  return app;
}

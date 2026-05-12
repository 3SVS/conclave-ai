/**
 * v0.16.17 — Sprint E5 (shadow scaffold): spawned-agent admin routes.
 * v0.14.3  — Sprint E5 council wire-in: 'trial' state + outcome ingest +
 *            auto-graduation trigger.
 *
 *   GET  /admin/spawned-agents[?status=shadow|trial|promoted|archived&domain=code|design]
 *   POST /admin/spawned-agents/:id/status      body { status }
 *   POST /admin/spawned-agent-outcomes         body { agent_id, review_id, ... }
 *   POST /admin/run-agent-spawner              (manual trigger; also runs auto-graduation)
 *
 * All require INTERNAL_CALLBACK_TOKEN. Weekly cron also calls
 * runAgentSpawner() + runAutoGraduation() directly.
 *
 * Status state machine:
 *   shadow ──manual──▶ trial ──auto/manual──▶ promoted
 *      │                 │                       │
 *      └──manual─────▶ archived ◀──auto/manual──┘
 *
 * Trial agents participate in the council but their reject verdict is
 * downgraded to advisory (cannot block a merge). Auto-graduation in
 * runAutoGraduation flips trial → promoted after a duration + outcome
 * gate, or trial → archived on early failure.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import {
  listSpawnedAgents,
  recordSpawnedAgentOutcome,
  runAgentSpawner,
  runAutoGraduation,
  setSpawnedAgentStatus,
  updateSpawnedAgentSmokeOutcome,
  type SpawnedAgentStatus,
} from "../agent-spawner.js";

const VALID_STATUSES: readonly SpawnedAgentStatus[] = ["shadow", "trial", "promoted", "archived"];
const VALID_DOMAINS = ["code", "design"] as const;

export function createSpawnedAgentsRoutes(): Hono<{ Bindings: Env }> {
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

  app.get("/admin/spawned-agents", async (c) => {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json(auth.body, auth.status);
    const statusParam = c.req.query("status");
    const status =
      statusParam && (VALID_STATUSES as readonly string[]).includes(statusParam)
        ? (statusParam as SpawnedAgentStatus)
        : null;
    const domainParam = c.req.query("domain");
    const domain =
      domainParam && (VALID_DOMAINS as readonly string[]).includes(domainParam)
        ? (domainParam as "code" | "design")
        : undefined;
    const agents = await listSpawnedAgents(c.env, status, domain);
    return c.json({ count: agents.length, agents });
  });

  app.post("/admin/spawned-agents/:id/status", async (c) => {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json(auth.body, auth.status);
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => null)) as { status?: unknown } | null;
    const newStatus = body?.status;
    if (!(VALID_STATUSES as readonly string[]).includes(newStatus as string)) {
      return c.json(
        {
          error: "invalid_status",
          error_description: `status must be one of: ${VALID_STATUSES.join(", ")}`,
        },
        400,
      );
    }
    const ok = await setSpawnedAgentStatus(c.env, id, newStatus as SpawnedAgentStatus);
    if (!ok) return c.json({ error: "not_found" }, 404);
    return c.json({ id, status: newStatus });
  });

  // Per-review outcome ingest from the CLI. Required so auto-graduation
  // can compute a pass-rate over the trial window.
  app.post("/admin/spawned-agent-outcomes", async (c) => {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json(auth.body, auth.status);
    const raw = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!raw) return c.json({ error: "invalid_body" }, 400);
    // Hand-validate. Zod-at-the-boundary is the project convention but
    // this body is small enough that explicit type guards stay readable
    // and avoid an extra schema import.
    const agent_id = typeof raw.agent_id === "string" ? raw.agent_id : null;
    const review_id = typeof raw.review_id === "string" ? raw.review_id : null;
    const verdict = raw.verdict;
    const blocker_count = typeof raw.blocker_count === "number" ? raw.blocker_count : null;
    const cost_usd = typeof raw.cost_usd === "number" ? raw.cost_usd : null;
    const latency_ms = typeof raw.latency_ms === "number" ? raw.latency_ms : null;
    const smoke_passed_raw = raw.smoke_passed;
    const smoke_passed: boolean | null =
      smoke_passed_raw === true || smoke_passed_raw === false
        ? smoke_passed_raw
        : smoke_passed_raw === null || smoke_passed_raw === undefined
        ? null
        : smoke_passed_raw === 1
        ? true
        : smoke_passed_raw === 0
        ? false
        : null;
    if (
      !agent_id ||
      !review_id ||
      (verdict !== "approve" && verdict !== "rework" && verdict !== "reject") ||
      blocker_count === null ||
      cost_usd === null ||
      latency_ms === null
    ) {
      return c.json({ error: "invalid_body" }, 400);
    }
    const r = await recordSpawnedAgentOutcome(c.env, {
      agent_id,
      review_id,
      verdict,
      blocker_count,
      cost_usd,
      latency_ms,
      smoke_passed,
    });
    if (!r.ok) {
      const status = r.reason === "agent_not_found" ? 404 : 409;
      return c.json({ error: r.reason }, status);
    }
    return c.json({ ok: true });
  });

  // Update smoke_passed on an already-recorded outcome. autofix-pipeline
  // calls this after the smoke step finishes — review.ts can't fill it
  // in because it doesn't run smoke. Distinguishing review-passed-build-
  // broke from review-passed-build-passed is the whole point of E5's
  // auto-graduation gate.
  app.patch("/admin/spawned-agent-outcomes", async (c) => {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json(auth.body, auth.status);
    const raw = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!raw) return c.json({ error: "invalid_body" }, 400);
    const agent_id = typeof raw.agent_id === "string" ? raw.agent_id : null;
    const review_id = typeof raw.review_id === "string" ? raw.review_id : null;
    const sp = raw.smoke_passed;
    let smoke_passed: boolean | null;
    if (sp === true || sp === false) smoke_passed = sp;
    else if (sp === null || sp === undefined) smoke_passed = null;
    else if (sp === 1) smoke_passed = true;
    else if (sp === 0) smoke_passed = false;
    else return c.json({ error: "invalid_body" }, 400);
    if (!agent_id || !review_id) {
      return c.json({ error: "invalid_body" }, 400);
    }
    const r = await updateSpawnedAgentSmokeOutcome(c.env, {
      agent_id,
      review_id,
      smoke_passed,
    });
    if (!r.ok) {
      const status = r.reason === "agent_not_found" ? 404 : 409;
      return c.json({ error: r.reason }, status);
    }
    return c.json({ ok: true });
  });

  app.post("/admin/run-agent-spawner", async (c) => {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json(auth.body, auth.status);
    const result = await runAgentSpawner(c.env);
    // Always also run auto-graduation in the same pass — keeps the
    // weekly cron's two phases (detection + graduation) atomic from the
    // operator's POV. Cheap (single aggregate query + a few UPDATEs).
    const grad = await runAutoGraduation(c.env);
    return c.json({ ...result, auto_graduation: grad });
  });

  return app;
}

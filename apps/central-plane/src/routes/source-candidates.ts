/**
 * v0.16.12 — Sprint E1: source candidate routes.
 *
 *   GET  /admin/source-candidates?status=candidate
 *                                              — list discovered candidates
 *                                                (optionally filter by status).
 *   POST /admin/source-candidates/:id/decide   — approve or reject.
 *                                                Body: { decision: 'approved' | 'rejected' }.
 *   POST /admin/run-source-discovery           — manually trigger a
 *                                                discovery pass (useful
 *                                                between weekly cron firings).
 *
 * All endpoints require INTERNAL_CALLBACK_TOKEN. The weekly cron in
 * src/index.ts (`0 5 * * 7`, 0500 UTC every Sunday — CF cron uses
 * 1-7 with Sunday=7) calls runSourceDiscovery() directly.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { decideCandidate, listSourceCandidates, runSourceDiscovery } from "../source-discovery.js";

const VALID_STATUSES = ["candidate", "approved", "rejected"] as const;

export function createSourceCandidatesRoutes(): Hono<{ Bindings: Env }> {
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

  app.get("/admin/source-candidates", async (c) => {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json(auth.body, auth.status);
    const statusParam = c.req.query("status");
    const status =
      statusParam && (VALID_STATUSES as readonly string[]).includes(statusParam)
        ? (statusParam as "candidate" | "approved" | "rejected")
        : null;
    const candidates = await listSourceCandidates(c.env, status);
    return c.json({ count: candidates.length, candidates });
  });

  app.post("/admin/source-candidates/:id/decide", async (c) => {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json(auth.body, auth.status);
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => null)) as
      | { decision?: unknown; reviewer?: unknown }
      | null;
    const decisionRaw = body?.decision;
    if (decisionRaw !== "approved" && decisionRaw !== "rejected") {
      return c.json(
        { error: "invalid_decision", error_description: "decision must be 'approved' or 'rejected'" },
        400,
      );
    }
    const reviewer = typeof body?.reviewer === "string" ? body.reviewer.slice(0, 100) : "auto";
    const ok = await decideCandidate(c.env, id, decisionRaw, reviewer);
    if (!ok) return c.json({ error: "not_found_or_already_reviewed" }, 404);
    return c.json({ id, decision: decisionRaw, reviewer });
  });

  app.post("/admin/run-source-discovery", async (c) => {
    const auth = requireAdmin(c);
    if (!auth.ok) return c.json(auth.body, auth.status);
    const result = await runSourceDiscovery(c.env);
    return c.json(result);
  });

  return app;
}

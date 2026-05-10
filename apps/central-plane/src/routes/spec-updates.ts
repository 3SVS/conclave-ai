/**
 * v0.16.14 — Sprint E3: spec-updates routes.
 *
 *   GET  /seeds/spec-updates/:domain  — public read. CLI fetches and
 *                                       injects alongside other RAG streams.
 *   POST /admin/run-changelog-monitor — INTERNAL_CALLBACK_TOKEN. Manual
 *                                       trigger of a monitor pass.
 *
 * Weekly cron in src/index.ts runs runChangelogMonitor() directly.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { listSpecUpdates, runChangelogMonitor } from "../changelog-monitor.js";

export function createSpecUpdatesRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/seeds/spec-updates/:domain", async (c) => {
    const domain = c.req.param("domain");
    if (domain !== "code" && domain !== "design") {
      return c.json(
        { error: "invalid_domain", error_description: "domain must be 'code' or 'design'" },
        400,
      );
    }
    const updates = await listSpecUpdates(c.env, domain);
    return c.json({ domain, count: updates.length, updates });
  });

  app.post("/admin/run-changelog-monitor", async (c) => {
    const expected = c.env.INTERNAL_CALLBACK_TOKEN;
    if (!expected) return c.json({ error: "admin_disabled" }, 503);
    const auth = c.req.header("authorization") ?? c.req.header("Authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m || m[1] !== expected) return c.json({ error: "unauthorized" }, 401);

    const result = await runChangelogMonitor(c.env);
    return c.json(result);
  });

  return app;
}

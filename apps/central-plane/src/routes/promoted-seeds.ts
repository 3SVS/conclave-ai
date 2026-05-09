/**
 * v0.16.10 — Sprint C: promoted-seeds endpoints.
 *
 *   GET  /seeds/promoted/:domain      — public read. Returns promoted
 *                                       seeds for 'code' or 'design' so
 *                                       cli review/audit can inject them
 *                                       into ctx.answerKeys / failureCatalog
 *                                       alongside bundled-seeds + external-
 *                                       references.
 *
 *   POST /admin/promote-seeds         — INTERNAL_CALLBACK_TOKEN-auth.
 *                                       Manually run a promoter pass —
 *                                       useful for smoke tests + when
 *                                       the daily cron hasn't fired yet.
 *
 * The daily cron in src/index.ts (`0 4 * * *`) runs promoteSeedsPass()
 * directly, not through this route.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { listPromotedSeeds, promoteSeedsPass } from "../seed-promoter.js";

export function createPromotedSeedsRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/seeds/promoted/:domain", async (c) => {
    const domain = c.req.param("domain");
    if (domain !== "code" && domain !== "design") {
      return c.json(
        { error: "invalid_domain", error_description: "domain must be 'code' or 'design'" },
        400,
      );
    }
    const seeds = await listPromotedSeeds(c.env, domain);
    return c.json({ domain, count: seeds.length, seeds });
  });

  app.post("/admin/promote-seeds", async (c) => {
    const expected = c.env.INTERNAL_CALLBACK_TOKEN;
    if (!expected) return c.json({ error: "admin_disabled" }, 503);
    const auth = c.req.header("authorization") ?? c.req.header("Authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m || m[1] !== expected) return c.json({ error: "unauthorized" }, 401);

    const result = await promoteSeedsPass(c.env);
    return c.json(result);
  });

  return app;
}

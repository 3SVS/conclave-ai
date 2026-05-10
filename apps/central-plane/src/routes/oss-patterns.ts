/**
 * v0.16.13 — Sprint E2: OSS PR pattern routes.
 *
 *   GET  /seeds/oss-patterns/:domain  — public read. CLI fetches and
 *                                       injects alongside promoted_seeds
 *                                       and external_references.
 *   POST /admin/run-oss-pr-miner      — INTERNAL_CALLBACK_TOKEN. Manual
 *                                       trigger of a miner pass.
 *
 * The daily cron in src/index.ts runs runOssPrMiner() directly.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { listOssPatterns, runOssPrMiner } from "../oss-pr-miner.js";

export function createOssPatternsRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/seeds/oss-patterns/:domain", async (c) => {
    const domain = c.req.param("domain");
    if (domain !== "code" && domain !== "design") {
      return c.json(
        { error: "invalid_domain", error_description: "domain must be 'code' or 'design'" },
        400,
      );
    }
    const patterns = await listOssPatterns(c.env, domain);
    return c.json({ domain, count: patterns.length, patterns });
  });

  app.post("/admin/run-oss-pr-miner", async (c) => {
    const expected = c.env.INTERNAL_CALLBACK_TOKEN;
    if (!expected) return c.json({ error: "admin_disabled" }, 503);
    const auth = c.req.header("authorization") ?? c.req.header("Authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m || m[1] !== expected) return c.json({ error: "unauthorized" }, 401);

    const result = await runOssPrMiner(c.env);
    return c.json(result);
  });

  return app;
}

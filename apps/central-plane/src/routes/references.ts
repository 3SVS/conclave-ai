/**
 * v0.16.8 — Phase 4: external-reference endpoints.
 *
 *   GET  /references/:domain          — public read.
 *                                       Returns cached external lessons for
 *                                       'code' or 'design' so cli review/audit
 *                                       can inject them into ctx.answerKeys /
 *                                       failureCatalog.
 *
 *   POST /admin/refresh-references    — admin force-refresh.
 *                                       Auth: Authorization: Bearer
 *                                       <INTERNAL_CALLBACK_TOKEN>. Iterates the
 *                                       SOURCES allowlist, runs Haiku extractor
 *                                       per source, upserts. Returns per-source
 *                                       results.
 *
 * The daily cron (in src/index.ts) calls refreshAllSources() directly,
 * not through the HTTP endpoint, so it doesn't need auth.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { listExternalReferences, refreshAllSources } from "../external-references.js";

export function createReferencesRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/references/:domain", async (c) => {
    const domain = c.req.param("domain");
    if (domain !== "code" && domain !== "design") {
      return c.json({ error: "invalid_domain", error_description: "domain must be 'code' or 'design'" }, 400);
    }
    const refs = await listExternalReferences(c.env, domain);
    return c.json({
      domain,
      count: refs.length,
      references: refs,
    });
  });

  app.post("/admin/refresh-references", async (c) => {
    const expected = c.env.INTERNAL_CALLBACK_TOKEN;
    if (!expected) {
      return c.json({ error: "admin_disabled" }, 503);
    }
    const auth = c.req.header("authorization") ?? c.req.header("Authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m || m[1] !== expected) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const results = await refreshAllSources(c.env);
    return c.json({ results });
  });

  return app;
}

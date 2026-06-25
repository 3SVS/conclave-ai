/**
 * Stage 209 — Better Auth LOCAL-ONLY route wiring.
 *
 * Mounts `/api/auth/*` for the local Better Auth spike, behind the AUTH_ENABLED
 * flag. It is production-safe by construction:
 *
 *   - AUTH_ENABLED unset/!= "true"  → 503 { error: "auth_disabled" }  (the default,
 *     and therefore the production behaviour — the route exists but never activates).
 *   - AUTH_ENABLED === "true" but no local secret / runtime not ready
 *                                   → 503 { error: "auth_not_configured" }
 *   - AUTH_ENABLED === "true" AND a local secret present
 *                                   → delegate to the Better Auth handler.
 *
 * It never reads back, echoes, or logs the secret/token/user/session/DB. It adds
 * no OAuth provider, no CORS, no dashboard UI. The Better Auth instance is built
 * only via createBetterAuthSpike(env) (which returns null on the production/test
 * path), so the live auth surface activates only when AUTH_ENABLED is explicitly
 * set with a local secret.
 *
 * Note: runtime D1 binding is intentionally deferred (the spike instance is
 * stateless — no `database` option). The 0047 migration draft prepares the
 * identity tables for a separately-approved D1-wiring stage; until then the
 * enabled path delegates to a stateless handler and any DB-backed flow is not
 * provisioned. See createBetterAuthSpike().
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { getAuthSpikeConfig } from "../auth-spike-config.js";
import { createBetterAuthSpike } from "../better-auth-spike.js";

export function createAuthSpikeRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.all("/api/auth/*", async (c) => {
    const cfg = getAuthSpikeConfig(c.env);
    if (!cfg.enabled) {
      return c.json({ error: "auth_disabled" }, 503);
    }
    const auth = createBetterAuthSpike(c.env);
    if (!auth) {
      // Flag on but runtime not ready (e.g. no local secret). Never reveal why
      // beyond this minimal, secret-free signal.
      return c.json({ error: "auth_not_configured" }, 503);
    }
    return auth.handler(c.req.raw);
  });

  return app;
}

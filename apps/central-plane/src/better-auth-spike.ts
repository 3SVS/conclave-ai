import { betterAuth } from "better-auth";
import type { Env } from "./env.js";
import { getAuthSpikeConfig } from "./auth-spike-config.js";

/**
 * Stage 204 — Better Auth LOCAL-ONLY spike.
 *
 * Goal: prove the `better-auth` package resolves and imports cleanly under the
 * central-plane TypeScript / Cloudflare Workers build, while remaining FULLY GATED:
 *   - NOT instantiated at import time,
 *   - NOT wired to D1 (no schema, no migration),
 *   - secret-free by default (returns null unless a local secret is explicitly present),
 *   - never activated in production,
 *   - no OAuth provider, no email provider, no route activation.
 *
 * Real instantiation (D1 binding + secret + routes + migration + cookie/CORS wiring) is
 * deferred to a separately-approved stage. This file is a compile-level proof only.
 */

/** Import proof: the better-auth factory resolved at build time. */
export function betterAuthAvailable(): boolean {
  return typeof betterAuth === "function";
}

/**
 * Construct the local-only spike auth instance — ONLY when the flag is enabled AND a local
 * secret is present (`runtimeReady`). Returns null in every other case (the default /
 * production / test path), so no secret and no D1 are required to compile or test. Stateless
 * config only (no `database`); email/password is declared but nothing is provisioned.
 */
export function createBetterAuthSpike(env: Partial<Env> | undefined) {
  const cfg = getAuthSpikeConfig(env);
  if (!cfg.runtimeReady) return null;
  const secret = (env ?? {}).BETTER_AUTH_SECRET as string;
  // The factory call type-checks (import proof + gated construction). The instance is only
  // ever built locally with a present secret; the production/test path returns null above.
  return betterAuth({
    secret,
    emailAndPassword: { enabled: true },
  });
}

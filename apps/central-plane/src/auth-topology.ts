import type { Env } from "./env.js";

/**
 * Stage 227 — Better Auth topology config (cookie / CORS readiness).
 *
 * Resolves the OPTIONAL production topology options for the local Better Auth runtime from
 * env, lazily per request. It is purely additive and fail-safe:
 *   - with no topology env set, this returns `{}` and the runtime behaves exactly as before
 *     (Better Auth derives the origin from the incoming request — current behaviour),
 *   - it NEVER activates auth (that stays gated by AUTH_ENABLED) and NEVER throws,
 *   - invalid / empty values are ignored (fail closed to "unset"), never fabricated.
 *
 * The fields map 1:1 to verified Better Auth 1.6.20 options (`@better-auth/core` init-options):
 *   - `baseURL?: string`           ← BETTER_AUTH_BASE_URL
 *   - `trustedOrigins?: string[]`  ← BETTER_AUTH_TRUSTED_ORIGINS (comma-separated)
 * Cookie/`advanced` options are intentionally deferred (same-origin needs no special cookie
 * config; a subdomain topology would add `advanced.cookies` — a separate, later decision).
 */
export type AuthTopologyConfig = {
  baseURL?: string;
  trustedOrigins?: string[];
};

/** Parse a comma-separated trusted-origins env value into a clean list (or undefined). */
export function parseTrustedOrigins(value: string | undefined): string[] | undefined {
  if (typeof value !== "string") return undefined;
  const list = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return list.length > 0 ? list : undefined;
}

/**
 * Resolve the optional topology config from env. Returns an object containing ONLY the
 * fields that are explicitly, non-emptily set — so an empty/absent env yields `{}` and the
 * caller spreads nothing into the Better Auth options (unchanged behaviour).
 */
export function resolveAuthTopologyConfig(env: Partial<Env> | undefined): AuthTopologyConfig {
  const e = env ?? {};
  const cfg: AuthTopologyConfig = {};
  const baseURL = typeof e.BETTER_AUTH_BASE_URL === "string" ? e.BETTER_AUTH_BASE_URL.trim() : "";
  if (baseURL) cfg.baseURL = baseURL;
  const trustedOrigins = parseTrustedOrigins(e.BETTER_AUTH_TRUSTED_ORIGINS);
  if (trustedOrigins) cfg.trustedOrigins = trustedOrigins;
  return cfg;
}

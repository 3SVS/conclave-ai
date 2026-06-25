import type { Env } from "./env.js";

/**
 * Stage 204 — Better Auth LOCAL-ONLY spike: pure, deterministic feature-flag read.
 *
 * Mirrors the existing flag pattern (e.g. getCreditExecutionConfig): default OFF, parsed
 * from string env vars, never throws. It returns booleans only and NEVER reads back or
 * returns secret VALUES — only whether a secret is present. No D1, no network, no Better
 * Auth import here (so it is trivially testable and side-effect-free).
 */
export type AuthSpikeConfig = {
  /** True only when AUTH_ENABLED === "true". Default false (production-safe). */
  enabled: boolean;
  /** Provider id for the spike. */
  provider: string;
  /** Always true: the spike never enables production sign-in. */
  productionSafe: boolean;
  /** True only when enabled AND a (local) secret is present — gates runtime construction. */
  runtimeReady: boolean;
};

const DEFAULT_PROVIDER = "better-auth";

/**
 * @param env partial Workers env (or undefined). Only string flags are read.
 */
export function getAuthSpikeConfig(env: Partial<Env> | undefined): AuthSpikeConfig {
  const e = env ?? {};
  const enabled = e.AUTH_ENABLED === "true";
  const provider =
    typeof e.AUTH_PROVIDER === "string" && e.AUTH_PROVIDER.trim()
      ? e.AUTH_PROVIDER.trim()
      : DEFAULT_PROVIDER;
  const hasSecret = typeof e.BETTER_AUTH_SECRET === "string" && e.BETTER_AUTH_SECRET.length > 0;
  return {
    enabled,
    provider,
    productionSafe: true,
    runtimeReady: enabled && hasSecret,
  };
}

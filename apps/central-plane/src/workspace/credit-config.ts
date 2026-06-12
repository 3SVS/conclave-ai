/**
 * workspace/credit-config.ts
 *
 * Stage 24 — feature-flag helpers for credit execution mode.
 * Stage 31 — limited rollout allowlist (ACTUAL_DEBIT_ALLOWED_USER_KEYS).
 *
 * Both flags default to false; neither is ever true in production unless
 * an operator explicitly sets the env var to the string "true".
 *
 * ENABLE_ACTUAL_CREDIT_DEBITS:      allows debitCredits() to write D1.
 * ENABLE_CREDIT_BLOCKING:           allows PR review to return HTTP 402.
 * ACTUAL_DEBIT_ALLOWED_USER_KEYS:   comma-separated allowlist of userKeys
 *   that are eligible for actual debits when the flag is on.
 *   Empty string → no user is eligible even when flag is "true".
 *   "*" wildcard is NOT supported in Stage 31.
 */
import type { Env } from "../env.js";

export type CreditExecutionConfig = {
  actualDebitsEnabled: boolean;
  blockingEnabled: boolean;
  actualDebitAllowedUserKeys: string[];
};

export function getCreditExecutionConfig(env: Env): CreditExecutionConfig {
  const raw = env.ACTUAL_DEBIT_ALLOWED_USER_KEYS ?? "";
  const actualDebitAllowedUserKeys = raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  return {
    actualDebitsEnabled: env.ENABLE_ACTUAL_CREDIT_DEBITS === "true",
    blockingEnabled: env.ENABLE_CREDIT_BLOCKING === "true",
    actualDebitAllowedUserKeys,
  };
}

/**
 * Returns true only if BOTH:
 *  1. actualDebitsEnabled=true
 *  2. userKey appears in the allowlist
 *
 * If the allowlist is empty, no user is allowed even when the flag is on.
 */
export function isActualDebitAllowedForUser(
  config: CreditExecutionConfig,
  userKey: string,
): boolean {
  if (!config.actualDebitsEnabled) return false;
  return config.actualDebitAllowedUserKeys.includes(userKey);
}

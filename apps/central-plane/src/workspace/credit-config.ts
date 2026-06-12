/**
 * workspace/credit-config.ts
 *
 * Stage 24 — feature-flag helpers for credit execution mode.
 *
 * Both flags default to false; neither is ever true in production unless
 * an operator explicitly sets the env var to the string "true".
 *
 * ENABLE_ACTUAL_CREDIT_DEBITS: allows debitCredits() to write D1.
 * ENABLE_CREDIT_BLOCKING:      allows PR review to return HTTP 402.
 */
import type { Env } from "../env.js";

export type CreditExecutionConfig = {
  actualDebitsEnabled: boolean;
  blockingEnabled: boolean;
};

export function getCreditExecutionConfig(env: Env): CreditExecutionConfig {
  return {
    actualDebitsEnabled: env.ENABLE_ACTUAL_CREDIT_DEBITS === "true",
    blockingEnabled: env.ENABLE_CREDIT_BLOCKING === "true",
  };
}

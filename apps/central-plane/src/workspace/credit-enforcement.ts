/**
 * workspace/credit-enforcement.ts
 *
 * Credit enforcement dry-run helper.
 *
 * IMPORTANT: Stage 22 — dry-run only.
 * - actualDebitsEnabled is always false.
 * - Monthly allowance covers the first 5 PR reviews per workspace per month.
 * - wouldBlock=true signals insufficient credit after allowance,
 *   but the feature is NEVER blocked and credits are NEVER debited.
 * - No D1 writes happen here.
 */
import type { Env } from "../env.js";
import { getBillingRule } from "./billing-rules.js";
import { getCreditBalance, debitCredits, generateDebitId } from "./credits.js";
import type { CreditType } from "./credits.js";
import type { BillingStatus } from "./billing-rules.js";
import { getAllowanceDryRun } from "./allowance-usage.js";
import type { AllowanceDryRun } from "./allowance-usage.js";
import { getCreditExecutionConfig } from "./credit-config.js";

export type CreditEnforcementDryRun = {
  actualDebitsEnabled: false;
  wouldBlock: boolean;
  billingStatus: BillingStatus;
  eventType: string;
  creditType?: CreditType;
  requiredCredits: number;
  currentBalance: number;
  remainingAfter: number;
  message: string;
  allowance?: {
    enabled: true;
    period: "monthly";
    periodKey: string;
    includedRuns: number;
    usedThisPeriod: number;
    remainingIncludedRuns: number;
    coveredByAllowance: boolean;
    billableUnitsAfterAllowance: number;
  };
};

function buildMessage(
  billingStatus: BillingStatus,
  wouldBlock: boolean,
  requiredCredits: number,
  creditType: CreditType | undefined,
  allowance: AllowanceDryRun | null,
): string {
  if (billingStatus === "included" || billingStatus === "ignored") {
    return "이 기능은 현재 포함 기능으로 분류되어 credit이 필요하지 않습니다.";
  }
  if (billingStatus === "future_billable") {
    return "이 기능은 향후 과금 예정이지만 현재는 무료입니다.";
  }
  // billable_candidate
  if (allowance?.coveredByAllowance) {
    return "이번 PR 코드 확인은 월 무료 제공량 안에 포함됩니다. 현재는 실제 credit을 차감하지 않습니다.";
  }
  const typeLabel = creditType === "review" ? "review credit" : creditType ?? "credit";
  if (wouldBlock) {
    return `월 무료 제공량을 초과했고 ${typeLabel}이 부족할 예정입니다. 현재는 테스트 기간이라 실행을 막지 않습니다.`;
  }
  return `월 무료 제공량을 초과하면 ${requiredCredits} ${typeLabel}이 필요할 예정입니다. 현재는 실제 차감하지 않습니다.`;
}

// Stage 24 — CreditEnforcementResult extends the dry-run result with
// actual debit outcome. CreditEnforcementDryRun is kept as a type alias
// for backwards compatibility with existing callers.
// Stage 26 — debit field extended with idempotency fields.
// Stage 27 — idempotency? field added (set by PR review endpoint, not by checkCreditEnforcement).
export type CreditEnforcementResult = {
  actualDebitsEnabled: boolean;
  blocked: boolean;
  wouldBlock: boolean;
  billingStatus: BillingStatus;
  eventType: string;
  creditType?: CreditType;
  requiredCredits: number;
  currentBalance: number;
  remainingAfter: number;
  message: string;
  debit?: {
    attempted: boolean;
    applied: boolean;
    duplicate?: boolean;
    sourceEventId?: string;
    ledgerEntryId?: string;
    ledgerStatus?: "pending" | "applied" | "failed";
    newBalance?: number;
    error?: string;
  };
  idempotency?: {
    provided: boolean;
    keyAccepted: boolean;
    sourceEventId: string;
  };
  allowance?: {
    enabled: true;
    period: "monthly";
    periodKey: string;
    includedRuns: number;
    usedThisPeriod: number;
    remainingIncludedRuns: number;
    coveredByAllowance: boolean;
    billableUnitsAfterAllowance: number;
  };
};

/**
 * Full credit enforcement — checks allowance + balance, then optionally
 * debits D1 and blocks execution, depending on feature flags.
 *
 * Flags (from env):
 *   ENABLE_ACTUAL_CREDIT_DEBITS=true → debitCredits() is called when billable
 *   ENABLE_CREDIT_BLOCKING=true      → blocked=true (caller should return 402)
 *     (blocking only activates when actualDebitsEnabled is also true)
 */
export async function checkCreditEnforcement({
  env,
  userKey,
  eventType,
  projectId,
  sourceEventId,
}: {
  env: Env;
  userKey: string;
  eventType: string;
  projectId?: string;
  sourceEventId?: string;
}): Promise<CreditEnforcementResult> {
  const config = getCreditExecutionConfig(env);
  const rule = getBillingRule(eventType);

  if (rule.billingStatus !== "billable_candidate" || !rule.creditType || rule.creditCost <= 0) {
    return {
      actualDebitsEnabled: config.actualDebitsEnabled,
      blocked: false,
      wouldBlock: false,
      billingStatus: rule.billingStatus,
      eventType,
      creditType: rule.creditType as CreditType | undefined,
      requiredCredits: 0,
      currentBalance: 0,
      remainingAfter: 0,
      message: buildMessage(rule.billingStatus, false, 0, rule.creditType as CreditType | undefined, null),
    };
  }

  const creditType = rule.creditType as CreditType;

  let allowance: AllowanceDryRun | null = null;
  try {
    allowance = await getAllowanceDryRun({ env, userKey, eventType });
  } catch {
    allowance = null;
  }

  const requiredCredits = allowance?.coveredByAllowance ? 0 : rule.creditCost;

  let currentBalance = 0;
  try {
    const balanceRow = await getCreditBalance(env, userKey, creditType);
    currentBalance = balanceRow?.balance ?? 0;
  } catch {
    currentBalance = 0;
  }

  const wouldBlock = allowance?.coveredByAllowance ? false : currentBalance < requiredCredits;
  const remainingAfter = Math.max(0, currentBalance - requiredCredits);

  // Blocking: only when both flags are true
  const blocked = config.actualDebitsEnabled && config.blockingEnabled && wouldBlock;

  let debit: CreditEnforcementResult["debit"];

  if (config.actualDebitsEnabled && requiredCredits > 0 && !wouldBlock) {
    // Use caller-provided sourceEventId for idempotency; generate a fallback if absent
    const effectiveSourceEventId = sourceEventId ?? generateDebitId();
    const result = await debitCredits(env, {
      userKey,
      creditType,
      amount: requiredCredits,
      reason: `${rule.label ?? eventType} 실행`,
      ...(projectId ? { projectId } : {}),
      sourceEventId: effectiveSourceEventId,
    });
    if (result.ok) {
      debit = {
        attempted: true,
        applied: !result.duplicate,
        ...(result.duplicate ? { duplicate: true } : {}),
        sourceEventId: result.sourceEventId,
        ledgerEntryId: result.ledgerEntryId,
        ledgerStatus: result.ledgerStatus,
        newBalance: result.newBalance,
      };
    } else {
      debit = {
        attempted: true,
        applied: false,
        error: result.error,
      };
    }
  }

  return {
    actualDebitsEnabled: config.actualDebitsEnabled,
    blocked,
    wouldBlock,
    billingStatus: rule.billingStatus,
    eventType,
    creditType,
    requiredCredits,
    currentBalance,
    remainingAfter,
    message: buildMessage(rule.billingStatus, wouldBlock, requiredCredits, creditType, allowance),
    ...(debit ? { debit } : {}),
    ...(allowance ? { allowance } : {}),
  };
}

export async function checkCreditEnforcementDryRun({
  env,
  userKey,
  eventType,
}: {
  env: Env;
  userKey: string;
  eventType: string;
}): Promise<CreditEnforcementDryRun> {
  const rule = getBillingRule(eventType);

  // Non-billable: no queries needed
  if (rule.billingStatus !== "billable_candidate" || !rule.creditType || rule.creditCost <= 0) {
    return {
      actualDebitsEnabled: false,
      wouldBlock: false,
      billingStatus: rule.billingStatus,
      eventType,
      creditType: rule.creditType as CreditType | undefined,
      requiredCredits: 0,
      currentBalance: 0,
      remainingAfter: 0,
      message: buildMessage(rule.billingStatus, false, 0, rule.creditType as CreditType | undefined, null),
    };
  }

  const creditType = rule.creditType as CreditType;

  // Check monthly allowance first (non-fatal)
  let allowance: AllowanceDryRun | null = null;
  try {
    allowance = await getAllowanceDryRun({ env, userKey, eventType });
  } catch {
    allowance = null;
  }

  // Covered by allowance → requiredCredits=0, wouldBlock=false
  const requiredCredits = allowance?.coveredByAllowance ? 0 : rule.creditCost;

  // Query current balance for informational purposes (non-fatal)
  let currentBalance = 0;
  try {
    const balanceRow = await getCreditBalance(env, userKey, creditType);
    currentBalance = balanceRow?.balance ?? 0;
  } catch {
    currentBalance = 0;
  }

  const wouldBlock = allowance?.coveredByAllowance ? false : currentBalance < requiredCredits;
  const remainingAfter = Math.max(0, currentBalance - requiredCredits);

  return {
    actualDebitsEnabled: false,
    wouldBlock,
    billingStatus: rule.billingStatus,
    eventType,
    creditType,
    requiredCredits,
    currentBalance,
    remainingAfter,
    message: buildMessage(rule.billingStatus, wouldBlock, requiredCredits, creditType, allowance),
    ...(allowance ? { allowance } : {}),
  };
}

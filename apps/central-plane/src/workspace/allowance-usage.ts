/**
 * workspace/allowance-usage.ts
 *
 * Monthly allowance dry-run helper.
 *
 * Stage 22: reads current-period usage count from D1.
 * No writes. Returns null when the event has no allowance rule.
 */
import type { Env } from "../env.js";
import { getMonthlyAllowanceRule, getCurrentAllowancePeriod } from "./allowance-rules.js";

export type AllowanceDryRun = {
  enabled: true;
  eventType: string;
  period: "monthly";
  periodKey: string;
  includedRuns: number;
  usedThisPeriod: number;
  remainingIncludedRuns: number;
  coveredByAllowance: boolean;
  billableUnitsAfterAllowance: number;
};

export async function getAllowanceDryRun({
  env,
  userKey,
  eventType,
  now,
}: {
  env: Env;
  userKey: string;
  eventType: string;
  now?: Date;
}): Promise<AllowanceDryRun | null> {
  const rule = getMonthlyAllowanceRule(eventType);
  if (!rule) return null;

  const { periodKey, periodStart, periodEnd } = getCurrentAllowancePeriod(now);

  const result = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM workspace_usage_events
     WHERE user_key = ? AND event_type = ? AND created_at >= ? AND created_at < ?`,
  )
    .bind(userKey, eventType, periodStart, periodEnd)
    .first<{ count: number }>();

  const usedThisPeriod = result?.count ?? 0;
  const remainingIncludedRuns = Math.max(0, rule.includedRuns - usedThisPeriod);
  const coveredByAllowance = remainingIncludedRuns > 0;
  const billableUnitsAfterAllowance = coveredByAllowance ? 0 : 1;

  return {
    enabled: true,
    eventType,
    period: "monthly",
    periodKey,
    includedRuns: rule.includedRuns,
    usedThisPeriod,
    remainingIncludedRuns,
    coveredByAllowance,
    billableUnitsAfterAllowance,
  };
}

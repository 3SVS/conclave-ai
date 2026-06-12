/**
 * workspace/allowance-rules.ts
 *
 * Monthly allowance rule definitions.
 *
 * Stage 22: 5 free PR reviews per workspace per calendar month.
 * No D1 writes — read-only rule definitions + period helpers.
 */
import type { CreditType } from "./credits.js";

export type MonthlyAllowanceRule = {
  eventType: string;
  label: string;
  period: "monthly";
  includedRuns: number;
  creditType: CreditType;
};

const ALLOWANCE_RULES: Record<string, MonthlyAllowanceRule> = {
  workspace_pr_review_run: {
    eventType: "workspace_pr_review_run",
    label: "월 무료 PR 코드 확인",
    period: "monthly",
    includedRuns: 5,
    creditType: "review",
  },
};

export function getMonthlyAllowanceRule(eventType: string): MonthlyAllowanceRule | null {
  return ALLOWANCE_RULES[eventType] ?? null;
}

export function getCurrentAllowancePeriod(now?: Date): {
  periodKey: string;
  periodStart: string;
  periodEnd: string;
} {
  const d = now ?? new Date();
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-indexed
  const periodKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const periodStart = new Date(Date.UTC(year, month, 1)).toISOString();
  const periodEnd = new Date(Date.UTC(year, month + 1, 1)).toISOString();
  return { periodKey, periodStart, periodEnd };
}

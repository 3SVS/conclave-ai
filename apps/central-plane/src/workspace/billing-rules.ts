/**
 * workspace/billing-rules.ts
 *
 * Credit billing rules for workspace usage events.
 *
 * IMPORTANT: This is a DRY-RUN module only.
 * - No credit balance table is created here.
 * - No credit deduction happens here.
 * - Admin usage-stats uses these rules to show estimated costs.
 * - actualChargesEnabled is always false until billing is enabled.
 */

export type BillingStatus =
  | "billable_candidate"  // Would be billed when billing is enabled
  | "included"            // Always free/included
  | "future_billable"     // Not yet billable, planned for a future stage
  | "ignored";            // Not tracked for billing

export type CreditType = "review" | "fix" | "workspace";

export type BillingRule = {
  eventType: string;
  label: string;
  billingStatus: BillingStatus;
  creditType?: CreditType;
  creditCost: number;
};

const RULES: BillingRule[] = [
  {
    eventType: "workspace_idea_to_spec_generated",
    label: "제품 설명서 생성",
    billingStatus: "included",
    creditType: "workspace",
    creditCost: 0,
  },
  {
    eventType: "workspace_check_draft_run",
    label: "제품 설명서 기준 확인",
    billingStatus: "included",
    creditType: "workspace",
    creditCost: 0,
  },
  {
    eventType: "workspace_builder_pack_exported",
    label: "고쳐보기 패키지 내보내기",
    billingStatus: "included",
    creditType: "workspace",
    creditCost: 0,
  },
  {
    eventType: "workspace_fix_pack_exported",
    label: "고쳐보기 패키지 내보내기",
    billingStatus: "included",
    creditType: "workspace",
    creditCost: 0,
  },
  {
    eventType: "workspace_fix_suggestion_generated",
    label: "수정 제안 생성",
    billingStatus: "included",
    creditType: "workspace",
    creditCost: 0,
  },
  {
    eventType: "workspace_pr_review_run",
    label: "PR 코드 확인",
    billingStatus: "billable_candidate",
    creditType: "review",
    creditCost: 1,
  },
  {
    eventType: "workspace_pr_review_compared",
    label: "PR 확인 비교",
    billingStatus: "included",
    creditType: "workspace",
    creditCost: 0,
  },
  {
    eventType: "workspace_pr_comment_posted",
    label: "PR 코멘트 작성",
    billingStatus: "included",
    creditCost: 0,
  },
  {
    eventType: "workspace_pr_comment_updated",
    label: "PR 코멘트 업데이트",
    billingStatus: "included",
    creditCost: 0,
  },
  {
    eventType: "workspace_telegram_notification_sent",
    label: "Telegram 알림",
    billingStatus: "included",
    creditCost: 0,
  },
  {
    eventType: "workspace_telegram_notification_error",
    label: "Telegram 알림 실패",
    billingStatus: "ignored",
    creditCost: 0,
  },
];

const RULE_MAP = new Map<string, BillingRule>(RULES.map((r) => [r.eventType, r]));

const FALLBACK_RULE: BillingRule = {
  eventType: "",
  label: "",
  billingStatus: "ignored",
  creditCost: 0,
};

export function getBillingRule(eventType: string): BillingRule {
  return RULE_MAP.get(eventType) ?? { ...FALLBACK_RULE, eventType, label: eventType };
}

export function getAllRules(): BillingRule[] {
  return RULES;
}

export function estimateCredits(eventType: string, count: number): number {
  return getBillingRule(eventType).creditCost * count;
}

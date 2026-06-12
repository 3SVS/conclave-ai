/**
 * workspace-admin-stats.ts
 *
 * GET /admin/usage-stats?range=24h|7d|30d
 *
 * Auth: x-admin-key header must match ADMIN_USAGE_STATS_KEY env secret.
 * Returns 503 when ADMIN_USAGE_STATS_KEY is unset.
 * Returns 401 on key mismatch.
 *
 * No billing, no credit deduction — read-only analytics + dry-run billing estimate.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { getBillingRule, estimateCredits } from "../workspace/billing-rules.js";
import type { BillingStatus, CreditType } from "../workspace/billing-rules.js";

// ─── Range helpers ────────────────────────────────────────────────────────────

type Range = "24h" | "7d" | "30d";

function rangeToSeconds(range: Range): number {
  if (range === "24h") return 86400;
  if (range === "7d") return 86400 * 7;
  return 86400 * 30;
}

function cutoffIso(range: Range): string {
  const ms = Date.now() - rangeToSeconds(range) * 1000;
  return new Date(ms).toISOString();
}

// ─── DB row types ─────────────────────────────────────────────────────────────

type EventCountRow = { event_type: string; count: number };
type ActiveUserRow = { user_key: string; count: number };
type DailyBucketRow = { day_bucket: string; count: number };
type UserEventRow = { user_key: string; project_id: string | null; event_type: string; count: number };

// ─── DB aggregation ───────────────────────────────────────────────────────────

async function countByEventType(db: D1Database, cutoff: string): Promise<EventCountRow[]> {
  const result = await db
    .prepare(
      `SELECT event_type, COUNT(*) as count
       FROM workspace_usage_events
       WHERE created_at >= ?
       GROUP BY event_type
       ORDER BY count DESC`,
    )
    .bind(cutoff)
    .all<EventCountRow>();
  return result.results ?? [];
}

async function countActiveUsers(db: D1Database, cutoff: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(DISTINCT user_key) as count
       FROM workspace_usage_events
       WHERE created_at >= ?`,
    )
    .bind(cutoff)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

async function topActiveUsers(db: D1Database, cutoff: string, limit = 10): Promise<ActiveUserRow[]> {
  const result = await db
    .prepare(
      `SELECT user_key, COUNT(*) as count
       FROM workspace_usage_events
       WHERE created_at >= ?
       GROUP BY user_key
       ORDER BY count DESC
       LIMIT ?`,
    )
    .bind(cutoff, limit)
    .all<ActiveUserRow>();
  return result.results ?? [];
}

async function dailyBuckets(db: D1Database, cutoff: string): Promise<DailyBucketRow[]> {
  const result = await db
    .prepare(
      `SELECT substr(created_at, 1, 10) as day_bucket, COUNT(*) as count
       FROM workspace_usage_events
       WHERE created_at >= ?
       GROUP BY day_bucket
       ORDER BY day_bucket ASC`,
    )
    .bind(cutoff)
    .all<DailyBucketRow>();
  return result.results ?? [];
}

async function notificationErrorRate(db: D1Database, cutoff: string): Promise<number> {
  const [sentRow, errRow] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) as count FROM workspace_usage_events WHERE event_type = 'workspace_telegram_notification_sent' AND created_at >= ?`)
      .bind(cutoff)
      .first<{ count: number }>(),
    db
      .prepare(`SELECT COUNT(*) as count FROM workspace_usage_events WHERE event_type = 'workspace_telegram_notification_error' AND created_at >= ?`)
      .bind(cutoff)
      .first<{ count: number }>(),
  ]);
  const sent = sentRow?.count ?? 0;
  const err = errRow?.count ?? 0;
  const total = sent + err;
  if (total === 0) return 0;
  return Math.round((err / total) * 10000) / 100;
}

async function llmFallbackRate(db: D1Database, cutoff: string): Promise<number> {
  const totalRow = await db
    .prepare(
      `SELECT COUNT(*) as count FROM workspace_usage_events
       WHERE event_type = 'workspace_pr_review_run' AND created_at >= ?`,
    )
    .bind(cutoff)
    .first<{ count: number }>();
  const fallbackRow = await db
    .prepare(
      `SELECT COUNT(*) as count FROM workspace_usage_events
       WHERE event_type = 'workspace_pr_review_run'
         AND metadata_json LIKE '%mock-fallback%'
         AND created_at >= ?`,
    )
    .bind(cutoff)
    .first<{ count: number }>();
  const total = totalRow?.count ?? 0;
  const fallback = fallbackRow?.count ?? 0;
  if (total === 0) return 0;
  return Math.round((fallback / total) * 10000) / 100;
}

/** Per-(user_key, project_id, event_type) counts — used for dry-run credit aggregation. */
async function userEventBreakdown(db: D1Database, cutoff: string): Promise<UserEventRow[]> {
  const result = await db
    .prepare(
      `SELECT user_key, project_id, event_type, COUNT(*) as count
       FROM workspace_usage_events
       WHERE created_at >= ?
       GROUP BY user_key, project_id, event_type`,
    )
    .bind(cutoff)
    .all<UserEventRow>();
  return result.results ?? [];
}

// ─── Dry-run billing computation (no deduction) ───────────────────────────────

type DryRunBillingByEventRow = {
  eventType: string;
  label: string;
  count: number;
  billingStatus: BillingStatus;
  creditType?: CreditType;
  creditCost: number;
  estimatedCredits: number;
};

type DryRunBillingSummary = {
  actualChargesEnabled: false;
  totalEstimatedCredits: number;
  byCreditType: Array<{ creditType: CreditType; estimatedCredits: number }>;
  byEventType: DryRunBillingByEventRow[];
  topUsersByEstimatedCredits: Array<{ userKey: string; estimatedCredits: number }>;
  topProjectsByEstimatedCredits: Array<{ projectId: string; estimatedCredits: number }>;
};

function computeDryRunBilling(
  eventCounts: EventCountRow[],
  userRows: UserEventRow[],
): DryRunBillingSummary {
  // Per-event-type dry-run rows
  const byEventType: DryRunBillingByEventRow[] = eventCounts.map((r) => {
    const rule = getBillingRule(r.event_type);
    const est = estimateCredits(r.event_type, r.count);
    return {
      eventType: r.event_type,
      label: rule.label || r.event_type,
      count: r.count,
      billingStatus: rule.billingStatus,
      creditType: rule.creditType,
      creditCost: rule.creditCost,
      estimatedCredits: est,
    };
  });

  const totalEstimatedCredits = byEventType.reduce((s, r) => s + r.estimatedCredits, 0);

  // Per credit type summary
  const creditTypeMap = new Map<CreditType, number>();
  for (const r of byEventType) {
    if (r.creditType && r.estimatedCredits > 0) {
      creditTypeMap.set(r.creditType, (creditTypeMap.get(r.creditType) ?? 0) + r.estimatedCredits);
    }
  }
  const byCreditType = Array.from(creditTypeMap.entries())
    .map(([creditType, estimatedCredits]) => ({ creditType, estimatedCredits }))
    .sort((a, b) => b.estimatedCredits - a.estimatedCredits);

  // Per-user credits
  const userCreditMap = new Map<string, number>();
  for (const row of userRows) {
    const est = estimateCredits(row.event_type, row.count);
    if (est > 0) {
      userCreditMap.set(row.user_key, (userCreditMap.get(row.user_key) ?? 0) + est);
    }
  }
  const topUsersByEstimatedCredits = Array.from(userCreditMap.entries())
    .map(([userKey, estimatedCredits]) => ({ userKey, estimatedCredits }))
    .sort((a, b) => b.estimatedCredits - a.estimatedCredits)
    .slice(0, 10);

  // Per-project credits
  const projectCreditMap = new Map<string, number>();
  for (const row of userRows) {
    if (!row.project_id) continue;
    const est = estimateCredits(row.event_type, row.count);
    if (est > 0) {
      projectCreditMap.set(row.project_id, (projectCreditMap.get(row.project_id) ?? 0) + est);
    }
  }
  const topProjectsByEstimatedCredits = Array.from(projectCreditMap.entries())
    .map(([projectId, estimatedCredits]) => ({ projectId, estimatedCredits }))
    .sort((a, b) => b.estimatedCredits - a.estimatedCredits)
    .slice(0, 10);

  return {
    actualChargesEnabled: false,
    totalEstimatedCredits,
    byCreditType,
    byEventType,
    topUsersByEstimatedCredits,
    topProjectsByEstimatedCredits,
  };
}

// ─── Route factory ────────────────────────────────────────────────────────────

export function createWorkspaceAdminStatsRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  /**
   * GET /admin/usage-stats?range=24h|7d|30d
   *
   * x-admin-key header required.
   * 503 when ADMIN_USAGE_STATS_KEY not configured.
   * 401 on key mismatch.
   */
  app.get("/admin/usage-stats", async (c) => {
    if (!c.env.ADMIN_USAGE_STATS_KEY) {
      return c.json({ ok: false, error: "disabled", message: "ADMIN_USAGE_STATS_KEY가 설정되지 않았습니다." }, 503);
    }

    const provided = c.req.header("x-admin-key") ?? "";
    if (provided !== c.env.ADMIN_USAGE_STATS_KEY) {
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }

    const rawRange = c.req.query("range") ?? "7d";
    const range: Range = (["24h", "7d", "30d"] as const).includes(rawRange as Range)
      ? (rawRange as Range)
      : "7d";

    const cutoff = cutoffIso(range);

    try {
      const [eventCounts, activeUserCount, topUsers, buckets, tgErrorRate, llmRate, userRows] =
        await Promise.all([
          countByEventType(c.env.DB, cutoff),
          countActiveUsers(c.env.DB, cutoff),
          topActiveUsers(c.env.DB, cutoff),
          dailyBuckets(c.env.DB, cutoff),
          notificationErrorRate(c.env.DB, cutoff),
          llmFallbackRate(c.env.DB, cutoff),
          userEventBreakdown(c.env.DB, cutoff),
        ]);

      const total = eventCounts.reduce((s, r) => s + r.count, 0);

      const byEventType = eventCounts.map((r) => {
        const rule = getBillingRule(r.event_type);
        return {
          eventType: r.event_type,
          label: rule.label || r.event_type,
          count: r.count,
        };
      });

      const dryRunBilling = computeDryRunBilling(eventCounts, userRows);

      return c.json({
        ok: true,
        range,
        cutoff,
        summary: {
          totalEvents: total,
          activeUsers: activeUserCount,
          telegramErrorRate: tgErrorRate,
          llmFallbackRate: llmRate,
        },
        byEventType,
        topUsers: topUsers.map((r) => ({ userKey: r.user_key, count: r.count })),
        dailyActivity: buckets.map((r) => ({ date: r.day_bucket, count: r.count })),
        dryRunBilling,
      });
    } catch (err) {
      console.error("[admin/usage-stats] query failed:", err);
      return c.json({ ok: false, error: "query_failed" }, 500);
    }
  });

  return app;
}

/**
 * workspace-admin-api.ts
 *
 * Client for GET /admin/usage-stats.
 * Requires NEXT_PUBLIC_ADMIN_USAGE_STATS_KEY env var on the dashboard side
 * (or passed in at call time). The key is never stored in D1 or sent to end users.
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_CENTRAL_PLANE_URL ?? "https://conclave-ai.seunghunbae.workers.dev";

export type UsageRange = "24h" | "7d" | "30d";

export type UsageStatsSummary = {
  totalEvents: number;
  activeUsers: number;
  telegramErrorRate: number;
  llmFallbackRate: number;
};

export type EventTypeRow = {
  eventType: string;
  label: string;
  count: number;
};

export type TopUserRow = {
  userKey: string;
  count: number;
};

export type DailyActivityRow = {
  date: string;
  count: number;
};

export type UsageStatsResponse = {
  ok: true;
  range: UsageRange;
  cutoff: string;
  summary: UsageStatsSummary;
  byEventType: EventTypeRow[];
  topUsers: TopUserRow[];
  dailyActivity: DailyActivityRow[];
};

export type UsageStatsError = {
  ok: false;
  error: string;
  message?: string;
};

export async function fetchUsageStats(
  adminKey: string,
  range: UsageRange = "7d",
): Promise<UsageStatsResponse | UsageStatsError> {
  const res = await fetch(`${BASE_URL}/admin/usage-stats?range=${range}`, {
    headers: { "x-admin-key": adminKey },
    cache: "no-store",
  });
  const json = await res.json();
  return json as UsageStatsResponse | UsageStatsError;
}

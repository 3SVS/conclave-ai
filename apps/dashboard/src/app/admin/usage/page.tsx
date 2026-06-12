"use client";

import { useState } from "react";
import {
  fetchUsageStats,
  type UsageRange,
  type UsageStatsResponse,
} from "@/lib/workspace-admin-api";

const RANGE_LABELS: Record<UsageRange, string> = {
  "24h": "최근 24시간",
  "7d": "최근 7일",
  "30d": "최근 30일",
};

export default function AdminUsagePage() {
  const [adminKey, setAdminKey] = useState("");
  const [range, setRange] = useState<UsageRange>("7d");
  const [stats, setStats] = useState<UsageStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLoad() {
    if (!adminKey.trim()) {
      setError("Admin key를 입력해주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    setStats(null);
    try {
      const result = await fetchUsageStats(adminKey.trim(), range);
      if (!result.ok) {
        if (result.error === "disabled") {
          setError("서버에 ADMIN_USAGE_STATS_KEY가 설정되지 않았습니다.");
        } else if (result.error === "unauthorized") {
          setError("Admin key가 올바르지 않습니다.");
        } else {
          setError(result.message ?? result.error);
        }
      } else {
        setStats(result);
      }
    } catch {
      setError("요청에 실패했습니다. 네트워크를 확인해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin — 사용 현황</h1>
        <p className="text-sm text-gray-500 mb-6">
          워크스페이스 기능 사용 이벤트 집계입니다.
        </p>

        {/* Auth + range selector */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Admin Key</label>
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLoad()}
              placeholder="ADMIN_USAGE_STATS_KEY 입력"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">기간</label>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as UsageRange)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {(["24h", "7d", "30d"] as UsageRange[]).map((r) => (
                <option key={r} value={r}>{RANGE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleLoad}
            disabled={loading}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "로딩 중..." : "조회"}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700 text-sm">
            {error}
          </div>
        )}

        {stats && (
          <>
            <p className="text-xs text-gray-400 mb-4">
              기준: {RANGE_LABELS[stats.range]} ({stats.cutoff.slice(0, 10)} ~)
            </p>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <SummaryCard label="총 이벤트" value={stats.summary.totalEvents.toLocaleString()} />
              <SummaryCard label="활성 사용자" value={stats.summary.activeUsers.toLocaleString()} />
              <SummaryCard
                label="Telegram 실패율"
                value={`${stats.summary.telegramErrorRate.toFixed(1)}%`}
                highlight={stats.summary.telegramErrorRate > 10}
              />
              <SummaryCard
                label="LLM 폴백률"
                value={`${stats.summary.llmFallbackRate.toFixed(1)}%`}
                highlight={stats.summary.llmFallbackRate > 30}
              />
            </div>

            {/* Event type breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">기능별 이벤트</h2>
              </div>
              {stats.byEventType.length === 0 ? (
                <p className="px-5 py-4 text-sm text-gray-400">이 기간에 이벤트가 없습니다.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs">
                      <th className="text-left px-5 py-2 font-medium">기능</th>
                      <th className="text-left px-5 py-2 font-medium text-gray-400">이벤트 타입</th>
                      <th className="text-right px-5 py-2 font-medium">횟수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byEventType.map((row) => (
                      <tr key={row.eventType} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-5 py-3 text-gray-900">{row.label}</td>
                        <td className="px-5 py-3 text-gray-400 font-mono text-xs">{row.eventType}</td>
                        <td className="px-5 py-3 text-right font-medium text-gray-900">
                          {row.count.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Daily activity */}
            {stats.dailyActivity.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-800">일별 이벤트</h2>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs">
                      <th className="text-left px-5 py-2 font-medium">날짜</th>
                      <th className="text-right px-5 py-2 font-medium">이벤트</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.dailyActivity.map((row) => (
                      <tr key={row.date} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-5 py-3 text-gray-900">{row.date}</td>
                        <td className="px-5 py-3 text-right font-medium text-gray-900">
                          {row.count.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Top users */}
            {stats.topUsers.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-800">활성 사용자 Top 10</h2>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs">
                      <th className="text-left px-5 py-2 font-medium">User Key</th>
                      <th className="text-right px-5 py-2 font-medium">이벤트</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topUsers.map((row, i) => (
                      <tr key={row.userKey} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-5 py-3 font-mono text-xs text-gray-600">
                          {i + 1}. {row.userKey}
                        </td>
                        <td className="px-5 py-3 text-right font-medium text-gray-900">
                          {row.count.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${highlight ? "border-amber-300 bg-amber-50" : "border-gray-200"}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? "text-amber-700" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

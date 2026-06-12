"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getUserKey } from "@/lib/workflow-store";
import {
  fetchWorkspaceCredits,
  createTopUpRequest,
  fetchTopUpRequests,
  type WorkspaceCreditsResponse,
  type TopUpRequest,
  type CreditType,
} from "@/lib/workspace-credits-api";

const STATUS_LABELS: Record<string, string> = {
  requested: "요청됨",
  fulfilled: "지급됨",
  rejected: "거절됨",
};

const STATUS_COLORS: Record<string, string> = {
  requested: "text-amber-600 bg-amber-50 border-amber-200",
  fulfilled: "text-green-700 bg-green-50 border-green-200",
  rejected: "text-red-600 bg-red-50 border-red-200",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded border ${STATUS_COLORS[status] ?? "text-gray-500 bg-gray-50 border-gray-200"}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default function CreditsPage() {
  const { id } = useParams<{ id: string }>();
  const userKey = getUserKey();

  const [credits, setCredits] = useState<WorkspaceCreditsResponse | null>(null);
  const [creditsPhase, setCreditsPhase] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [creditsError, setCreditsError] = useState("");

  const [requests, setRequests] = useState<TopUpRequest[]>([]);
  const [requestsPhase, setRequestsPhase] = useState<"idle" | "loading" | "done" | "error">("idle");

  // Top-up form state
  const [formAmount, setFormAmount] = useState(10);
  const [formNote, setFormNote] = useState("");
  const [submitPhase, setSubmitPhase] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [submitError, setSubmitError] = useState("");

  const loadCredits = useCallback(async () => {
    if (!userKey) return;
    setCreditsPhase("loading");
    try {
      const data = await fetchWorkspaceCredits(userKey);
      setCredits(data);
      setCreditsPhase("done");
    } catch (e) {
      setCreditsError(e instanceof Error ? e.message : "알 수 없는 오류");
      setCreditsPhase("error");
    }
  }, [userKey]);

  const loadRequests = useCallback(async () => {
    if (!userKey) return;
    setRequestsPhase("loading");
    try {
      const data = await fetchTopUpRequests(userKey);
      setRequests(data);
      setRequestsPhase("done");
    } catch {
      setRequestsPhase("error");
    }
  }, [userKey]);

  useEffect(() => {
    loadCredits();
    loadRequests();
  }, [loadCredits, loadRequests]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userKey) return;
    setSubmitPhase("submitting");
    setSubmitError("");
    try {
      await createTopUpRequest({
        userKey,
        creditType: "review" as CreditType,
        requestedAmount: formAmount,
        note: formNote.trim() || undefined,
      });
      setSubmitPhase("done");
      setFormAmount(10);
      setFormNote("");
      // Reload both
      await Promise.all([loadCredits(), loadRequests()]);
      setSubmitPhase("idle");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "요청 실패");
      setSubmitPhase("error");
    }
  };

  const reviewBalance = credits?.balances.find((b) => b.creditType === "review")?.balance ?? 0;
  const allowance = credits?.allowance.review;
  const openRequests = requests.filter((r) => r.status === "requested").length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Back link */}
      <div className="flex items-center gap-2">
        <Link href={`/projects/${id}/github`} className="text-sm text-blue-600 hover:underline">
          ← PR 확인으로 돌아가기
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900">Credit</h1>
      <p className="text-sm text-gray-500">
        Review credit 잔액과 이번 달 무료 제공량을 확인하고, 충전 요청을 보낼 수 있어요.
        현재는 관리자가 확인 후 수동으로 지급합니다.
      </p>

      {/* Balance section */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-700 text-sm">Credit 잔액</h2>
        </div>
        <div className="p-5">
          {creditsPhase === "loading" && (
            <p className="text-sm text-gray-400">불러오는 중…</p>
          )}
          {creditsPhase === "error" && (
            <p className="text-sm text-red-500">{creditsError}</p>
          )}
          {creditsPhase === "done" && credits && (
            <div className="space-y-4">
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-blue-700">{reviewBalance}</span>
                <span className="text-sm text-gray-500">Review credit</span>
              </div>

              {allowance && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>이번 달 무료 제공량</span>
                    <span className="font-medium">
                      {allowance.usedThisPeriod} / {allowance.includedRuns}회 사용
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (allowance.usedThisPeriod / allowance.includedRuns) * 100)}%` }}
                    />
                  </div>
                  <p className="text-gray-500">
                    {allowance.remainingIncludedRuns > 0
                      ? `남은 무료 횟수: ${allowance.remainingIncludedRuns}회 (${allowance.periodKey})`
                      : `이번 달 무료 제공량 모두 사용 (${allowance.periodKey})`}
                  </p>
                </div>
              )}

              {credits.actualDebitsEnabled && (
                <p className="text-xs text-blue-600">
                  {credits.actualDebitAllowedForUser
                    ? "현재 계정은 실제 credit 차감 대상입니다."
                    : "현재 계정은 dry-run 모드로 동작합니다. 실제 차감이 없어요."}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Top-up request form */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-700 text-sm">Credit 충전 요청</h2>
        </div>
        <div className="p-5">
          {reviewBalance === 0 && creditsPhase === "done" && (
            <div className="mb-4 border border-amber-200 bg-amber-50 rounded-lg px-4 py-3">
              <p className="text-sm text-amber-700 font-medium">Credit이 부족해요</p>
              <p className="text-xs text-amber-600 mt-0.5">
                무료 제공량을 모두 사용하셨거나 잔액이 없습니다. 충전 요청을 보내주세요.
              </p>
            </div>
          )}

          {openRequests >= 3 ? (
            <div className="border border-blue-200 bg-blue-50 rounded-lg px-4 py-3">
              <p className="text-sm text-blue-700">
                이미 {openRequests}개의 충전 요청이 처리 대기 중이에요. 완료 후 새 요청을 보낼 수 있어요.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  요청 금액 (1–100 Review credit)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={formAmount}
                    onChange={(e) => setFormAmount(Number(e.target.value))}
                    className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                  <span className="text-sm text-gray-500">Review credit</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  메모 (선택)
                </label>
                <textarea
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  rows={2}
                  placeholder="용도나 요청 배경을 적어주세요 (선택사항)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                  maxLength={300}
                />
              </div>

              {submitPhase === "error" && (
                <p className="text-sm text-red-500">{submitError}</p>
              )}

              <button
                type="submit"
                disabled={submitPhase === "submitting"}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {submitPhase === "submitting" ? "요청 중…" : "충전 요청 보내기"}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Request history */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-700 text-sm">최근 충전 요청 현황</h2>
          <button
            onClick={loadRequests}
            className="text-xs text-blue-600 hover:underline"
          >
            새로고침
          </button>
        </div>
        <div className="p-5">
          {requestsPhase === "loading" && (
            <p className="text-sm text-gray-400">불러오는 중…</p>
          )}
          {requestsPhase === "done" && requests.length === 0 && (
            <p className="text-sm text-gray-400">충전 요청 내역이 없어요.</p>
          )}
          {requestsPhase === "done" && requests.length > 0 && (
            <div className="space-y-3">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="border border-gray-100 rounded-lg px-4 py-3 bg-white"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-blue-700">
                        +{req.requestedAmount}
                      </span>
                      <span className="text-xs text-gray-500">Review credit</span>
                    </div>
                    <StatusBadge status={req.status} />
                  </div>
                  {req.note && (
                    <p className="text-xs text-gray-500 mt-1">{req.note}</p>
                  )}
                  {req.adminNote && (
                    <p className="text-xs text-blue-600 mt-1">관리자 메모: {req.adminNote}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {req.createdAt.slice(0, 10)}
                    {req.resolvedAt && ` → ${req.resolvedAt.slice(0, 10)} 처리`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-xs text-gray-400 text-center">
        Credit 충전 요청 후 관리자가 확인하면 지급됩니다.
        현재는 결제 없이 관리자가 수동으로 처리합니다.
      </p>
    </div>
  );
}

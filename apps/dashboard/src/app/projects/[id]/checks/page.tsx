"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProject } from "@/lib/mock-data";
import {
  getLocalProject,
  loadExtendedProjectData,
  saveExtendedProjectData,
  getUserKey,
} from "@/lib/workflow-store";
import {
  callCheckDraftApi,
  type CheckDraftResponse,
  type CheckResultItem,
} from "@/lib/workspace-check-api";
import {
  getLatestPRReview,
  fetchLinkedPulls,
  type ReviewRun,
  type LinkedPull,
} from "@/lib/workspace-github-api";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import type { ItemStatus } from "@/lib/labels";

export default function ChecksPage() {
  const { id } = useParams<{ id: string }>();
  const project = getLocalProject(id) ?? getProject(id);
  const userKey = getUserKey();

  // ── Spec check state ──────────────────────────────────────────────────────
  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [results, setResults] = useState<CheckDraftResponse | null>(null);
  const [rateLimitMsg, setRateLimitMsg] = useState<string | null>(null);

  // ── PR code check state ───────────────────────────────────────────────────
  const [linkedPulls, setLinkedPulls] = useState<LinkedPull[]>([]);
  const [prReviews, setPrReviews] = useState<Record<number, ReviewRun>>({});
  const [prLoadPhase, setPrLoadPhase] = useState<"idle" | "loading" | "done">("idle");

  useEffect(() => {
    const ext = loadExtendedProjectData(id);
    if (ext?.checkResults) {
      setResults(ext.checkResults);
      setPhase("done");
    }
  }, [id]);

  // Load linked PRs and their latest review runs
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setPrLoadPhase("loading");
      const linkedRes = await fetchLinkedPulls(id);
      if (cancelled) return;
      if (!linkedRes.ok) { setPrLoadPhase("done"); return; }
      setLinkedPulls(linkedRes.pulls);
      const reviews: Record<number, ReviewRun> = {};
      await Promise.all(
        linkedRes.pulls.map(async (lp) => {
          const r = await getLatestPRReview(id, lp.number);
          if (!cancelled && r.ok && r.run) reviews[lp.number] = r.run;
        }),
      );
      if (!cancelled) {
        setPrReviews(reviews);
        setPrLoadPhase("done");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  const runCheck = useCallback(async () => {
    if (!project) return;
    setPhase("loading");
    setRateLimitMsg(null);

    const ext = loadExtendedProjectData(id);
    const productSpec = ext?.productSpec ?? {
      productName: project.name,
      oneLine: project.description,
      targetUsers: [] as string[],
      problem: project.spec.goal,
      included: project.spec.included,
      excluded: project.spec.excluded,
      userFlow: [] as string[],
      decisions: [] as string[],
      openQuestions: project.spec.openDecisions,
    };
    const items = project.requirements.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      criteria: ext?.itemCriteria?.[r.id] ?? [],
    }));

    const res = await callCheckDraftApi({ projectId: id, productSpec, items });
    if (!res.ok) {
      if (res.error === "rate_limited") {
        setRateLimitMsg(res.message);
        setPhase(results ? "done" : "idle");
      } else {
        setPhase("error");
      }
      return;
    }
    setResults(res);
    setPhase("done");
    saveExtendedProjectData(id, { checkResults: res });
  }, [id, project, results]);

  if (!project) return <p className="text-sm text-gray-400">프로젝트를 찾을 수 없습니다.</p>;

  const needsAction = results
    ? results.summary.failed + results.summary.inconclusive + results.summary.needsDecision
    : 0;

  // Latest PR review with actual results
  const latestPrReview = Object.values(prReviews).find((r) => r.results?.length);
  const prNeedsAction = latestPrReview?.summary
    ? (latestPrReview.summary.failed ?? 0) + (latestPrReview.summary.inconclusive ?? 0)
    : 0;

  // Find the linked PR for the latest review
  const reviewedPR = latestPrReview
    ? linkedPulls.find((lp) => lp.number === latestPrReview.prNumber)
    : undefined;

  return (
    <div className="max-w-3xl space-y-10">

      {/* ─── Section 1: 제품 설명서 기준 사전 확인 ─── */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="text-lg font-bold text-gray-900">제품 설명서 기준 사전 확인</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              제품 설명서와 꼭 들어가야 할 항목만 보고 빠진 결정이나 불명확한 기준을 확인합니다.
            </p>
          </div>
          {phase === "done" && (
            <button
              onClick={runCheck}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex-shrink-0"
            >
              다시 확인
            </button>
          )}
        </div>

        {phase === "loading" && (
          <div className="flex items-center gap-2.5 my-4 text-sm text-gray-400">
            <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin flex-shrink-0" />
            항목을 확인하는 중입니다...
          </div>
        )}

        {rateLimitMsg && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-4">
            {rateLimitMsg}
          </div>
        )}
        {phase === "error" && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4 flex items-center justify-between">
            <span>확인 중 오류가 발생했습니다.</span>
            <button onClick={runCheck} className="text-xs text-red-600 underline ml-4">다시 시도</button>
          </div>
        )}

        {results && (
          <>
            <p className="text-sm text-gray-500 my-4">
              {results.results.length}개 항목 확인 완료
              {results.source === "mock-fallback" && (
                <span className="ml-2 text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2 py-0.5">임시 결과</span>
              )}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <StatCard label="통과" value={results.summary.passed} colorClass="text-green-600" />
              <StatCard label="안 맞음" value={results.summary.failed} colorClass="text-red-600" />
              <StatCard label="확인 부족" value={results.summary.inconclusive} colorClass="text-amber-600" />
              <StatCard label="결정 필요" value={results.summary.needsDecision} colorClass="text-violet-600" />
            </div>
          </>
        )}

        {phase === "idle" && !results && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-sm font-medium text-gray-700 mb-1">제품 설명서 & 항목 검토</p>
            <p className="text-xs text-gray-400 mb-5">
              각 항목이 제품 설명서와 일치하는지, 완성 기준이 명확한지 확인합니다.
            </p>
            <button
              onClick={runCheck}
              className="bg-indigo-600 text-white text-sm font-medium px-6 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors"
            >
              확인 실행
            </button>
          </div>
        )}

        {results && (
          <div className="space-y-3">
            {results.results.map((r) => (
              <CheckResultCard key={r.itemId} result={r} />
            ))}
          </div>
        )}

        {results && needsAction > 0 && (
          <div className="mt-5 bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4 flex items-center justify-between">
            <p className="text-sm text-indigo-800">{needsAction}개 항목에 조치가 필요합니다.</p>
            <Link href={`/projects/${id}/fixes`} className="text-sm text-indigo-600 font-medium hover:text-indigo-800">
              고쳐야 할 것 보기 →
            </Link>
          </div>
        )}
        {results && needsAction === 0 && (
          <div className="mt-5 bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center justify-between">
            <p className="text-sm text-green-700 font-medium">모든 항목이 통과됐습니다!</p>
            <Link href={`/projects/${id}/export`} className="text-sm text-green-700 font-medium hover:text-green-900">
              개발 AI에게 넘길 패키지 만들기 →
            </Link>
          </div>
        )}
      </section>

      {/* ─── Section 2: GitHub PR 코드 확인 ─── */}
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-bold text-gray-900">GitHub PR 코드 확인</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            연결된 GitHub PR의 변경 내용을 기준으로, 선택한 항목이 실제 코드에 반영됐는지 확인합니다.
          </p>
        </div>

        {prLoadPhase === "loading" && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin flex-shrink-0" />
            PR 확인 결과를 불러오는 중...
          </div>
        )}

        {prLoadPhase === "done" && !latestPrReview && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-600 mb-1">아직 GitHub PR 코드 확인 결과가 없어요.</p>
            <p className="text-xs text-gray-400 mb-4">
              저장소와 PR을 연결한 뒤 확인을 실행할 수 있습니다.
            </p>
            <Link
              href={`/projects/${id}/github`}
              className="inline-block bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-gray-800 transition-colors"
            >
              PR 연결 및 코드 확인 →
            </Link>
          </div>
        )}

        {prLoadPhase === "done" && latestPrReview && (
          <div className="space-y-4">
            {/* PR info */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1">
                  <p className="text-xs text-gray-400 mb-0.5">확인된 PR</p>
                  <p className="text-sm font-medium text-gray-800">
                    {reviewedPR ? `#${reviewedPR.number} ${reviewedPR.title}` : `PR #${latestPrReview.prNumber}`}
                  </p>
                  {latestPrReview.repoFullName && (
                    <p className="text-xs text-gray-400 mt-0.5">{latestPrReview.repoFullName}</p>
                  )}
                </div>
                <PRReviewStatusBadge status={latestPrReview.status} />
              </div>

              {latestPrReview.summary && (
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <StatCard label="통과" value={latestPrReview.summary.passed} colorClass="text-green-600" />
                  <StatCard label="안 맞음" value={latestPrReview.summary.failed} colorClass="text-red-600" />
                  <StatCard label="확인 부족" value={latestPrReview.summary.inconclusive} colorClass="text-amber-600" />
                  <StatCard label="결정 필요" value={latestPrReview.summary.needsDecision ?? 0} colorClass="text-violet-600" />
                </div>
              )}

              <p className="text-xs text-gray-400">
                이 결과는 연결된 PR의 변경 내용 기준입니다. 전체 저장소나 배포된 서비스 전체를 확인한 것은 아니에요.
              </p>
            </div>

            {/* Per-item results (compact) */}
            {latestPrReview.results && latestPrReview.results.length > 0 && (
              <div className="space-y-2">
                {latestPrReview.results.map((r) => (
                  <div key={r.itemId} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-start gap-3">
                    <span className={`text-xs font-medium border rounded-full px-2 py-0.5 flex-shrink-0 mt-0.5 ${
                      r.status === "passed" ? "text-green-700 bg-green-50 border-green-200" :
                      r.status === "failed" ? "text-red-700 bg-red-50 border-red-200" :
                      r.status === "inconclusive" ? "text-yellow-700 bg-yellow-50 border-yellow-200" :
                      "text-purple-700 bg-purple-50 border-purple-200"
                    }`}>{r.userLabel}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{r.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{r.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* CTA */}
            <div className="flex items-center gap-3">
              {prNeedsAction > 0 && (
                <Link
                  href={`/projects/${id}/github`}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                >
                  수정 지시서 만들기 →
                </Link>
              )}
              <Link
                href={`/projects/${id}/github`}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                PR 확인 화면으로 →
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CheckResultCard({ result }: { result: CheckResultItem }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-sm font-medium text-gray-800">{result.title}</p>
        <StatusBadge status={result.status as ItemStatus} />
      </div>
      <p className="text-xs text-gray-600 leading-relaxed mb-2">{result.reason}</p>
      {result.evidence.length > 0 && (
        <div className="bg-gray-50 rounded-lg px-3 py-2 mb-2">
          <p className="text-xs font-medium text-gray-500 mb-1">확인 근거</p>
          <ul className="space-y-0.5">
            {result.evidence.map((e, i) => (
              <li key={i} className="text-xs text-gray-500 flex gap-1.5">
                <span className="text-gray-300 mt-px">-</span> {e}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.status !== "passed" && result.nextAction && (
        <p className="text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2">
          <span className="font-medium">다음 단계:</span> {result.nextAction}
        </p>
      )}
    </div>
  );
}

function PRReviewStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    passed: { label: "통과", className: "text-green-700 bg-green-50 border-green-200" },
    failed: { label: "안 맞음", className: "text-red-700 bg-red-50 border-red-200" },
    inconclusive: { label: "확인 부족", className: "text-yellow-700 bg-yellow-50 border-yellow-200" },
    error: { label: "확인 실패", className: "text-gray-600 bg-gray-50 border-gray-200" },
    running: { label: "확인 중", className: "text-blue-700 bg-blue-50 border-blue-200" },
    queued: { label: "대기 중", className: "text-gray-600 bg-gray-50 border-gray-200" },
  };
  const c = config[status] ?? { label: status, className: "text-gray-600 bg-gray-50 border-gray-200" };
  return (
    <span className={`text-xs font-medium border rounded-full px-2.5 py-0.5 flex-shrink-0 ${c.className}`}>
      {c.label}
    </span>
  );
}

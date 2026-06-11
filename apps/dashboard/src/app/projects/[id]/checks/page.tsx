"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProject } from "@/lib/mock-data";
import {
  getLocalProject,
  loadExtendedProjectData,
  saveExtendedProjectData,
} from "@/lib/workflow-store";
import {
  callCheckDraftApi,
  type CheckDraftResponse,
  type CheckResultItem,
} from "@/lib/workspace-check-api";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import type { ItemStatus } from "@/lib/labels";

export default function ChecksPage() {
  const { id } = useParams<{ id: string }>();
  const project = getLocalProject(id) ?? getProject(id);

  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [results, setResults] = useState<CheckDraftResponse | null>(null);
  const [rateLimitMsg, setRateLimitMsg] = useState<string | null>(null);

  useEffect(() => {
    const ext = loadExtendedProjectData(id);
    if (ext?.checkResults) {
      setResults(ext.checkResults);
      setPhase("done");
    }
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

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-gray-900">확인 결과</h1>
        {phase === "done" && (
          <button
            onClick={runCheck}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            다시 확인
          </button>
        )}
      </div>

      {/* Loading indicator (shown above existing results during recheck too) */}
      {phase === "loading" && (
        <div className="flex items-center gap-2.5 mb-5 text-sm text-gray-400">
          <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin flex-shrink-0" />
          항목을 확인하는 중입니다...
        </div>
      )}

      {/* Rate limit / error banners */}
      {rateLimitMsg && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-4">
          {rateLimitMsg}
        </div>
      )}
      {phase === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4 flex items-center justify-between">
          <span>확인 중 오류가 발생했습니다.</span>
          <button onClick={runCheck} className="text-xs text-red-600 underline ml-4">
            다시 시도
          </button>
        </div>
      )}

      {/* Summary stats */}
      {results && (
        <>
          <p className="text-sm text-gray-500 mb-6">
            {results.results.length}개 항목 확인 완료
            {results.source === "mock-fallback" && (
              <span className="ml-2 text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2 py-0.5">
                임시 결과
              </span>
            )}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <StatCard label="통과" value={results.summary.passed} colorClass="text-green-600" />
            <StatCard label="안 맞음" value={results.summary.failed} colorClass="text-red-600" />
            <StatCard label="확인 부족" value={results.summary.inconclusive} colorClass="text-amber-600" />
            <StatCard label="결정 필요" value={results.summary.needsDecision} colorClass="text-violet-600" />
          </div>
        </>
      )}

      {/* Empty state — no results yet */}
      {phase === "idle" && !results && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center mb-6">
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

      {/* Result cards */}
      {results && (
        <div className="space-y-3">
          {results.results.map((r) => (
            <CheckResultCard key={r.itemId} result={r} />
          ))}
        </div>
      )}

      {/* CTA to fixes */}
      {results && needsAction > 0 && (
        <div className="mt-6 bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4 flex items-center justify-between">
          <p className="text-sm text-indigo-800">
            {needsAction}개 항목에 조치가 필요합니다.
          </p>
          <Link
            href={`/projects/${id}/fixes`}
            className="text-sm text-indigo-600 font-medium hover:text-indigo-800"
          >
            고쳐야 할 것 보기 →
          </Link>
        </div>
      )}
      {results && needsAction === 0 && (
        <div className="mt-6 bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center justify-between">
          <p className="text-sm text-green-700 font-medium">모든 항목이 통과됐습니다!</p>
          <Link href={`/projects/${id}/export`} className="text-sm text-green-700 font-medium hover:text-green-900">
            개발 AI에게 넘길 패키지 만들기 →
          </Link>
        </div>
      )}
    </div>
  );
}

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

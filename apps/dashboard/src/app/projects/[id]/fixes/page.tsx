"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProject } from "@/lib/mock-data";
import {
  getLocalProject,
  loadExtendedProjectData,
  saveExtendedProjectData,
} from "@/lib/workflow-store";
import {
  callFixSuggestionApi,
  type CheckResultItem,
  type FixSuggestionResponse,
} from "@/lib/workspace-check-api";
import { StatusBadge } from "@/components/StatusBadge";
import type { ItemStatus } from "@/lib/labels";

type FixState = {
  phase: "idle" | "loading" | "done" | "error";
  result?: FixSuggestionResponse;
  expanded: boolean;
};

export default function FixesPage() {
  const { id } = useParams<{ id: string }>();
  const project = getLocalProject(id) ?? getProject(id);

  const [checkItems, setCheckItems] = useState<CheckResultItem[] | null>(null);
  const [fixStates, setFixStates] = useState<Record<string, FixState>>({});

  useEffect(() => {
    const ext = loadExtendedProjectData(id);
    if (ext?.checkResults) setCheckItems(ext.checkResults.results);
    if (ext?.fixSuggestions) {
      const initial: Record<string, FixState> = {};
      for (const [itemId, res] of Object.entries(ext.fixSuggestions)) {
        initial[itemId] = { phase: "done", result: res, expanded: false };
      }
      setFixStates(initial);
    }
  }, [id]);

  async function requestFix(item: CheckResultItem) {
    if (!project) return;
    setFixStates((prev) => ({ ...prev, [item.itemId]: { phase: "loading", expanded: false } }));

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

    const res = await callFixSuggestionApi({
      projectId: id,
      item: {
        id: item.itemId,
        title: item.title,
        status: item.status,
        criteria: ext?.itemCriteria?.[item.itemId] ?? [],
      },
      checkResult: { reason: item.reason, evidence: item.evidence, nextAction: item.nextAction },
      productSpec,
    });

    if (!res.ok) {
      setFixStates((prev) => ({ ...prev, [item.itemId]: { phase: "error", expanded: false } }));
      return;
    }

    setFixStates((prev) => ({ ...prev, [item.itemId]: { phase: "done", result: res, expanded: true } }));

    const currentExt = loadExtendedProjectData(id) ?? {};
    saveExtendedProjectData(id, {
      fixSuggestions: { ...(currentExt.fixSuggestions ?? {}), [item.itemId]: res },
    });
  }

  function toggleExpanded(itemId: string) {
    setFixStates((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId]!, expanded: !prev[itemId]?.expanded },
    }));
  }

  if (!project) return <p className="text-sm text-gray-400">프로젝트를 찾을 수 없습니다.</p>;

  if (!checkItems) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-xl font-bold text-gray-900 mb-8">고쳐야 할 것</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500 mb-4">먼저 확인 탭에서 항목을 검토해주세요.</p>
          <Link
            href={`/projects/${id}/checks`}
            className="inline-block bg-indigo-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            확인 실행하러 가기
          </Link>
        </div>
      </div>
    );
  }

  const needsFix = checkItems.filter(
    (r) => r.status === "failed" || r.status === "inconclusive" || r.status === "needs_decision",
  );

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-gray-900 mb-1">고쳐야 할 것</h1>
      <p className="text-sm text-gray-500 mb-8">
        {needsFix.length}개 항목에 조치가 필요합니다.
      </p>

      {needsFix.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <p className="text-green-700 font-medium">모든 항목이 통과됐습니다!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {needsFix.map((item) => (
            <FixItemCard
              key={item.itemId}
              item={item}
              fixState={fixStates[item.itemId]}
              onFix={() => requestFix(item)}
              onToggle={() => toggleExpanded(item.itemId)}
            />
          ))}
        </div>
      )}

      <div className="mt-6 bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4 flex items-center justify-between">
        <p className="text-sm text-indigo-800">
          수정 제안까지 완료됐나요? 개발 AI에게 넘길 패키지를 만들 수 있습니다.
        </p>
        <Link
          href={`/projects/${id}/export`}
          className="text-sm text-indigo-600 font-medium hover:text-indigo-800 flex-shrink-0"
        >
          개발 AI에게 넘길 패키지 만들기 →
        </Link>
      </div>
    </div>
  );
}

function FixItemCard({
  item,
  fixState,
  onFix,
  onToggle,
}: {
  item: CheckResultItem;
  fixState?: FixState;
  onFix: () => void;
  onToggle: () => void;
}) {
  const isLoading = fixState?.phase === "loading";
  const isDone = fixState?.phase === "done";
  const isExpanded = fixState?.expanded ?? false;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <p className="text-sm font-medium text-gray-800">{item.title}</p>
          <StatusBadge status={item.status as ItemStatus} />
        </div>
        <p className="text-xs text-gray-500 leading-relaxed mb-3">{item.reason}</p>

        <div className="flex items-center gap-2 flex-wrap">
          {!isDone && (
            <button
              onClick={onFix}
              disabled={isLoading}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isLoading
                ? "분석 중..."
                : item.status === "needs_decision"
                ? "결정 도움받기"
                : "고쳐보기"}
            </button>
          )}
          {isDone && (
            <button
              onClick={onToggle}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
            >
              {isExpanded ? "결과 접기" : "결과 펼치기"}
            </button>
          )}
          {isDone && (
            <button
              onClick={onFix}
              className="text-xs px-3 py-1.5 rounded-lg font-medium text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              다시 분석
            </button>
          )}
          {fixState?.phase === "error" && (
            <button
              onClick={onFix}
              className="text-xs px-3 py-1.5 rounded-lg font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
            >
              다시 시도
            </button>
          )}
        </div>
      </div>

      {isDone && isExpanded && fixState?.result && (
        <FixSuggestionPanel suggestion={fixState.result} />
      )}
    </div>
  );
}

function FixSuggestionPanel({ suggestion }: { suggestion: FixSuggestionResponse }) {
  const { plainSummary, builderBrief } = suggestion.suggestion;

  return (
    <div className="border-t border-gray-100 bg-gray-50 p-5 space-y-4">
      {suggestion.source === "mock-fallback" && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
          임시 제안입니다. 서비스 복구 후 더 정밀한 분석이 제공됩니다.
        </p>
      )}

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">요약</p>
        <p className="text-sm text-gray-700 leading-relaxed">{plainSummary}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div>
          <p className="text-sm font-semibold text-gray-800">{builderBrief.title}</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{builderBrief.goal}</p>
        </div>

        {builderBrief.tasks.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              해야 할 작업
            </p>
            <ul className="space-y-1">
              {builderBrief.tasks.map((t, i) => (
                <li key={i} className="flex gap-2 text-xs text-gray-700">
                  <span className="text-indigo-400 mt-px flex-shrink-0">•</span> {t}
                </li>
              ))}
            </ul>
          </div>
        )}

        {builderBrief.doneWhen.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              완료 기준
            </p>
            <ul className="space-y-1">
              {builderBrief.doneWhen.map((d, i) => (
                <li key={i} className="flex gap-2 text-xs text-gray-700">
                  <span className="text-green-500 mt-px flex-shrink-0">✓</span> {d}
                </li>
              ))}
            </ul>
          </div>
        )}

        {builderBrief.doNotDo.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              하지 말아야 할 것
            </p>
            <ul className="space-y-1">
              {builderBrief.doNotDo.map((d, i) => (
                <li key={i} className="flex gap-2 text-xs text-gray-500">
                  <span className="text-red-400 mt-px flex-shrink-0">✗</span> {d}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

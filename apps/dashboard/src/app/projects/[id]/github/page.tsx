"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProject } from "@/lib/mock-data";
import { getLocalProject, loadExtendedProjectData, getUserKey } from "@/lib/workflow-store";
import {
  fetchProjectRepo,
  fetchProjectPulls,
  fetchLinkedPulls,
  linkPullRequest,
  type GitHubPull,
  type LinkedPull,
  type LinkedRepo,
} from "@/lib/workspace-github-api";
import { StatusBadge } from "@/components/StatusBadge";
import type { ItemStatus } from "@/lib/labels";

export default function GitHubPage() {
  const { id } = useParams<{ id: string }>();
  const project = getLocalProject(id) ?? getProject(id);
  const userKey = getUserKey();

  const [loadPhase, setLoadPhase] = useState<"loading" | "no_repo" | "ready">("loading");
  const [repo, setRepo] = useState<LinkedRepo | null>(null);
  const [pulls, setPulls] = useState<GitHubPull[]>([]);
  const [pullsPhase, setPullsPhase] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [pullsError, setPullsError] = useState("");
  const [linkedPulls, setLinkedPulls] = useState<LinkedPull[]>([]);
  const [selectedPR, setSelectedPR] = useState<GitHubPull | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [linkPhase, setLinkPhase] = useState<"idle" | "saving" | "done" | "error">("idle");

  const ext = loadExtendedProjectData(id);
  const checkResultMap = new Map(
    (ext?.checkResults?.results ?? []).map((r) => [r.itemId, r.status as ItemStatus]),
  );
  const allItems = (project?.requirements ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    checkStatus: checkResultMap.get(r.id) ?? (r.status as ItemStatus),
  }));

  const loadInitial = useCallback(async () => {
    setLoadPhase("loading");
    const [repoRes, linkedRes] = await Promise.all([
      fetchProjectRepo(id),
      fetchLinkedPulls(id),
    ]);
    if (repoRes.ok && repoRes.repo) {
      setRepo(repoRes.repo);
      setLoadPhase("ready");
    } else {
      setLoadPhase("no_repo");
    }
    if (linkedRes.ok) setLinkedPulls(linkedRes.pulls);
  }, [id]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  async function handleLoadPulls() {
    if (!repo) return;
    setPullsPhase("loading");
    setPullsError("");
    const res = await fetchProjectPulls(id, userKey);
    if (res.ok) {
      setPulls(res.pulls);
      setPullsPhase("done");
    } else {
      setPullsError(res.error);
      setPullsPhase("error");
    }
  }

  function selectPR(pull: GitHubPull) {
    setSelectedPR(pull);
    setSelectedItemIds(new Set());
    setLinkPhase("idle");
  }

  function toggleItem(itemId: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }

  async function handleLink() {
    if (!selectedPR || selectedItemIds.size === 0) return;
    setLinkPhase("saving");
    const res = await linkPullRequest(id, selectedPR.number, {
      userKey,
      pullRequest: {
        number: selectedPR.number,
        title: selectedPR.title,
        state: selectedPR.state,
        htmlUrl: selectedPR.htmlUrl,
        headBranch: selectedPR.headBranch,
        baseBranch: selectedPR.baseBranch,
      },
      selectedItemIds: Array.from(selectedItemIds),
    });
    if (res.ok) {
      setLinkedPulls((prev) => {
        const filtered = prev.filter((p) => p.number !== res.pull.number);
        return [res.pull, ...filtered];
      });
      setLinkPhase("done");
      setSelectedPR(null);
      setSelectedItemIds(new Set());
    } else {
      setLinkPhase("error");
    }
  }

  if (!project) return <p className="text-sm text-gray-400">프로젝트를 찾을 수 없습니다.</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">PR 연결</h1>
        <p className="text-sm text-gray-500">
          연결된 저장소의 Pull Request를 선택하고, 관련 항목과 연결합니다.
        </p>
      </div>

      {/* Stage note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
        이 단계에서는 PR을 선택하고 관련 항목만 연결합니다. 아직 코드를 확인하거나 리뷰를 실행하지는 않아요.
      </div>

      {/* Loading */}
      {loadPhase === "loading" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-400">연결 상태를 확인하는 중...</p>
        </div>
      )}

      {/* No repo */}
      {loadPhase === "no_repo" && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-600 mb-4">먼저 GitHub 저장소를 연결해주세요.</p>
          <Link
            href={`/projects/${id}/settings`}
            className="inline-block bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-gray-800 transition-colors"
          >
            저장소 연결하러 가기
          </Link>
        </div>
      )}

      {/* Ready */}
      {loadPhase === "ready" && repo && (
        <>
          {/* Repo info */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">연결된 저장소</p>
              <a
                href={repo.htmlUrl ?? `https://github.com/${repo.fullName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-indigo-600 hover:underline"
              >
                {repo.fullName}
              </a>
              {repo.defaultBranch && <span className="text-xs text-gray-400 ml-2">→ {repo.defaultBranch}</span>}
            </div>
            <button
              onClick={handleLoadPulls}
              disabled={pullsPhase === "loading"}
              className="text-sm px-4 py-2 rounded-lg font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {pullsPhase === "loading" ? "불러오는 중..." : "PR 목록 불러오기"}
            </button>
          </div>

          {/* PR list */}
          {pullsPhase === "error" && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              PR 목록을 불러오지 못했습니다: {pullsError.includes("not_connected") ? "GitHub 계정을 먼저 연결해주세요." : pullsError}
            </div>
          )}

          {pullsPhase === "done" && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <p className="text-sm font-semibold text-gray-700 px-5 py-4 border-b border-gray-100">
                열려 있는 PR {pulls.length}개
              </p>
              {pulls.length === 0 ? (
                <p className="text-sm text-gray-500 px-5 py-6 text-center">
                  열려 있는 PR이 없어요. GitHub에서 PR을 만든 뒤 다시 확인해주세요.
                </p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {pulls.map((pull) => (
                    <button
                      key={pull.number}
                      onClick={() => selectPR(pull)}
                      className={`w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors ${selectedPR?.number === pull.number ? "bg-indigo-50 border-l-2 border-indigo-500" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xs text-gray-400 font-mono mt-0.5 flex-shrink-0">#{pull.number}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{pull.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {pull.headBranch} → {pull.baseBranch}
                            {pull.updatedAt && ` · ${new Date(pull.updatedAt).toLocaleDateString("ko-KR")}`}
                          </p>
                        </div>
                        <span className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 flex-shrink-0">open</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Item selection for selected PR */}
          {selectedPR && (
            <div className="bg-white rounded-xl border border-indigo-200 p-5">
              <p className="text-sm font-semibold text-gray-800 mb-1">
                PR #{selectedPR.number}: {selectedPR.title}
              </p>
              <p className="text-xs text-gray-400 mb-4">
                이 PR과 관련된 항목을 선택하세요. ({selectedItemIds.size}개 선택됨)
              </p>
              <div className="space-y-1 max-h-56 overflow-y-auto mb-4">
                {allItems.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedItemIds.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="w-4 h-4 rounded accent-indigo-600 cursor-pointer flex-shrink-0"
                    />
                    <span className="flex-1 text-sm text-gray-700">{item.title}</span>
                    <StatusBadge status={item.checkStatus} />
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleLink}
                  disabled={selectedItemIds.size === 0 || linkPhase === "saving"}
                  className="text-sm px-4 py-2 rounded-xl font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                >
                  {linkPhase === "saving" ? "저장 중..." : "연결 저장"}
                </button>
                <button
                  onClick={() => { setSelectedPR(null); setSelectedItemIds(new Set()); }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  취소
                </button>
                {linkPhase === "done" && <span className="text-sm text-green-600">✓ 연결됐어요.</span>}
                {linkPhase === "error" && <span className="text-sm text-red-500">저장 실패. 다시 시도해주세요.</span>}
              </div>
            </div>
          )}

          {/* Linked PRs list */}
          {linkedPulls.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200">
              <p className="text-sm font-semibold text-gray-700 px-5 py-4 border-b border-gray-100">
                연결된 PR {linkedPulls.length}개
              </p>
              <div className="divide-y divide-gray-50">
                {linkedPulls.map((lp) => (
                  <div key={lp.id} className="px-5 py-4">
                    <div className="flex items-start gap-3 mb-2">
                      <span className="text-xs text-gray-400 font-mono mt-0.5">#{lp.number}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{lp.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{lp.repoFullName}</p>
                      </div>
                      <span className={`text-xs rounded-full px-2 py-0.5 flex-shrink-0 ${lp.state === "open" ? "text-green-600 bg-green-50 border border-green-200" : "text-gray-500 bg-gray-100 border border-gray-200"}`}>
                        {lp.state}
                      </span>
                    </div>
                    {lp.selectedItemIds.length > 0 && (
                      <div className="ml-6 flex flex-wrap gap-1.5">
                        {lp.selectedItemIds.map((itemId) => {
                          const item = allItems.find((i) => i.id === itemId);
                          return item ? (
                            <span key={itemId} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5 truncate max-w-[200px]">
                              {item.title}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disabled Stage 11 CTA */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">PR 확인 실행</p>
              <p className="text-xs text-gray-400">다음 단계에서 코드 확인이 가능해요. 아직 코드를 확인한 것은 아니에요.</p>
            </div>
            <button disabled className="text-sm px-4 py-2 rounded-xl font-medium bg-gray-200 text-gray-400 cursor-not-allowed">
              다음 단계에서 사용 가능
            </button>
          </div>
        </>
      )}
    </div>
  );
}

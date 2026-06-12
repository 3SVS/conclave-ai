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
  startPRReview,
  getLatestPRReview,
  type GitHubPull,
  type LinkedPull,
  type LinkedRepo,
  type ReviewRun,
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
  // Review state: keyed by prNumber
  const [reviewRuns, setReviewRuns] = useState<Record<number, ReviewRun>>({});
  const [reviewPhase, setReviewPhase] = useState<Record<number, "idle" | "running" | "done" | "error">>({});

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
    if (linkedRes.ok) {
      setLinkedPulls(linkedRes.pulls);
      // Load any existing review runs for linked PRs
      for (const lp of linkedRes.pulls) {
        const reviewRes = await getLatestPRReview(id, lp.number);
        if (reviewRes.ok && reviewRes.run) {
          setReviewRuns((prev) => ({ ...prev, [lp.number]: reviewRes.run! }));
          setReviewPhase((prev) => ({ ...prev, [lp.number]: "done" }));
        }
      }
    }
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

  async function handleStartReview(lp: LinkedPull) {
    setReviewPhase((prev) => ({ ...prev, [lp.number]: "running" }));
    const ext2 = loadExtendedProjectData(id);
    const items = (project?.requirements ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status ?? "draft",
      criteria: (r as { criteria?: string[] }).criteria ?? [],
    }));
    const productSpec = (ext2?.productSpec ?? {}) as Record<string, unknown>;

    const res = await startPRReview(id, lp.number, {
      userKey,
      selectedItemIds: lp.selectedItemIds,
      items,
      productSpec,
    });
    if (res.ok) {
      setReviewRuns((prev) => ({ ...prev, [lp.number]: res.run }));
      setReviewPhase((prev) => ({ ...prev, [lp.number]: "done" }));
    } else {
      setReviewPhase((prev) => ({ ...prev, [lp.number]: "error" }));
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
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
        연결된 GitHub PR의 변경 내용을 기준으로 확인합니다. 제품 설명서 기준 사전 확인과 다를 수 있어요.
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
                {linkedPulls.map((lp) => {
                  const phase = reviewPhase[lp.number] ?? "idle";
                  const run = reviewRuns[lp.number];
                  return (
                    <div key={lp.id} className="px-5 py-4 space-y-3">
                      {/* PR header */}
                      <div className="flex items-start gap-3">
                        <span className="text-xs text-gray-400 font-mono mt-0.5">#{lp.number}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{lp.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{lp.repoFullName}</p>
                        </div>
                        <span className={`text-xs rounded-full px-2 py-0.5 flex-shrink-0 ${lp.state === "open" ? "text-green-600 bg-green-50 border border-green-200" : "text-gray-500 bg-gray-100 border border-gray-200"}`}>
                          {lp.state}
                        </span>
                      </div>

                      {/* Item tags */}
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

                      {/* Review section */}
                      <div className="ml-6">
                        {phase === "idle" && (
                          <div className="space-y-2">
                            <p className="text-xs text-gray-400">
                              아직 실제 코드를 확인하지 않았어요. 버튼을 누르면 이 PR의 변경 내용을 기준으로 확인합니다.
                            </p>
                            <button
                              onClick={() => handleStartReview(lp)}
                              className="text-sm px-4 py-2 rounded-xl font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                            >
                              PR 코드 확인하기
                            </button>
                          </div>
                        )}

                        {phase === "running" && (
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <div className="w-4 h-4 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin flex-shrink-0" />
                            확인 실행 중... (PR 변경 내용을 분석하고 있어요)
                          </div>
                        )}

                        {phase === "error" && (
                          <div className="space-y-2">
                            <p className="text-xs text-red-600">확인 실패. 잠시 후 다시 시도해주세요.</p>
                            <button
                              onClick={() => handleStartReview(lp)}
                              className="text-sm px-3 py-1.5 rounded-lg font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              다시 시도
                            </button>
                          </div>
                        )}

                        {phase === "done" && run && (
                          <ReviewResultPanel run={run} onRerun={() => handleStartReview(lp)} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── ReviewResultPanel ────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  passed: "text-green-700 bg-green-50 border-green-200",
  failed: "text-red-700 bg-red-50 border-red-200",
  inconclusive: "text-yellow-700 bg-yellow-50 border-yellow-200",
  needs_decision: "text-purple-700 bg-purple-50 border-purple-200",
  error: "text-gray-600 bg-gray-50 border-gray-200",
};

const RUN_STATUS_LABEL: Record<string, string> = {
  passed: "통과",
  failed: "안 맞음",
  inconclusive: "확인 부족",
  error: "확인 실패",
  queued: "대기 중",
  running: "확인 중",
};

function ReviewResultPanel({ run, onRerun }: { run: ReviewRun; onRerun: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const statusLabel = RUN_STATUS_LABEL[run.status] ?? run.status;
  const statusColor = STATUS_COLORS[run.status] ?? "text-gray-600 bg-gray-50 border-gray-200";

  return (
    <div className="space-y-3">
      {/* Result header */}
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium border rounded-full px-2.5 py-0.5 ${statusColor}`}>
          확인 결과: {statusLabel}
        </span>
        {run.summary && (
          <span className="text-xs text-gray-400">
            통과 {run.summary.passed} · 안 맞음 {run.summary.failed} · 확인 부족 {run.summary.inconclusive}
            {run.summary.needsDecision > 0 && ` · 결정 필요 ${run.summary.needsDecision}`}
          </span>
        )}
        <button
          onClick={onRerun}
          className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline"
        >
          다시 확인
        </button>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-gray-400">
        이 결과는 연결된 PR의 변경 내용 기준입니다. 전체 저장소나 배포된 서비스 전체를 확인한 것은 아니에요.
        아직 고쳐보기는 다음 단계에서 제공됩니다.
      </p>

      {/* Error */}
      {run.status === "error" && run.errorMessage && (
        <p className="text-xs text-red-500">{run.errorMessage}</p>
      )}

      {/* Per-item results */}
      {run.results && run.results.length > 0 && (
        <div className="space-y-2">
          {run.results.map((r) => (
            <div
              key={r.itemId}
              className="border border-gray-100 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => setExpanded(expanded === r.itemId ? null : r.itemId)}
                className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-gray-50 transition-colors"
              >
                <span className={`text-xs font-medium border rounded-full px-2 py-0.5 flex-shrink-0 ${STATUS_COLORS[r.status] ?? ""}`}>
                  {r.userLabel}
                </span>
                <span className="text-sm text-gray-800 flex-1 truncate">{r.title}</span>
                <span className="text-gray-400 text-xs flex-shrink-0">{expanded === r.itemId ? "▲" : "▼"}</span>
              </button>
              {expanded === r.itemId && (
                <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2">
                  <p className="text-xs text-gray-700">{r.reason}</p>
                  {r.evidence.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">코드에서 확인된 내용</p>
                      <ul className="space-y-0.5">
                        {r.evidence.map((e, i) => (
                          <li key={i} className="text-xs text-gray-600 font-mono bg-gray-50 rounded px-2 py-0.5 truncate">
                            {e}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {r.nextAction && (
                    <p className="text-xs text-indigo-700 bg-indigo-50 rounded px-2 py-1.5">
                      다음: {r.nextAction}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

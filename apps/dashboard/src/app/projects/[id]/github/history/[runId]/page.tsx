"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProject } from "@/lib/mock-data";
import { getLocalProject, loadExtendedProjectData, getUserKey } from "@/lib/workflow-store";
import {
  getReviewRunDetail,
  generatePRFixBrief,
  previewPRComment,
  postPRComment,
  type PRReviewRunDetail,
  type ReviewResultItem,
  type FixBriefResult,
} from "@/lib/workspace-github-api";

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; badge: string }> = {
  passed:        { label: "통과",     badge: "text-green-700 bg-green-50 border-green-200" },
  failed:        { label: "안 맞음", badge: "text-red-700 bg-red-50 border-red-200" },
  inconclusive:  { label: "확인 부족",badge: "text-yellow-700 bg-yellow-50 border-yellow-200" },
  needs_decision:{ label: "결정 필요",badge: "text-violet-700 bg-violet-50 border-violet-200" },
  error:         { label: "실패",     badge: "text-gray-600 bg-gray-50 border-gray-200" },
  running:       { label: "실행 중", badge: "text-blue-700 bg-blue-50 border-blue-200" },
  queued:        { label: "대기 중", badge: "text-gray-500 bg-gray-50 border-gray-200" },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { label: status, badge: "text-gray-500 bg-gray-50 border-gray-200" };
  return (
    <span className={`text-xs font-medium border rounded-full px-2.5 py-0.5 flex-shrink-0 ${c.badge}`}>
      {c.label}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

// ─── Summary cards ────────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: PRReviewRunDetail["summary"] }) {
  const cards = [
    { label: "통과",      value: summary.passed,        color: "text-green-600" },
    { label: "안 맞음",  value: summary.failed,        color: "text-red-600" },
    { label: "확인 부족", value: summary.inconclusive,  color: "text-yellow-600" },
    { label: "결정 필요", value: summary.needsDecision, color: "text-violet-600" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
          <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Result item card ─────────────────────────────────────────────────────────

function ResultCard({ item }: { item: ReviewResultItem }) {
  const cfg = STATUS_CFG[item.status] ?? STATUS_CFG["error"];
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start gap-3 mb-2">
        <span className={`text-xs font-medium border rounded-full px-2 py-0.5 flex-shrink-0 mt-0.5 ${cfg.badge}`}>
          {item.userLabel ?? cfg.label}
        </span>
        <p className="text-sm font-medium text-gray-800">{item.title}</p>
      </div>
      {item.reason && (
        <p className="text-xs text-gray-500 leading-relaxed mb-2">{item.reason}</p>
      )}
      {Array.isArray(item.evidence) && item.evidence.length > 0 && (
        <div className="bg-gray-50 rounded-lg px-3 py-2 mb-2">
          <p className="text-xs font-medium text-gray-500 mb-1">확인 근거</p>
          <ul className="space-y-0.5">
            {item.evidence.map((e, i) => (
              <li key={i} className="text-xs text-gray-500 flex gap-1.5">
                <span className="text-gray-300 mt-px">-</span> {e}
              </li>
            ))}
          </ul>
        </div>
      )}
      {item.status !== "passed" && item.nextAction && (
        <p className="text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2">
          <span className="font-medium">다음 단계:</span> {item.nextAction}
        </p>
      )}
    </div>
  );
}

// ─── Fix Pack Panel ───────────────────────────────────────────────────────────

function FixPackPanel({
  projectId, prNumber, runId, userKey,
}: { projectId: string; prNumber: number; runId: string; userKey: string }) {
  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<FixBriefResult | null>(null);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setPhase("loading");
    const ext = loadExtendedProjectData(projectId);
    const res = await generatePRFixBrief(projectId, prNumber, {
      userKey,
      reviewRunId: runId,
      productSpec: ext?.productSpec,
      items: undefined,
    });
    if (!res.ok) { setPhase("error"); return; }
    setResult(res);
    setPhase("done");
  }, [projectId, prNumber, runId, userKey]);

  if (phase === "idle") {
    return (
      <button
        onClick={generate}
        className="w-full bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-gray-800 transition-colors"
      >
        이 기록으로 Fix Pack 만들기
      </button>
    );
  }

  if (phase === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin flex-shrink-0" />
        Fix Pack 생성 중...
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center justify-between">
        <span>Fix Pack 생성 실패</span>
        <button onClick={generate} className="text-xs text-red-600 underline">다시 시도</button>
      </div>
    );
  }

  if (!result) return null;
  const files = result.brief.files;
  const selectedFile = files[selectedFileIdx];

  const copyAll = () => {
    const all = files.map((f) => `# ${f.path}\n\n${f.content}`).join("\n\n---\n\n");
    navigator.clipboard.writeText(all).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Fix Pack</p>
          <p className="text-xs text-gray-400 mt-0.5">
            이 확인 기록 기준 생성됨 · {result.selectedItemIds.length}개 항목
          </p>
        </div>
        <button
          onClick={copyAll}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
        >
          {copied ? "복사됨!" : "전체 복사"}
        </button>
      </div>

      {/* File tabs */}
      {files.length > 1 && (
        <div className="border-b border-gray-100 flex overflow-x-auto bg-white">
          {files.map((f, i) => (
            <button
              key={f.path}
              onClick={() => setSelectedFileIdx(i)}
              className={`text-xs px-3 py-2 flex-shrink-0 border-b-2 transition-colors ${
                i === selectedFileIdx
                  ? "border-indigo-500 text-indigo-700 font-medium"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {f.path.split("/").pop()}
            </button>
          ))}
        </div>
      )}

      {/* File preview */}
      {selectedFile && (
        <div className="p-4 bg-white">
          <p className="text-xs text-gray-400 mb-2 font-mono">{selectedFile.path}</p>
          <pre className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
            {selectedFile.content}
          </pre>
        </div>
      )}

      {result.warnings && result.warnings.length > 0 && (
        <div className="bg-amber-50 border-t border-amber-100 px-4 py-2">
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700">{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Comment Panel ────────────────────────────────────────────────────────────

type CommentPreview = {
  body: string;
  selectedItemIds: string[];
  summary: { passed: number; failed: number; inconclusive: number; needsDecision: number };
};

function CommentPanel({
  projectId, prNumber, runId, userKey,
}: { projectId: string; prNumber: number; runId: string; userKey: string }) {
  const [phase, setPhase] = useState<"idle" | "previewing" | "ready" | "posting" | "posted" | "error">("idle");
  const [preview, setPreview] = useState<CommentPreview | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [postResult, setPostResult] = useState<{ url?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const generatePreview = useCallback(async () => {
    setPhase("previewing");
    setWarnings([]);
    const res = await previewPRComment(projectId, prNumber, { userKey, reviewRunId: runId });
    if (!res.ok) { setPhase("error"); return; }
    setPreview(res.comment as CommentPreview);
    setWarnings(res.warnings ?? []);
    setPhase("ready");
  }, [projectId, prNumber, runId, userKey]);

  const post = useCallback(async () => {
    if (!preview) return;
    setPhase("posting");
    const res = await postPRComment(projectId, prNumber, { userKey, reviewRunId: runId, mode: "new" });
    if (!res.ok) { setPhase("ready"); return; }
    setPostResult({ url: (res as { comment?: { githubCommentUrl?: string } }).comment?.githubCommentUrl });
    setPhase("posted");
  }, [projectId, prNumber, runId, userKey, preview]);

  const copyBody = () => {
    if (!preview) return;
    navigator.clipboard.writeText(preview.body).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  if (phase === "idle") {
    return (
      <button
        onClick={generatePreview}
        className="w-full bg-white border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
      >
        이 기록으로 PR comment 작성하기
      </button>
    );
  }

  if (phase === "previewing") {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin flex-shrink-0" />
        comment 생성 중...
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center justify-between">
        <span>comment 생성 실패</span>
        <button onClick={generatePreview} className="text-xs text-red-600 underline">다시 시도</button>
      </div>
    );
  }

  if (phase === "posted") {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
        GitHub에 comment를 남겼습니다.
        {postResult?.url && (
          <a href={postResult.url} target="_blank" rel="noreferrer" className="ml-2 underline text-green-600">
            보기 →
          </a>
        )}
      </div>
    );
  }

  if (!preview) return null;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">PR comment 미리보기</p>
        <div className="flex items-center gap-2">
          <button onClick={copyBody} className="text-xs text-gray-500 hover:text-gray-700">
            {copied ? "복사됨!" : "복사"}
          </button>
          <button
            onClick={post}
            disabled={phase === "posting"}
            className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {phase === "posting" ? "작성 중..." : "GitHub에 남기기"}
          </button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-2">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700">
              {w === "comparison_not_available_for_specific_run"
                ? "이전/최신 비교는 특정 확인 기록에서는 지원하지 않아요."
                : w}
            </p>
          ))}
        </div>
      )}

      <div className="p-4 bg-white">
        <pre className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto font-sans">
          {preview.body}
        </pre>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RunDetailPage() {
  const { id, runId } = useParams<{ id: string; runId: string }>();
  const project = getLocalProject(id) ?? getProject(id);
  const userKey = getUserKey();

  const [phase, setPhase] = useState<"loading" | "done" | "not_found" | "error">("loading");
  const [detail, setDetail] = useState<{
    repoFullName: string;
    prNumber: number;
    run: PRReviewRunDetail;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setPhase("loading");
      const res = await getReviewRunDetail(id, runId, userKey ?? "");
      if (cancelled) return;
      if (!res.ok) {
        setPhase(res.error.includes("404") || res.error.includes("not_found") ? "not_found" : "error");
        return;
      }
      setDetail({ repoFullName: res.repoFullName, prNumber: res.prNumber, run: res.run });
      setPhase("done");
    }
    load();
    return () => { cancelled = true; };
  }, [id, runId, userKey]);

  if (!project) return <p className="text-sm text-gray-400">프로젝트를 찾을 수 없습니다.</p>;

  const historyUrl = `/projects/${id}/github/history`;
  const prPageUrl = `/projects/${id}/github`;

  if (phase === "loading") {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin flex-shrink-0" />
          확인 결과를 불러오는 중...
        </div>
      </div>
    );
  }

  if (phase === "not_found") {
    return (
      <div className="max-w-3xl space-y-4">
        <Link href={historyUrl} className="text-xs text-gray-400 hover:text-indigo-600 inline-block">
          ← 확인 기록으로 돌아가기
        </Link>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm font-medium text-gray-700 mb-1">확인 결과를 찾을 수 없어요.</p>
          <p className="text-xs text-gray-400">삭제됐거나 다른 프로젝트의 결과일 수 있어요.</p>
        </div>
      </div>
    );
  }

  if (phase === "error" || !detail) {
    return (
      <div className="max-w-3xl space-y-4">
        <Link href={historyUrl} className="text-xs text-gray-400 hover:text-indigo-600 inline-block">
          ← 확인 기록으로 돌아가기
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          결과를 불러오지 못했습니다. 확인 기록 목록에서 다시 접근해 주세요.
        </div>
      </div>
    );
  }

  const { run, repoFullName, prNumber } = detail;
  const actionNeeded = run.summary.failed + run.summary.inconclusive + run.summary.needsDecision;
  const hasResults = Array.isArray(run.results) && run.results.length > 0;

  const sortedResults = hasResults
    ? [...run.results].sort((a, b) => {
        const order: Record<string, number> = { failed: 0, inconclusive: 1, needs_decision: 2, passed: 3 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      })
    : [];

  return (
    <div className="max-w-3xl space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={historyUrl} className="text-xs text-gray-400 hover:text-indigo-600 mb-2 inline-block">
            ← 확인 기록으로 돌아가기
          </Link>
          <h2 className="text-lg font-bold text-gray-900">확인 상세</h2>
          <p className="text-xs text-gray-400 mt-0.5">{repoFullName} · PR #{prNumber}</p>
        </div>
        <StatusBadge status={run.status} />
      </div>

      {/* ── Source label ── */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5 text-xs text-amber-700">
        이 화면은 특정 확인 기록 기준입니다. 최신 PR 상태와 다를 수 있어요.
      </div>

      {/* ── Run meta ── */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-xs text-gray-500 space-y-1.5">
        <div className="flex items-center justify-between">
          <span>확인 시간</span>
          <span className="text-gray-700 font-medium">{formatDate(run.createdAt)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>확인 항목 수</span>
          <span className="text-gray-700 font-medium">{run.selectedItemCount}개</span>
        </div>
        {run.errorMessage && (
          <div className="flex items-center justify-between">
            <span>오류 내용</span>
            <span className="text-red-600">{run.errorMessage}</span>
          </div>
        )}
      </div>

      {/* ── Summary cards ── */}
      <SummaryCards summary={run.summary} />

      {/* ── Comparison hint ── */}
      {run.status !== "queued" && run.status !== "running" && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-blue-700">
            같은 PR을 한 번 더 확인하면 이전 확인 결과와 비교할 수 있어요.
          </p>
          <Link href={prPageUrl} className="text-xs text-blue-600 font-medium hover:text-blue-800 flex-shrink-0">
            최신 비교 결과 보기 →
          </Link>
        </div>
      )}

      {/* ── Re-run ── */}
      <Link
        href={prPageUrl}
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
      >
        이 PR 다시 확인하기 →
      </Link>

      {/* ── Run-specific Fix Pack ── */}
      {actionNeeded > 0 && userKey && (
        <FixPackPanel projectId={id} prNumber={prNumber} runId={runId} userKey={userKey} />
      )}

      {/* ── Run-specific Comment ── */}
      {hasResults && userKey && (
        <CommentPanel projectId={id} prNumber={prNumber} runId={runId} userKey={userKey} />
      )}

      {/* ── Item results ── */}
      {hasResults ? (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">항목별 결과</h3>
          <div className="space-y-3">
            {sortedResults.map((r) => (
              <ResultCard key={r.itemId} item={r} />
            ))}
          </div>
        </section>
      ) : (
        run.status !== "error" && run.status !== "queued" && (
          <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
            항목별 결과가 저장되지 않았습니다.
          </div>
        )
      )}
    </div>
  );
}

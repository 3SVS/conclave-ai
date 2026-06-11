"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { getProject } from "@/lib/mock-data";
import {
  getLocalProject,
  loadExtendedProjectData,
  saveOutcome,
  loadOutcomes,
  generateOutcomeId,
  type BuilderPackOutcome,
  type OutcomeStatus,
} from "@/lib/workflow-store";
import {
  callExportBuilderPackApi,
  type ExportBuilderPackResponse,
  type ExportFile,
  type ExportTarget,
} from "@/lib/workspace-export-api";
import { StatusBadge } from "@/components/StatusBadge";
import type { ItemStatus } from "@/lib/labels";

// ─── Types ────────────────────────────────────────────────────────────────────

type SelectableItem = {
  id: string;
  title: string;
  checkStatus: ItemStatus;
};

type StatusFilter = "all" | "failed" | "inconclusive" | "needs_decision" | "passed" | "not_started";

// ─── Constants ────────────────────────────────────────────────────────────────

const TARGET_OPTIONS: { value: ExportTarget; label: string; desc: string }[] = [
  { value: "claude_code", label: "Claude Code용", desc: "Claude Code 지시서 포함" },
  { value: "codex", label: "Codex용", desc: "Codex 지시서 포함" },
  { value: "both", label: "둘 다", desc: "두 지시서 모두 포함" },
];

const OUTCOME_OPTIONS: { value: OutcomeStatus; label: string; color: string }[] = [
  { value: "worked", label: "잘 됨", color: "bg-green-600 text-white" },
  { value: "partial", label: "일부만 됨", color: "bg-amber-500 text-white" },
  { value: "failed", label: "안 됨", color: "bg-red-600 text-white" },
  { value: "not_checked", label: "아직 확인 전", color: "bg-gray-200 text-gray-600" },
];

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "failed", label: "안 맞음" },
  { value: "inconclusive", label: "확인 부족" },
  { value: "needs_decision", label: "결정 필요" },
  { value: "passed", label: "통과" },
  { value: "not_started", label: "시작 전" },
];

const OUTCOME_LABEL: Record<OutcomeStatus, string> = {
  worked: "잘 됨",
  partial: "일부만 됨",
  failed: "안 됨",
  not_checked: "아직 확인 전",
};

const TARGET_LABEL: Record<ExportTarget, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  both: "Claude Code + Codex",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filename(path: string): string {
  return path.split("/").pop() ?? path;
}

function downloadMarkdownBundle(files: ExportFile[], projectTitle: string): void {
  const content = files
    .map((f) => `<!-- FILE: ${f.path} -->\n\n${f.content}`)
    .join("\n\n---\n\n");
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `conclave-build-pack-${projectTitle.replace(/[^a-zA-Z0-9가-힣]/g, "-").slice(0, 40)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExportPage() {
  const { id } = useParams<{ id: string }>();
  const project = getLocalProject(id) ?? getProject(id);

  // ── Selection state ──────────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState<"all" | "selected">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [target, setTarget] = useState<ExportTarget>("claude_code");

  // ── Export state ─────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<ExportBuilderPackResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // ── Outcome recording state ──────────────────────────────────────────────
  const [outcomes, setOutcomes] = useState<BuilderPackOutcome[]>([]);
  const [outcomeStatus, setOutcomeStatus] = useState<OutcomeStatus | null>(null);
  const [outcomeNote, setOutcomeNote] = useState("");
  const [outcomeSaved, setOutcomeSaved] = useState(false);

  // ── Derived: selectable items with check status ──────────────────────────
  const ext = loadExtendedProjectData(id);
  const checkResultMap = new Map(
    (ext?.checkResults?.results ?? []).map((r) => [r.itemId, r.status as ItemStatus]),
  );

  const allItems: SelectableItem[] = (project?.requirements ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    checkStatus: checkResultMap.get(r.id) ?? (r.status as ItemStatus),
  }));

  const filteredItems =
    statusFilter === "all"
      ? allItems
      : allItems.filter((i) => i.checkStatus === statusFilter);

  const effectiveSelectedIds = selectionMode === "all" ? null : selectedIds;

  // ── Load outcomes on mount ───────────────────────────────────────────────
  useEffect(() => {
    setOutcomes(loadOutcomes(id));
  }, [id]);

  // ── Generate pack ────────────────────────────────────────────────────────
  const generate = useCallback(
    async (t: ExportTarget, sel: Set<string> | null) => {
      if (!project) return;
      setPhase("loading");

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
        status: checkResultMap.get(r.id) ?? r.status,
        criteria: ext?.itemCriteria?.[r.id] ?? [],
      }));

      const fixSuggestions: Record<string, unknown> = {};
      if (ext?.fixSuggestions) {
        for (const [itemId, fs] of Object.entries(ext.fixSuggestions)) {
          fixSuggestions[itemId] = { itemId, suggestion: fs.suggestion };
        }
      }

      const res = await callExportBuilderPackApi({
        project: {
          title: project.name,
          productSpec,
          items,
          checkResults: ext?.checkResults ?? undefined,
          fixSuggestions: Object.keys(fixSuggestions).length > 0 ? fixSuggestions : undefined,
        },
        selectedItemIds: sel && sel.size > 0 ? Array.from(sel) : undefined,
        target: t,
      });

      if (!res.ok) {
        setPhase("error");
        return;
      }
      setResult(res);
      setPhase("done");
      setSelectedFile(res.bundle.files[0]?.path ?? null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, project],
  );

  useEffect(() => {
    generate(target, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTargetChange(t: ExportTarget) {
    setTarget(t);
    generate(t, effectiveSelectedIds);
  }

  function handleGenerate() {
    generate(target, effectiveSelectedIds);
    setOutcomeSaved(false);
  }

  function handleRecommend() {
    const priority = ["failed", "inconclusive", "needs_decision"];
    const candidates = allItems
      .filter((i) => priority.includes(i.checkStatus))
      .sort((a, b) => priority.indexOf(a.checkStatus) - priority.indexOf(b.checkStatus))
      .slice(0, 3);
    if (candidates.length > 0) {
      setSelectedIds(new Set(candidates.map((i) => i.id)));
      setSelectionMode("selected");
    }
  }

  function toggleItem(itemId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function handleCopy(path: string, content: string) {
    await copyText(content);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  }

  async function handleCopyAll() {
    if (!result) return;
    const all = result.bundle.files
      .map((f) => `<!-- ${f.path} -->\n\n${f.content}`)
      .join("\n\n---\n\n");
    await copyText(all);
    setCopiedPath("__all__");
    setTimeout(() => setCopiedPath(null), 2000);
  }

  function handleSaveOutcome() {
    if (!outcomeStatus) return;
    const outcome: BuilderPackOutcome = {
      id: generateOutcomeId(),
      projectId: id,
      target,
      selectedItemIds: effectiveSelectedIds ? Array.from(effectiveSelectedIds) : allItems.map((i) => i.id),
      outcome: outcomeStatus,
      note: outcomeNote.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    saveOutcome(outcome);
    setOutcomes(loadOutcomes(id));
    setOutcomeSaved(true);
    setOutcomeNote("");
    setOutcomeStatus(null);
  }

  if (!project) return <p className="text-sm text-gray-400">프로젝트를 찾을 수 없습니다.</p>;

  const currentFile = result?.bundle.files.find((f) => f.path === selectedFile);
  const needsRegenerate = selectionMode === "selected" && phase === "done";
  const problemItemCount = allItems.filter((i) =>
    ["failed", "inconclusive", "needs_decision"].includes(i.checkStatus),
  ).length;

  return (
    <div className="max-w-5xl space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">개발 AI에게 넘길 만들기 패키지</h1>
        <p className="text-sm text-gray-500">
          제품 설명서, 확인 결과, 고쳐야 할 항목을 Claude Code 또는 Codex에 바로 넘길 수 있는 파일로 만듭니다.
        </p>
      </div>

      {/* ── Config row: target + selection mode ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Target */}
          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">개발 AI 선택</p>
            <div className="flex gap-2">
              {TARGET_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleTargetChange(opt.value)}
                  disabled={phase === "loading"}
                  className={`flex-1 text-sm px-3 py-2 rounded-lg border font-medium transition-all disabled:opacity-50 ${
                    target === opt.value
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Selection mode */}
          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">포함 범위</p>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectionMode("all")}
                className={`flex-1 text-sm px-3 py-2 rounded-lg border font-medium transition-all ${
                  selectionMode === "all"
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300"
                }`}
              >
                전체 항목 포함
              </button>
              <button
                onClick={() => setSelectionMode("selected")}
                className={`flex-1 text-sm px-3 py-2 rounded-lg border font-medium transition-all ${
                  selectionMode === "selected"
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300"
                }`}
              >
                선택한 항목만
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Item selection (shown when "selected" mode) ── */}
      {selectionMode === "selected" && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">
              포함할 항목 선택
              <span className="ml-2 text-xs font-normal text-gray-400">
                {selectedIds.size}개 선택됨 / 전체 {allItems.length}개
              </span>
            </p>
            <button
              onClick={handleRecommend}
              disabled={problemItemCount === 0}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              먼저 고쳐야 할 항목 추천 선택 ({Math.min(problemItemCount, 3)}개)
            </button>
          </div>

          {problemItemCount > 0 && (
            <p className="text-xs text-gray-400 mb-3">
              처음에는 전체 제품보다 고쳐야 할 항목 1~3개만 개발 AI에게 넘기는 것을 추천합니다.
            </p>
          )}

          {/* Status filter */}
          <div className="flex gap-1.5 flex-wrap mb-3">
            {STATUS_FILTER_OPTIONS.map((opt) => {
              const count =
                opt.value === "all"
                  ? allItems.length
                  : allItems.filter((i) => i.checkStatus === opt.value).length;
              if (opt.value !== "all" && count === 0) return null;
              return (
                <button
                  key={opt.value}
                  onClick={() => setStatusFilter(opt.value)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    statusFilter === opt.value
                      ? "bg-gray-800 text-white border-gray-800"
                      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {opt.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Item checkboxes */}
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {filteredItems.map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleItem(item.id)}
                  className="w-4 h-4 rounded accent-indigo-600 cursor-pointer flex-shrink-0"
                />
                <span className="flex-1 text-sm text-gray-700 group-hover:text-gray-900">
                  {item.title}
                </span>
                <StatusBadge status={item.checkStatus} />
              </label>
            ))}
            {filteredItems.length === 0 && (
              <p className="text-xs text-gray-400 py-4 text-center">해당 상태의 항목이 없습니다.</p>
            )}
          </div>

          {/* Generate button */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {selectedIds.size > 0
                ? `${selectedIds.size}개 선택됨`
                : "항목을 선택하면 선택 항목만 패키지에 포함됩니다."}
            </p>
            <button
              onClick={handleGenerate}
              disabled={phase === "loading"}
              className="text-sm px-4 py-2 rounded-xl font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {phase === "loading" ? "생성 중..." : "패키지 생성"}
            </button>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {phase === "loading" && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">만들기 패키지를 생성하는 중입니다...</p>
        </div>
      )}

      {/* ── Error ── */}
      {phase === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>생성 중 오류가 발생했습니다.</span>
          <button onClick={handleGenerate} className="text-xs underline ml-4">
            다시 시도
          </button>
        </div>
      )}

      {/* ── Result ── */}
      {phase === "done" && result && (
        <>
          {/* Summary bar */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-3 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-sm font-medium text-indigo-900">
                {result.summary.fileCount}개 파일 생성 완료
              </span>
              <span className="text-xs text-indigo-600">
                포함 항목: {result.summary.selectedItems}개
                {result.summary.selectedItems < result.summary.totalItems
                  ? ` (전체 ${result.summary.totalItems}개 중)`
                  : " (전체)"}
              </span>
              {result.bundle.files.some((f) => f.path.endsWith("CLAUDE_CODE_PROMPT.md")) && (
                <span className="text-xs bg-white text-indigo-600 border border-indigo-200 rounded-full px-2 py-0.5">
                  Claude Code 지시서 ✓
                </span>
              )}
              {result.bundle.files.some((f) => f.path.endsWith("CODEX_PROMPT.md")) && (
                <span className="text-xs bg-white text-indigo-600 border border-indigo-200 rounded-full px-2 py-0.5">
                  Codex 지시서 ✓
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopyAll}
                className="text-xs px-3 py-1.5 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                {copiedPath === "__all__" ? "복사됨 ✓" : "전체 복사"}
              </button>
              <button
                onClick={() => downloadMarkdownBundle(result.bundle.files, project.name)}
                className="text-xs px-3 py-1.5 rounded-lg font-medium bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 transition-colors"
              >
                MD 묶음 내려받기
              </button>
            </div>
          </div>

          {needsRegenerate && selectedIds.size === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              항목을 선택한 후 &ldquo;패키지 생성&rdquo;을 눌러야 변경이 반영됩니다.
            </p>
          )}

          {/* File browser */}
          <div className="flex gap-4 h-[520px]">
            {/* File list */}
            <div className="w-52 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-y-auto">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 border-b border-gray-100">
                파일 목록
              </p>
              <ul className="py-1">
                {result.bundle.files.map((f) => (
                  <li key={f.path}>
                    <button
                      onClick={() => setSelectedFile(f.path)}
                      className={`w-full text-left px-4 py-2 text-xs transition-colors ${
                        selectedFile === f.path
                          ? "bg-indigo-50 text-indigo-700 font-medium"
                          : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {filename(f.path)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* File content */}
            <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
              {currentFile ? (
                <>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
                    <span className="text-xs font-mono text-gray-500">{currentFile.path}</span>
                    <button
                      onClick={() => handleCopy(currentFile.path, currentFile.content)}
                      className="text-xs px-3 py-1 rounded-lg font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                      {copiedPath === currentFile.path ? "복사됨 ✓" : "복사"}
                    </button>
                  </div>
                  <pre className="flex-1 overflow-auto p-4 text-xs text-gray-700 font-mono leading-relaxed whitespace-pre-wrap">
                    {currentFile.content}
                  </pre>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-gray-400">파일을 선택하세요.</p>
                </div>
              )}
            </div>
          </div>

          {/* Usage tip */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 text-xs text-gray-500 space-y-1.5">
            <p className="font-medium text-gray-600">사용 방법</p>
            <p>
              1. 왼쪽에서 <strong>CLAUDE_CODE_PROMPT.md</strong> 또는 <strong>CODEX_PROMPT.md</strong>를 선택하세요.
            </p>
            <p>2. <strong>복사</strong> 버튼을 누른 뒤 개발 AI 대화창에 붙여넣으세요.</p>
            <p>3. 개발 AI가 product.md, items.md, checks.md, fixes.md를 읽도록 안내하세요.</p>
            <p className="text-amber-600">
              ⚠ 이 패키지의 확인 결과는 제품 설명서 기준의 사전 점검입니다. 실제 코드 점검 결과가 아닙니다.
            </p>
          </div>

          {/* ── Outcome recording ── */}
          <OutcomeRecorder
            selectedItemCount={result.summary.selectedItems}
            target={target}
            outcomeStatus={outcomeStatus}
            outcomeNote={outcomeNote}
            outcomeSaved={outcomeSaved}
            onStatusChange={setOutcomeStatus}
            onNoteChange={setOutcomeNote}
            onSave={handleSaveOutcome}
          />

          {/* ── Past outcomes ── */}
          {outcomes.length > 0 && (
            <OutcomeHistory outcomes={outcomes} />
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function OutcomeRecorder({
  selectedItemCount,
  target,
  outcomeStatus,
  outcomeNote,
  outcomeSaved,
  onStatusChange,
  onNoteChange,
  onSave,
}: {
  selectedItemCount: number;
  target: ExportTarget;
  outcomeStatus: OutcomeStatus | null;
  outcomeNote: string;
  outcomeSaved: boolean;
  onStatusChange: (s: OutcomeStatus) => void;
  onNoteChange: (n: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-800 mb-1">개발 AI에 넘긴 뒤 결과 기록하기</h2>
      <p className="text-xs text-gray-400 mb-4">
        {TARGET_LABEL[target]}에 {selectedItemCount}개 항목을 넘긴 결과를 기록하세요.
      </p>

      {outcomeSaved ? (
        <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          ✓ 결과가 기록됐습니다.
        </p>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap mb-4">
            {OUTCOME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onStatusChange(opt.value)}
                className={`text-sm px-4 py-2 rounded-lg border font-medium transition-all ${
                  outcomeStatus === opt.value
                    ? opt.color + " border-transparent"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <textarea
            value={outcomeNote}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="어떤 점이 잘 됐나요? 어떤 점이 안 됐나요? (선택사항)"
            rows={2}
            className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
          />

          <button
            onClick={onSave}
            disabled={!outcomeStatus}
            className="text-sm px-4 py-2 rounded-xl font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            기록하기
          </button>
        </>
      )}
    </div>
  );
}

function OutcomeHistory({ outcomes }: { outcomes: BuilderPackOutcome[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-800 mb-3">이전 기록</h2>
      <div className="space-y-2">
        {outcomes.slice(0, 10).map((oc) => (
          <div key={oc.id} className="flex items-start gap-3 text-xs text-gray-600 py-2 border-b border-gray-50 last:border-0">
            <span className="text-gray-400 flex-shrink-0 w-32">{formatDate(oc.createdAt)}</span>
            <span className="flex-shrink-0">{TARGET_LABEL[oc.target]}</span>
            <span className="flex-shrink-0 text-gray-400">{oc.selectedItemIds.length}개 항목</span>
            <span
              className={`flex-shrink-0 font-medium ${
                oc.outcome === "worked"
                  ? "text-green-600"
                  : oc.outcome === "partial"
                  ? "text-amber-600"
                  : oc.outcome === "failed"
                  ? "text-red-600"
                  : "text-gray-400"
              }`}
            >
              {OUTCOME_LABEL[oc.outcome]}
            </span>
            {oc.note && <span className="text-gray-400 truncate">{oc.note}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

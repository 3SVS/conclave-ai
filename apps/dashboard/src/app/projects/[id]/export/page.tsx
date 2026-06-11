"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { getProject } from "@/lib/mock-data";
import {
  getLocalProject,
  loadExtendedProjectData,
} from "@/lib/workflow-store";
import {
  callExportBuilderPackApi,
  type ExportBuilderPackResponse,
  type ExportFile,
  type ExportTarget,
} from "@/lib/workspace-export-api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filename(path: string): string {
  return path.split("/").pop() ?? path;
}

function downloadMarkdownBundle(files: ExportFile[], projectTitle: string): void {
  const separator = "\n\n---\n\n";
  const content = files
    .map((f) => `<!-- FILE: ${f.path} -->\n\n${f.content}`)
    .join(separator);
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
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

// ─── Target selector ──────────────────────────────────────────────────────────

const TARGET_OPTIONS: { value: ExportTarget; label: string; desc: string }[] = [
  { value: "claude_code", label: "Claude Code용", desc: "CLAUDE_CODE_PROMPT.md 포함" },
  { value: "codex", label: "Codex용", desc: "CODEX_PROMPT.md 포함" },
  { value: "both", label: "둘 다", desc: "두 지시서 모두 포함" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExportPage() {
  const { id } = useParams<{ id: string }>();
  const project = getLocalProject(id) ?? getProject(id);

  const [target, setTarget] = useState<ExportTarget>("claude_code");
  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<ExportBuilderPackResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const generate = useCallback(async (t: ExportTarget) => {
    if (!project) return;
    setPhase("loading");

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

    // Build fixSuggestions in the shape export expects
    const fixSuggestions: Record<string, unknown> = {};
    if (ext?.fixSuggestions) {
      for (const [itemId, fs] of Object.entries(ext.fixSuggestions)) {
        fixSuggestions[itemId] = {
          itemId,
          suggestion: fs.suggestion,
        };
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
      target: t,
    });

    if (!res.ok) {
      setPhase("error");
      return;
    }
    setResult(res);
    setPhase("done");
    setSelectedFile(res.bundle.files[0]?.path ?? null);
  }, [id, project]);

  useEffect(() => {
    generate(target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTargetChange(t: ExportTarget) {
    setTarget(t);
    generate(t);
  }

  async function handleCopy(path: string, content: string) {
    await copyText(content);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  }

  async function handleCopyAll() {
    if (!result) return;
    const all = result.bundle.files.map((f) => `<!-- ${f.path} -->\n\n${f.content}`).join("\n\n---\n\n");
    await copyText(all);
    setCopiedPath("__all__");
    setTimeout(() => setCopiedPath(null), 2000);
  }

  if (!project) return <p className="text-sm text-gray-400">프로젝트를 찾을 수 없습니다.</p>;

  const currentFile = result?.bundle.files.find((f) => f.path === selectedFile);

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">개발 AI에게 넘길 만들기 패키지</h1>
        <p className="text-sm text-gray-500">
          제품 설명서, 확인 결과, 고쳐야 할 항목을 Claude Code 또는 Codex에 바로 넘길 수 있는 파일로 만듭니다.
        </p>
      </div>

      {/* Target selector */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {TARGET_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleTargetChange(opt.value)}
            disabled={phase === "loading"}
            className={`flex-1 min-w-[120px] text-sm px-4 py-2.5 rounded-xl border font-medium transition-all ${
              target === opt.value
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
            } disabled:opacity-50`}
          >
            <span className="block">{opt.label}</span>
            <span className="block text-xs font-normal opacity-70 mt-0.5">{opt.desc}</span>
          </button>
        ))}
      </div>

      {/* Loading */}
      {phase === "loading" && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">만들기 패키지를 생성하는 중입니다...</p>
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>생성 중 오류가 발생했습니다.</span>
          <button onClick={() => generate(target)} className="text-xs underline ml-4">다시 시도</button>
        </div>
      )}

      {/* Result */}
      {phase === "done" && result && (
        <>
          {/* Summary bar */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-3 flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <p className="text-sm font-medium text-indigo-900">
                {result.summary.fileCount}개 파일 생성 완료
              </p>
              <p className="text-xs text-indigo-600 mt-0.5">{result.summary.recommendedNextStep}</p>
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

          {/* File browser */}
          <div className="flex gap-4 h-[560px]">
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
          <div className="mt-5 bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 text-xs text-gray-500 space-y-1.5">
            <p className="font-medium text-gray-600">사용 방법</p>
            <p>1. 왼쪽에서 <strong>CLAUDE_CODE_PROMPT.md</strong> 또는 <strong>CODEX_PROMPT.md</strong>를 선택하세요.</p>
            <p>2. <strong>복사</strong> 버튼을 누른 뒤 개발 AI 대화창에 붙여넣으세요.</p>
            <p>3. 개발 AI가 다른 파일들을 읽도록 유도하면 더 정확한 구현이 가능합니다.</p>
            <p className="text-amber-600">⚠ 이 패키지의 확인 결과는 제품 설명서 기준의 사전 점검입니다. 실제 코드 점검 결과가 아닙니다.</p>
          </div>
        </>
      )}
    </div>
  );
}

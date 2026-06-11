"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { callWorkspaceApi } from "@/lib/workspace-api";
import { ACCEPTANCE_CRITERIA } from "@/lib/mock-generators";
import {
  saveProject,
  generateProjectId,
} from "@/lib/workflow-store";
import type {
  IdeaToSpecDraftResponse,
  WorkspaceQuestion,
  WorkspaceRequirementItem,
} from "@/lib/workspace-types";
import { StatusBadge } from "@/components/StatusBadge";

const EXAMPLE_IDEAS = [
  "회의 녹음 파일을 올리면 자동으로 요약하고, 할 일을 뽑아서 Linear로 보내주는 앱",
  "사진을 올리면 AI가 쇼핑몰 상품 설명을 자동으로 써주는 도구",
  "고객 문의 내용을 분석해서 자주 묻는 질문을 자동으로 정리해주는 서비스",
];

type Step = 1 | 2 | 3 | 4;

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [ideaText, setIdeaText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [result, setResult] = useState<IdeaToSpecDraftResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isGeneratingSpec, setIsGeneratingSpec] = useState(false);
  const [specResult, setSpecResult] = useState<IdeaToSpecDraftResponse | null>(null);

  const answeredCount = Object.keys(answers).length;
  const questions = result?.questions ?? [];

  async function handleGenerateUnderstanding() {
    if (!ideaText.trim()) return;
    setIsLoading(true);
    setIsFallback(false);
    const res = await callWorkspaceApi({ idea: ideaText });
    if (res.ok) {
      setResult(res.data);
      setIsFallback(res.data.source === "mock-fallback");
    } else {
      setResult(res.fallback);
      setIsFallback(true);
    }
    setIsLoading(false);
    setStep(2);
  }

  async function handleGenerateSpec() {
    if (!result) return;
    setIsGeneratingSpec(true);
    const answerArray = Object.entries(answers).map(([questionId, answer]) => ({
      questionId,
      answer,
    }));
    const res = await callWorkspaceApi({ idea: ideaText, answers: answerArray });
    if (res.ok) {
      setSpecResult(res.data);
      setIsFallback(res.data.source === "mock-fallback");
    } else {
      setSpecResult(res.fallback);
      setIsFallback(true);
    }
    setIsGeneratingSpec(false);
    setStep(4);
  }

  function handleSave() {
    const spec = specResult ?? result;
    if (!spec) return;
    const id = generateProjectId();
    saveProject({
      id,
      name: spec.productSpec.productName,
      description: spec.productSpec.oneLine,
      createdAt: new Date().toISOString().slice(0, 10),
      spec: {
        completeness: 60,
        goal: spec.productSpec.problem,
        included: spec.productSpec.included,
        excluded: spec.productSpec.excluded,
        openDecisions: spec.productSpec.openQuestions,
      },
      requirements: spec.items.map((item) => ({
        id: item.id,
        title: item.title,
        status: "not_started" as const,
        category: "feature",
        priority: "must" as const,
      })),
    });
    router.push(`/projects/${id}`);
  }

  const progressWidth = { 1: "25%", 2: "50%", 3: "75%", 4: "100%" }[step];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/projects" className="text-sm text-gray-400 hover:text-gray-700">
            ← 목록
          </Link>
          <span className="text-gray-200">|</span>
          <span className="text-sm font-medium text-gray-900">새 프로젝트</span>
        </div>
        <span className="text-xs text-indigo-600 font-medium bg-indigo-50 px-2.5 py-1 rounded-full">
          제품 설명서 만들기 · 무료 베타
        </span>
      </header>

      <div className="h-1 bg-gray-100">
        <div className="h-1 bg-indigo-500 transition-all duration-500" style={{ width: progressWidth }} />
      </div>

      <main className="flex-1 flex justify-center px-4 py-10">
        <div className="w-full max-w-2xl">

          {/* ── Step 1: 아이디어 입력 ─────────────────────────────── */}
          {step === 1 && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                어떤 제품을 만들고 싶으신가요?
              </h1>
              <p className="text-sm text-gray-500 mb-8">
                완성된 문장이 아니어도 괜찮습니다. 아이디어를 자유롭게 적어주세요.
              </p>
              <textarea
                value={ideaText}
                onChange={(e) => setIdeaText(e.target.value)}
                placeholder="예) 회의 녹음 파일을 올리면 자동으로 요약하고 할 일을 정리해주는 앱"
                rows={5}
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none bg-white"
              />
              <div className="mt-4 mb-8">
                <p className="text-xs text-gray-400 mb-2">예시로 시작하기</p>
                <div className="flex flex-col gap-2">
                  {EXAMPLE_IDEAS.map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => setIdeaText(ex)}
                      className="text-left text-sm text-gray-600 bg-white border border-gray-200 rounded-lg px-4 py-2.5 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleGenerateUnderstanding}
                disabled={!ideaText.trim() || isLoading}
                className="w-full bg-indigo-600 text-white text-sm font-medium py-3.5 rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? "Conclave가 이해하는 중..." : "제품 설명서 만들기 →"}
              </button>
              <p className="text-center text-xs text-gray-400 mt-3">
                제품 설명서 만들기는 무료 베타입니다
              </p>
            </div>
          )}

          {/* ── Step 2: 이해한 내용 ───────────────────────────────── */}
          {step === 2 && result && (
            <div>
              <div className="flex items-center gap-2 mb-6">
                <span className="text-xs font-mono bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                  Conclave
                </span>
                <span className="text-sm text-gray-500">이해한 내용</span>
                {isFallback && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                    임시 초안
                  </span>
                )}
              </div>

              {isFallback && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-5 text-xs text-amber-700">
                  지금은 임시 초안으로 보여드리고 있어요. 다시 시도하면 더 맞춤형으로 만들 수 있습니다.
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <p className="text-sm text-gray-800 leading-relaxed mb-5">{result.understood.summary}</p>
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">주요 사용자</p>
                  <ul className="space-y-1">
                    {result.understood.targetUsers.map((u, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-700">
                        <span className="text-indigo-400 mt-0.5">•</span>{u}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">주요 흐름</p>
                  <ol className="space-y-1">
                    {result.understood.mainFlow.map((f, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-700">
                        <span className="text-gray-300 w-4 flex-shrink-0">{i + 1}.</span>{f}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-8 text-sm text-amber-800">
                이 내용이 맞지 않으면{" "}
                <button onClick={() => setStep(1)} className="underline font-medium">아이디어를 수정</button>
                하세요.
              </div>

              <button
                onClick={() => setStep(3)}
                className="w-full bg-indigo-600 text-white text-sm font-medium py-3.5 rounded-xl hover:bg-indigo-700 transition-colors"
              >
                맞습니다. 질문에 답하기 →
              </button>
            </div>
          )}

          {/* ── Step 3: 질문 ──────────────────────────────────────── */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">
                더 정확한 제품 설명서를 위해 몇 가지 여쭤볼게요
              </h2>
              <p className="text-sm text-gray-500 mb-8">
                모르는 항목은 &quot;나중에 정하기&quot;를 선택하세요.
              </p>

              <div className="space-y-4 mb-8">
                {questions.map((q, i) => (
                  <ApiQuestionCard
                    key={q.id}
                    question={q}
                    index={i}
                    total={questions.length}
                    answer={answers[q.id]}
                    onAnswer={(val) => setAnswers((prev) => ({ ...prev, [q.id]: val }))}
                  />
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 bg-white text-gray-600 border border-gray-200 text-sm font-medium py-3.5 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  ← 이전
                </button>
                <button
                  onClick={handleGenerateSpec}
                  disabled={isGeneratingSpec}
                  className="flex-[2] bg-indigo-600 text-white text-sm font-medium py-3.5 rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                >
                  {isGeneratingSpec
                    ? "제품 설명서 만드는 중..."
                    : `제품 설명서 만들기 (${answeredCount}/${questions.length} 답변) →`}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: 결과 ──────────────────────────────────────── */}
          {step === 4 && (specResult ?? result) && (
            <SpecPreview
              data={(specResult ?? result)!}
              isFallback={isFallback}
              onBack={() => setStep(3)}
              onSave={handleSave}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ApiQuestionCard({
  question,
  index,
  total,
  answer,
  onAnswer,
}: {
  question: WorkspaceQuestion;
  index: number;
  total: number;
  answer: string | undefined;
  onAnswer: (v: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-mono text-gray-400">{index + 1} / {total}</span>
        {answer && answer !== "defer" && (
          <span className="text-xs text-green-600 font-medium">✓ 답변 완료</span>
        )}
        {answer === "defer" && <span className="text-xs text-gray-400">나중에 정하기</span>}
      </div>
      <p className="text-base font-medium text-gray-900 mb-4 leading-snug">{question.question}</p>
      <div className="bg-indigo-50 rounded-lg px-4 py-3 mb-5">
        <p className="text-xs font-semibold text-indigo-700 mb-0.5">추천: {question.recommendation}</p>
        <p className="text-xs text-indigo-600 leading-relaxed">{question.reason}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {question.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => onAnswer(opt)}
            className={`text-sm px-4 py-2 rounded-lg border transition-all ${
              answer === opt
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
            }`}
          >
            {opt}
          </button>
        ))}
        {question.allowLater && (
          <button
            onClick={() => onAnswer("defer")}
            className={`text-sm px-4 py-2 rounded-lg border transition-all ${
              answer === "defer"
                ? "bg-gray-200 text-gray-700 border-gray-300"
                : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50"
            }`}
          >
            나중에 정하기
          </button>
        )}
        {question.allowCustom && (
          <button
            onClick={() => onAnswer("custom")}
            className={`text-sm px-4 py-2 rounded-lg border transition-all ${
              answer === "custom"
                ? "bg-gray-800 text-white border-gray-800"
                : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
            }`}
          >
            직접 입력
          </button>
        )}
      </div>
      {answer === "custom" && (
        <input
          autoFocus
          type="text"
          placeholder="직접 입력하세요"
          className="mt-3 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          onBlur={(e) => e.target.value && onAnswer(e.target.value)}
        />
      )}
    </div>
  );
}

function SpecPreview({
  data,
  isFallback,
  onBack,
  onSave,
}: {
  data: IdeaToSpecDraftResponse;
  isFallback: boolean;
  onBack: () => void;
  onSave: () => void;
}) {
  const { productSpec, items } = data;
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">제품 설명서 초안이 완성됐습니다</h2>
      <p className="text-sm text-gray-500 mb-6">
        저장하면 프로젝트 페이지에서 언제든 확인할 수 있습니다.
      </p>

      {isFallback && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-5 text-xs text-amber-700">
          지금은 임시 초안으로 보여드리고 있어요. 저장 후 언제든 수정할 수 있습니다.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-bold text-gray-900 mb-0.5">{productSpec.productName}</h3>
        <p className="text-sm text-gray-500 mb-5">{productSpec.oneLine}</p>

        <SpecRow label="누가 쓰는 제품" value={productSpec.targetUsers.join(", ")} />
        <SpecRow label="해결하려는 문제" value={productSpec.problem} />

        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">이번 버전에 포함</p>
          <ul className="space-y-1">
            {productSpec.included.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="text-green-500 mt-0.5">•</span> {item}
              </li>
            ))}
          </ul>
        </div>

        {productSpec.excluded.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">이번 버전에서 제외</p>
            <ul className="space-y-1">
              {productSpec.excluded.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-500">
                  <span className="mt-0.5">×</span> {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {productSpec.openQuestions.length > 0 && (
          <div className="mt-4 bg-violet-50 rounded-lg p-4">
            <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-2">아직 결정 필요</p>
            <ul className="space-y-1">
              {productSpec.openQuestions.map((d, i) => (
                <li key={i} className="flex gap-2 text-sm text-violet-700">
                  <span className="mt-0.5">!</span> {d}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mb-8">
        <p className="text-sm font-semibold text-gray-700 mb-3">꼭 들어가야 할 것 ({items.length}개)</p>
        <div className="space-y-2">
          {items.map((item) => (
            <RequirementRow key={item.id} item={item} />
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 bg-white text-gray-600 border border-gray-200 text-sm font-medium py-3.5 rounded-xl hover:bg-gray-50 transition-colors"
        >
          ← 질문 수정
        </button>
        <button
          onClick={onSave}
          className="flex-[2] bg-indigo-600 text-white text-sm font-medium py-3.5 rounded-xl hover:bg-indigo-700 transition-colors"
        >
          저장하고 프로젝트 시작하기 →
        </button>
      </div>
    </div>
  );
}

function RequirementRow({ item }: { item: WorkspaceRequirementItem }) {
  const criteriaList = item.criteria.length > 0 ? item.criteria : (ACCEPTANCE_CRITERIA[item.id] ?? []);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start gap-3 mb-2">
        <p className="text-sm font-medium text-gray-800 flex-1">{item.title}</p>
        <StatusBadge status={item.status} />
      </div>
      {criteriaList.length > 0 && (
        <ul className="space-y-1 pl-1">
          {criteriaList.map((c, i) => (
            <li key={i} className="flex gap-2 text-xs text-gray-500">
              <span className="text-gray-300">-</span> {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-700">{value}</p>
    </div>
  );
}

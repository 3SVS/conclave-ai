/**
 * Workspace generation — calls Anthropic to produce a structured
 * idea-to-spec draft. Falls back to inline mock data on any failure
 * so the user-facing flow never breaks.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type IdeaToSpecDraftRequest = {
  idea: string;
  mode?: "quick" | "standard" | "thorough";
  answers?: Array<{ questionId: string; answer: string }>;
  locale?: "ko" | "en";
};

export type Question = {
  id: string;
  question: string;
  recommendation: string;
  reason: string;
  options: string[];
  allowCustom: boolean;
  allowLater: boolean;
};

export type ProductSpec = {
  productName: string;
  oneLine: string;
  targetUsers: string[];
  problem: string;
  included: string[];
  excluded: string[];
  userFlow: string[];
  decisions: string[];
  openQuestions: string[];
};

export type RequirementItem = {
  id: string;
  title: string;
  status: "not_started";
  criteria: string[];
};

export type IdeaToSpecDraftResponse = {
  ok: true;
  source: "llm" | "mock-fallback";
  understood: {
    summary: string;
    targetUsers: string[];
    mainFlow: string[];
  };
  questions: Question[];
  productSpec: ProductSpec;
  items: RequirementItem[];
  warnings?: string[];
};

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SCHEMA_DESCRIPTION = `{
  "understood": {
    "summary": "한 문장 요약 (일반 유저용 언어)",
    "targetUsers": ["주요 사용자 유형 1", "..."],
    "mainFlow": ["1. 첫 번째 단계", "2. 두 번째 단계", "..."]
  },
  "questions": [
    {
      "id": "q1",
      "question": "아이디어에 맞는 구체적 질문",
      "recommendation": "추천 답변 (짧게)",
      "reason": "추천 이유 (1~2문장, 일반 유저용 언어)",
      "options": ["선택지 1", "선택지 2", "선택지 3"],
      "allowCustom": true,
      "allowLater": true
    }
  ],
  "productSpec": {
    "productName": "제품 이름",
    "oneLine": "한 줄 설명",
    "targetUsers": ["누가 쓰는지"],
    "problem": "해결하려는 문제 (1~2문장)",
    "included": ["이번 버전에 포함할 기능"],
    "excluded": ["이번 버전에서 제외할 것"],
    "userFlow": ["1. 사용자 흐름 단계"],
    "decisions": ["질문 답변에 따라 결정된 사항"],
    "openQuestions": ["아직 결정이 필요한 것"]
  },
  "items": [
    {
      "id": "req_001",
      "title": "꼭 들어가야 할 것 (주어+서술어 형태)",
      "status": "not_started",
      "criteria": ["완성 기준 1", "완성 기준 2"]
    }
  ]
}`;

function buildPrompt(req: IdeaToSpecDraftRequest): string {
  const answersText =
    req.answers && req.answers.length > 0
      ? `\n사용자 답변:\n${req.answers.map((a) => `- ${a.questionId}: ${a.answer}`).join("\n")}`
      : "";

  return `사용자가 만들고 싶은 제품 아이디어가 있습니다. 이 아이디어를 바탕으로 구조화된 제품 설명서를 한국어로 만들어주세요.

아이디어: ${req.idea}${answersText}

다음 규칙을 반드시 따르세요:
- 모든 사용자 대상 텍스트는 자연스러운 한국어로 작성
- PRD, Requirement, Acceptance Criteria, FAIL, INCONCLUSIVE 같은 개발자 용어 사용 금지
- 질문은 이 아이디어에 맞춤형으로 3~5개만 생성 (단순 템플릿 반복 금지)
- 좋은 질문: 답변에 따라 실제 제품이 달라지는 것 (구현 범위, 사용자 흐름, 데이터 보관, 권한, 외부 연동)
- 나쁜 질문: "장기 비전은?", "사용자 경험은 어떤 느낌?" 같은 추상적 질문
- 꼭 들어가야 할 항목은 8~10개, 각 항목마다 완성 기준 2~4개
- 완성 기준은 확인 가능한 구체적 동작으로 작성

다음 JSON 형식으로만 응답하세요. 마크다운 코드블록, 설명문 없이 JSON만 반환:

${SCHEMA_DESCRIPTION}`;
}

// ─── Anthropic fetch ──────────────────────────────────────────────────────────

async function callAnthropic(
  apiKey: string,
  prompt: string,
  timeoutMs = 20000,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let resp: Response;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) {
    const tail = await resp.text().catch(() => "");
    throw new Error(`Anthropic ${resp.status}: ${tail.slice(0, 200)}`);
  }
  const data = (await resp.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  return (data.content ?? []).find((b) => b.type === "text")?.text ?? "";
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isValidResponse(v: unknown): v is Omit<IdeaToSpecDraftResponse, "ok" | "source"> {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r["understood"] === "object" &&
    Array.isArray((r["understood"] as Record<string, unknown>)["mainFlow"]) &&
    Array.isArray(r["questions"]) &&
    typeof r["productSpec"] === "object" &&
    Array.isArray(r["items"]) &&
    (r["items"] as unknown[]).length >= 3
  );
}

// ─── Mock fallback ────────────────────────────────────────────────────────────

function buildMockFallback(req: IdeaToSpecDraftRequest): IdeaToSpecDraftResponse {
  const isMeeting = /회의|녹음|요약|linear|미팅/i.test(req.idea);
  if (isMeeting) {
    return {
      ok: true,
      source: "mock-fallback",
      understood: {
        summary:
          "이 제품은 회의 녹음 파일을 업로드하면 자동으로 요약하고 할 일을 업무 도구로 보내는 앱입니다.",
        targetUsers: ["회의가 많은 팀", "PM·운영자", "Linear를 쓰는 스타트업 팀"],
        mainFlow: ["녹음 파일 업로드", "텍스트 변환", "요약 생성", "할 일 추출", "Linear로 전송"],
      },
      questions: [
        {
          id: "q1",
          question: "Linear로 보내기 전에 사용자가 확인하는 단계가 필요할까요?",
          recommendation: "확인 후 보내기",
          reason: "잘못 추출된 할 일이 팀 시스템에 들어가는 것을 막을 수 있습니다.",
          options: ["확인 후 보내기", "자동으로 보내기"],
          allowCustom: true,
          allowLater: true,
        },
        {
          id: "q2",
          question: "회의 녹음 원본은 저장해야 하나요, 요약 후 삭제해야 하나요?",
          recommendation: "요약 후 삭제",
          reason: "불필요한 민감 데이터를 줄이면 보안 위험과 비용이 감소합니다.",
          options: ["요약 후 삭제", "일정 기간 보관", "영구 보관"],
          allowCustom: false,
          allowLater: true,
        },
        {
          id: "q3",
          question: "잘못 추출된 할 일을 사용자가 수정할 수 있어야 하나요?",
          recommendation: "수정 가능하게",
          reason: "수정 기능이 있으면 오탐에 대한 부담이 줄고 신뢰도가 높아집니다.",
          options: ["수정 가능", "삭제만 가능", "수정 불가"],
          allowCustom: false,
          allowLater: true,
        },
      ],
      productSpec: {
        productName: "회의록 자동 요약 앱",
        oneLine: "회의를 녹음하면 요약과 할 일이 자동으로 정리됩니다",
        targetUsers: ["회의가 많은 팀", "Linear를 쓰는 스타트업"],
        problem: "회의 후 내용 정리와 할 일 분배에 시간이 많이 걸립니다.",
        included: ["녹음 파일 업로드", "STT 변환", "요약 생성", "할 일 추출", "Linear 전송"],
        excluded: ["실시간 녹음", "화상 회의 연동", "번역"],
        userFlow: ["파일 업로드", "변환·요약 처리", "할 일 확인·수정", "Linear로 전송"],
        decisions: [],
        openQuestions: ["파일 크기 상한선", "STT 서비스 선택"],
      },
      items: [
        { id: "req_001", title: "녹음 파일을 올릴 수 있어야 함", status: "not_started", criteria: ["mp3, m4a, wav 파일 지원", "지원 안 되는 형식은 이유를 알려줌"] },
        { id: "req_002", title: "업로드된 녹음을 텍스트로 바꿔야 함", status: "not_started", criteria: ["변환 중 진행 상태 표시", "변환 실패 시 재시도 가능"] },
        { id: "req_003", title: "회의 내용을 요약해야 함", status: "not_started", criteria: ["결정사항과 할 일이 구분되어 보임", "원문 근거 확인 가능"] },
        { id: "req_004", title: "할 일을 자동으로 추출해야 함", status: "not_started", criteria: ["추출된 할 일이 목록으로 보임"] },
        { id: "req_005", title: "추출된 할 일을 수정·삭제할 수 있어야 함", status: "not_started", criteria: ["텍스트 수정 가능", "항목 삭제 가능"] },
        { id: "req_006", title: "확인한 할 일만 Linear로 보내야 함", status: "not_started", criteria: ["체크한 항목만 전송", "전송 후 Linear 링크 표시"] },
        { id: "req_007", title: "다른 사용자의 회의록은 볼 수 없어야 함", status: "not_started", criteria: ["본인 회의록만 접근 가능"] },
        { id: "req_008", title: "처리 실패 시 다시 시도할 수 있어야 함", status: "not_started", criteria: ["오류 메시지와 재시도 버튼 표시"] },
      ],
      warnings: ["임시 초안입니다. 다시 시도하면 더 맞춤형 결과를 받을 수 있습니다."],
    };
  }

  const shortIdea = req.idea.slice(0, 30).trim();
  return {
    ok: true,
    source: "mock-fallback",
    understood: {
      summary: `이 제품은 ${shortIdea}을(를) 처리하는 앱입니다.`,
      targetUsers: ["일반 사용자", "업무 효율을 높이고 싶은 팀"],
      mainFlow: ["데이터 입력", "자동 처리", "결과 확인", "외부 도구로 전송"],
    },
    questions: [
      {
        id: "q1",
        question: "처리 결과를 사용자가 검토한 뒤 최종 확인하는 단계가 필요할까요?",
        recommendation: "확인 후 진행",
        reason: "자동 처리 결과를 한 번 검토하면 오류로 인한 문제를 줄일 수 있습니다.",
        options: ["확인 후 진행", "자동으로 진행"],
        allowCustom: true,
        allowLater: true,
      },
      {
        id: "q2",
        question: "처리된 데이터는 얼마나 보관해야 하나요?",
        recommendation: "처리 후 삭제",
        reason: "불필요한 데이터를 줄이면 보안 위험이 낮아집니다.",
        options: ["처리 후 삭제", "일정 기간 보관", "영구 보관"],
        allowCustom: false,
        allowLater: true,
      },
    ],
    productSpec: {
      productName: shortIdea,
      oneLine: req.idea.slice(0, 60),
      targetUsers: ["일반 사용자"],
      problem: "사용자가 제시한 문제를 해결합니다.",
      included: ["핵심 기능 구현", "결과 확인 화면"],
      excluded: ["초기 버전에서 제외된 부가 기능"],
      userFlow: ["1. 입력", "2. 처리", "3. 확인"],
      decisions: [],
      openQuestions: ["구체적인 기능 범위 결정 필요"],
    },
    items: [
      { id: "req_001", title: "핵심 기능을 사용할 수 있어야 함", status: "not_started", criteria: ["주요 동작이 정상 작동함"] },
      { id: "req_002", title: "처리 결과를 확인할 수 있어야 함", status: "not_started", criteria: ["결과 화면이 표시됨"] },
      { id: "req_003", title: "오류 발생 시 다시 시도할 수 있어야 함", status: "not_started", criteria: ["오류 메시지와 재시도 버튼 표시"] },
    ],
    warnings: ["임시 초안입니다. 다시 시도하면 더 맞춤형 결과를 받을 수 있습니다."],
  };
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export async function generateIdeaToSpecDraft(
  req: IdeaToSpecDraftRequest,
  anthropicApiKey: string | undefined,
): Promise<IdeaToSpecDraftResponse> {
  if (!req.idea?.trim()) {
    return { ...buildMockFallback(req), warnings: ["아이디어를 입력해주세요."] };
  }
  if (!anthropicApiKey) {
    console.warn("[workspace/generate] ANTHROPIC_API_KEY not set — using mock fallback");
    return buildMockFallback(req);
  }

  const prompt = buildPrompt(req);
  let rawText = "";
  try {
    rawText = await callAnthropic(anthropicApiKey, prompt);
  } catch (err) {
    console.error("[workspace/generate] LLM call failed:", err);
    return buildMockFallback(req);
  }

  // Extract JSON — LLM sometimes wraps in code fences despite instructions
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn("[workspace/generate] LLM returned non-JSON, falling back");
    return buildMockFallback(req);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    console.warn("[workspace/generate] JSON parse failed, falling back");
    return buildMockFallback(req);
  }

  if (!isValidResponse(parsed)) {
    console.warn("[workspace/generate] Response failed shape validation, falling back");
    return buildMockFallback(req);
  }

  // Ensure all items have status: "not_started"
  const data = parsed as Omit<IdeaToSpecDraftResponse, "ok" | "source">;
  data.items = data.items.map((item) => ({ ...item, status: "not_started" as const }));

  return { ok: true, source: "llm", ...data };
}

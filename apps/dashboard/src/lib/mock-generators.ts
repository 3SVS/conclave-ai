import type { Understanding, GeneratedSpec } from "./workflow-store";
import type { RequirementItem } from "./mock-data";

const MEETING_KEYWORDS = ["회의", "녹음", "요약", "linear", "할 일", "미팅", "회의록"];

function isMeetingIdea(idea: string): boolean {
  const lower = idea.toLowerCase();
  return MEETING_KEYWORDS.some((k) => lower.includes(k));
}

// ─── Understanding ────────────────────────────────────────────────────────────

export function generateUnderstanding(idea: string): Understanding {
  if (isMeetingIdea(idea)) {
    return {
      summary:
        "이 제품은 회의 녹음 파일을 업로드하면 자동으로 회의 내용을 요약하고, 할 일을 뽑아 업무 도구로 보내는 앱입니다.",
      targetUsers: [
        "회의가 많은 팀",
        "회의 후 액션아이템 정리가 필요한 PM·운영자",
        "Linear를 쓰는 스타트업 팀",
      ],
      mainFlow: [
        "회의 녹음 파일 업로드",
        "자동 텍스트 변환 (STT)",
        "회의 요약 생성",
        "할 일 자동 추출",
        "사용자 확인 후 Linear로 전송",
      ],
    };
  }
  return {
    summary: `이 제품은 ${idea.slice(0, 40)}... 을 처리하는 앱입니다.`,
    targetUsers: ["일반 사용자", "업무 효율을 높이고 싶은 팀"],
    mainFlow: ["데이터 입력", "자동 처리", "결과 확인", "외부 도구로 전송"],
  };
}

// ─── Questions ────────────────────────────────────────────────────────────────

export type AdaptiveQuestion = {
  id: string;
  question: string;
  whyItMatters: string;
  recommendation: string;
  recommendationReason: string;
  options: Array<{ id: string; label: string; value: string }>;
};

export function generateQuestions(idea: string): AdaptiveQuestion[] {
  if (isMeetingIdea(idea)) {
    return [
      {
        id: "q1",
        question: "Linear로 보내기 전에 사용자가 확인하는 단계가 필요할까요?",
        whyItMatters:
          "잘못 추출된 할 일이 실제 업무 시스템에 바로 들어가면 혼란이 생길 수 있습니다.",
        recommendation: "확인 후 보내기",
        recommendationReason:
          "사용자가 한 번 검토하면 잘못된 할 일이 팀 시스템에 들어가는 걸 막을 수 있습니다.",
        options: [
          { id: "q1_a", label: "확인 후 보내기", value: "confirm_before_send" },
          { id: "q1_b", label: "자동으로 보내기", value: "auto_send" },
          { id: "q1_c", label: "나중에 정하기", value: "defer" },
        ],
      },
      {
        id: "q2",
        question: "회의 녹음 원본 파일은 저장해야 하나요, 요약 후 삭제해야 하나요?",
        whyItMatters:
          "개인정보·보안 규정과 저장 비용에 영향을 줍니다. 사내 회의 내용이 담긴 파일은 민감할 수 있습니다.",
        recommendation: "요약 후 삭제",
        recommendationReason: "불필요한 데이터를 쌓지 않으면 보안 위험과 스토리지 비용이 줄어듭니다.",
        options: [
          { id: "q2_a", label: "요약 후 삭제", value: "delete_after" },
          { id: "q2_b", label: "일정 기간 보관", value: "keep_period" },
          { id: "q2_c", label: "영구 보관", value: "keep_forever" },
          { id: "q2_d", label: "나중에 정하기", value: "defer" },
        ],
      },
      {
        id: "q3",
        question: "참석자별 발언자를 구분해야 하나요?",
        whyItMatters:
          "발화자 구분(화자 분리)은 STT 비용과 정확도에 영향을 미칩니다.",
        recommendation: "초기 버전에서는 구분 없이 시작",
        recommendationReason:
          "화자 분리는 추가 처리 비용이 높습니다. 우선 핵심 흐름을 검증한 뒤 추가하는 게 안전합니다.",
        options: [
          { id: "q3_a", label: "구분 없이 전체 요약", value: "no_speaker" },
          { id: "q3_b", label: "화자 구분 포함", value: "with_speaker" },
          { id: "q3_c", label: "나중에 정하기", value: "defer" },
        ],
      },
      {
        id: "q4",
        question: "할 일에 담당자와 마감일도 포함해야 하나요?",
        whyItMatters: "Linear 이슈 생성 시 담당자·마감일을 자동으로 채우면 편리하지만, 오탐률이 높아집니다.",
        recommendation: "선택적으로 입력 가능하게",
        recommendationReason:
          "AI가 추론한 담당자가 틀릴 수 있습니다. 자동 추출은 제안으로만 보여주고 사용자가 수정할 수 있게 하는 게 안전합니다.",
        options: [
          { id: "q4_a", label: "제목만 추출", value: "title_only" },
          { id: "q4_b", label: "담당자·마감일 포함 (AI 추론)", value: "with_meta_ai" },
          { id: "q4_c", label: "사용자가 직접 입력", value: "user_input" },
          { id: "q4_d", label: "나중에 정하기", value: "defer" },
        ],
      },
      {
        id: "q5",
        question: "잘못 추출된 할 일을 사용자가 수정할 수 있어야 하나요?",
        whyItMatters: "AI가 추출한 할 일이 100% 정확하지 않습니다. 수정 기능이 없으면 사용자 불만이 생깁니다.",
        recommendation: "수정 가능하게",
        recommendationReason:
          "확인 단계에서 간단히 수정할 수 있으면 신뢰도가 높아지고 오탐에 대한 부담이 줄어듭니다.",
        options: [
          { id: "q5_a", label: "수정 가능", value: "editable" },
          { id: "q5_b", label: "삭제만 가능", value: "delete_only" },
          { id: "q5_c", label: "수정 불가", value: "readonly" },
        ],
      },
    ];
  }

  return [
    {
      id: "q1",
      question: "사용자가 결과를 외부 서비스로 내보낼 수 있어야 하나요?",
      whyItMatters: "연동 범위에 따라 구현 복잡도가 크게 달라집니다.",
      recommendation: "초기에는 1개 서비스만",
      recommendationReason: "우선 핵심 기능을 완성한 뒤 연동을 늘리는 게 안전합니다.",
      options: [
        { id: "q1_a", label: "1개 서비스 연동", value: "one" },
        { id: "q1_b", label: "여러 서비스 연동", value: "multi" },
        { id: "q1_c", label: "나중에 정하기", value: "defer" },
      ],
    },
    {
      id: "q2",
      question: "처리 결과를 사용자가 수정할 수 있어야 하나요?",
      whyItMatters: "AI 결과가 항상 완벽하지 않으므로 수정 기능이 신뢰도를 높입니다.",
      recommendation: "수정 가능하게",
      recommendationReason: "수정 기능이 있으면 오탐에 대한 부담이 줄어듭니다.",
      options: [
        { id: "q2_a", label: "수정 가능", value: "editable" },
        { id: "q2_b", label: "읽기 전용", value: "readonly" },
        { id: "q2_c", label: "나중에 정하기", value: "defer" },
      ],
    },
    {
      id: "q3",
      question: "데이터를 얼마나 보관해야 하나요?",
      whyItMatters: "보관 기간은 스토리지 비용과 개인정보 정책에 영향을 줍니다.",
      recommendation: "처리 후 삭제",
      recommendationReason: "불필요한 데이터를 줄이면 보안 위험이 낮아집니다.",
      options: [
        { id: "q3_a", label: "처리 후 삭제", value: "delete" },
        { id: "q3_b", label: "일정 기간 보관", value: "period" },
        { id: "q3_c", label: "나중에 정하기", value: "defer" },
      ],
    },
  ];
}

// ─── Spec ─────────────────────────────────────────────────────────────────────

export function generateSpec(
  idea: string,
  answers: Record<string, string>,
): GeneratedSpec {
  const confirmSend = answers["q1"] === "confirm_before_send" || answers["q1"] === "defer";
  const deleteAfter = answers["q2"] === "delete_after" || answers["q2"] === "defer";
  const editable = answers["q5"] === "editable" || answers["q5"] === undefined;

  if (isMeetingIdea(idea)) {
    return {
      productName: "회의록 자동 요약 앱",
      tagline: "회의를 녹음하면 요약과 할 일이 자동으로 정리됩니다",
      targetUser: "회의가 많고 회의 후 액션아이템 정리가 번거로운 팀 (PM, 운영자, 스타트업 팀)",
      problem:
        "회의 후 내용 정리와 할 일 분배에 시간이 많이 걸리고, 빠뜨리는 항목이 생깁니다.",
      included: [
        "mp3, m4a, wav 녹음 파일 업로드",
        "자동 텍스트 변환 (STT)",
        "회의 요약 생성 (결정사항 + 할 일 분리)",
        "할 일 자동 추출",
        editable ? "추출된 할 일 수정·삭제" : "추출된 할 일 확인",
        confirmSend ? "사용자 확인 후 Linear로 전송" : "Linear 자동 전송",
        deleteAfter ? "요약 완료 후 원본 파일 자동 삭제" : "원본 파일 일정 기간 보관",
      ],
      excluded: [
        "실시간 회의 녹음",
        "화상 회의 연동",
        "한국어 외 다국어 지원 (초기 버전)",
        "화자 구분 (초기 버전)",
      ],
      userFlows: [
        "1. 회의 녹음 파일 업로드",
        "2. 텍스트 변환 진행 (상태 표시)",
        "3. 요약 + 할 일 목록 확인",
        editable ? "4. 할 일 수정 또는 삭제" : "4. 할 일 확인",
        confirmSend ? "5. Linear로 보낼 항목 선택 후 전송" : "5. Linear 자동 전송",
      ],
      decisions: [
        confirmSend ? "사용자가 확인한 뒤 Linear로 전송" : "처리 완료 시 자동 Linear 전송",
        deleteAfter ? "요약 완료 후 원본 파일 삭제" : "원본 파일 보관",
        editable ? "할 일 수정·삭제 가능" : "할 일 읽기 전용",
      ],
      openDecisions: [
        "파일 크기 상한선 (예: 500MB)",
        "STT 서비스 선택 (Whisper / Google / Clova)",
        "Linear 외 다른 도구 연동 시점",
      ],
    };
  }

  return {
    productName: idea.slice(0, 20).trim(),
    tagline: idea.slice(0, 50).trim(),
    targetUser: "일반 사용자",
    problem: "사용자가 제시한 문제를 해결합니다.",
    included: ["핵심 기능 A", "핵심 기능 B"],
    excluded: ["초기 버전에서 제외된 기능"],
    userFlows: ["1. 데이터 입력", "2. 처리", "3. 결과 확인"],
    decisions: [],
    openDecisions: ["구체적인 기능 범위"],
  };
}

// ─── Requirements ─────────────────────────────────────────────────────────────

export function generateRequirements(
  idea: string,
  answers: Record<string, string>,
): RequirementItem[] {
  const editable = answers["q5"] === "editable" || answers["q5"] === undefined;
  const confirmSend = answers["q1"] === "confirm_before_send" || answers["q1"] === "defer";

  if (isMeetingIdea(idea)) {
    return [
      {
        id: "req_001",
        title: "회의 녹음 파일을 올릴 수 있어야 함",
        status: "not_started",
        category: "feature",
        priority: "must",
        evidence: undefined,
        suggestedAction: undefined,
      },
      {
        id: "req_002",
        title: "업로드한 녹음을 텍스트로 바꿔야 함",
        status: "not_started",
        category: "feature",
        priority: "must",
      },
      {
        id: "req_003",
        title: "회의 요약을 결정사항과 할 일로 나눠서 보여줘야 함",
        status: "not_started",
        category: "feature",
        priority: "must",
      },
      {
        id: "req_004",
        title: "할 일을 자동으로 뽑아야 함",
        status: "not_started",
        category: "feature",
        priority: "must",
      },
      ...(editable
        ? [
            {
              id: "req_005",
              title: "사용자가 뽑힌 할 일을 수정하거나 지울 수 있어야 함",
              status: "not_started" as const,
              category: "feature",
              priority: "must" as const,
            },
          ]
        : []),
      {
        id: "req_006",
        title: confirmSend
          ? "사용자가 확인한 할 일만 Linear로 보내야 함"
          : "처리된 할 일을 자동으로 Linear로 보내야 함",
        status: "not_started",
        category: "integration",
        priority: "must",
      },
      {
        id: "req_007",
        title: "다른 사용자의 회의록은 볼 수 없어야 함",
        status: "not_started",
        category: "permission",
        priority: "must",
      },
      {
        id: "req_008",
        title: "처리 중 진행 상황을 보여줘야 함",
        status: "not_started",
        category: "ui_state",
        priority: "should",
      },
      {
        id: "req_009",
        title: "처리 실패 시 다시 시도할 수 있어야 함",
        status: "not_started",
        category: "error_state",
        priority: "must",
      },
    ];
  }

  return [
    {
      id: "req_001",
      title: "Core feature works end to end",
      status: "not_started",
      category: "feature",
      priority: "must",
    },
    {
      id: "req_002",
      title: "Result is visible to the user",
      status: "not_started",
      category: "feature",
      priority: "must",
    },
    {
      id: "req_003",
      title: "Failures can be retried",
      status: "not_started",
      category: "error_state",
      priority: "must",
    },
  ];
}

export const ACCEPTANCE_CRITERIA: Record<string, string[]> = {
  req_001: [
    "mp3, m4a, wav 파일을 올릴 수 있음",
    "지원하지 않는 파일 형식은 이유를 알려줌",
    "업로드 중 진행 상태가 표시됨",
  ],
  req_002: [
    "업로드 후 자동으로 변환이 시작됨",
    "변환 완료 시 텍스트 전문을 확인할 수 있음",
    "변환 실패 시 오류 메시지와 재시도 버튼이 보임",
  ],
  req_003: [
    "결정사항 섹션과 할 일 섹션이 구분되어 보임",
    "각 항목에 원문 근거를 확인할 수 있음",
  ],
  req_004: [
    "회의 내용에서 할 일 항목이 자동으로 추출됨",
    "추출된 할 일 목록이 카드 형태로 보임",
  ],
  req_005: [
    "할 일 텍스트를 직접 수정할 수 있음",
    "불필요한 항목을 삭제할 수 있음",
    "수정 내역이 저장됨",
  ],
  req_006: [
    "체크한 항목만 Linear로 전송됨",
    "전송 완료 후 Linear 이슈 링크를 보여줌",
    "전송 실패 시 재시도할 수 있음",
  ],
  req_007: [
    "다른 사용자의 프로젝트 목록이 보이지 않음",
    "직접 URL을 입력해도 다른 사용자의 데이터에 접근 불가",
  ],
  req_008: [
    "업로드 → 변환 → 요약 단계별 진행 상태가 표시됨",
    "각 단계 소요 시간 예상치를 보여줌",
  ],
  req_009: [
    "오류 발생 시 재시도 버튼이 표시됨",
    "재시도는 최대 3회까지 가능함",
  ],
};

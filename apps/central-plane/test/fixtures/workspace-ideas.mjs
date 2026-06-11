/**
 * QA fixture ideas for workspace generation quality tests.
 * 8 diverse product ideas covering different domains.
 * Used by both mock-based and (when API key available) LLM-based tests.
 */

export const workspaceIdeaFixtures = [
  {
    id: "meeting-summary-linear",
    idea: "회의 녹음 파일을 올리면 자동으로 요약하고, 할 일을 뽑아서 Linear로 보내주는 앱",
    expectedKeywords: ["회의", "요약", "할 일", "Linear"],
    minItems: 6,
  },
  {
    id: "mentoring-scheduler",
    idea: "멘토가 가능한 시간을 열어두면 멘티가 신청하고, 승인되면 결제까지 이어지는 멘토링 예약 플랫폼",
    expectedKeywords: ["멘토", "멘티", "예약", "승인"],
    minItems: 5,
  },
  {
    id: "battery-safety-monitor",
    idea: "전기차 배터리 열폭주 위험을 센서 데이터로 감지하고 관리자에게 경고하는 모니터링 대시보드",
    expectedKeywords: ["배터리", "위험", "센서", "경고"],
    minItems: 5,
  },
  {
    id: "local-class-booking",
    idea: "동네 공방이나 클래스 운영자가 수업을 열고 사람들이 예약할 수 있는 클래스 예약 앱",
    expectedKeywords: ["클래스", "예약", "운영자"],
    minItems: 5,
  },
  {
    id: "b2b-quote-crm",
    idea: "B2B 고객이 견적 요청을 남기면 영업팀이 상태를 관리하고 후속 연락을 기록하는 CRM",
    expectedKeywords: ["견적", "영업", "고객", "상태"],
    minItems: 5,
  },
  {
    id: "ai-blog-writer",
    idea: "키워드를 입력하면 블로그 초안을 만들고, 사람이 수정한 뒤 발행 예약까지 할 수 있는 AI 글쓰기 도구",
    expectedKeywords: ["키워드", "초안", "수정", "발행"],
    minItems: 5,
  },
  {
    id: "clinic-reminder",
    idea: "병원 예약 환자에게 방문 전 알림을 보내고, 노쇼 위험을 줄이는 예약 리마인더 서비스",
    expectedKeywords: ["병원", "예약", "알림", "노쇼"],
    minItems: 5,
  },
  {
    id: "startup-investor-match",
    idea: "스타트업이 투자자에게 보낼 소개 자료를 정리하고, 관심 투자자를 찾아 매칭해주는 플랫폼",
    expectedKeywords: ["스타트업", "투자자", "소개", "매칭"],
    minItems: 5,
  },
];

/** Developer terms that must NOT appear in user-facing output */
export const BANNED_USER_FACING_TERMS = [
  "PRD",
  "Requirement",
  "Acceptance Criteria",
  "Acceptance Matrix",
  "FAIL",
  "INCONCLUSIVE",
  "NEEDS_DECISION",
  "Autofix",
  "Evidence",
];

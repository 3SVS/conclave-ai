# Stage 7 — 기존 Conclave job과 연결

## 목표

시각적 workspace의 항목 카드와 기존 Conclave review/audit/autofix job을 연결한다.

## 구현 범위

- 기존 `/saas/review`, `/saas/autofix` 또는 equivalent job 경로 확인
- job result를 RequirementCard/CheckResult와 연결
- PR comment에는 요약과 앱 링크만 표시
- 전체 결과는 앱의 확인 결과 화면에서 보여줌

## 제외 범위

- 새로운 대규모 orchestration engine
- 완전 자동 merge
- unlimited autofix loop

## 완료 조건

- 앱에서 검증 job 시작 가능
- job 결과가 항목별 확인 결과로 표시 가능
- 실패 항목에서 고쳐보기로 이동 가능
- 기존 CLI/PR 중심 UX를 보조 채널로 낮춤

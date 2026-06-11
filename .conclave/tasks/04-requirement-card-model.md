# Stage 4 — 꼭 들어가야 할 항목 카드

## 목표

제품 설명서에서 “꼭 들어가야 할 항목” 카드를 만들고 상태를 관리한다.

## 사용자 표현

```text
꼭 들어가야 할 것
완성 기준
확인 방법
상태
```

## 내부 모델

RequirementCard는 다음을 포함한다.

```text
id
title
plainText
category
priority
status
acceptanceChecks
lastResult
```

## 상태

```text
not_started → building → implemented → passed
implemented → failed
implemented → inconclusive
any → needs_decision
any → accepted_risk
```

## 완료 조건

- 제품 설명서에서 항목 카드 생성 가능
- 항목 상태 변경 가능
- 항목별 완성 기준/확인 방법 표시 가능
- 상태 label이 일반 유저용 한국어로 표시됨

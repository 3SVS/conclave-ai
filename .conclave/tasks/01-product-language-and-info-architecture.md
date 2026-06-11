# Stage 1 — 일반 유저용 언어와 정보 구조

## 목표

Conclave 앱의 새 workspace에서 사용할 사용자용 언어, 상태, 정보 구조를 정의한다.

## 구현 범위

- 사용자용 상태 label 정의
- 내부 enum과 화면 label 분리
- 개발자 용어 → 일반 유저 용어 mapping
- workspace navigation 구조 정의
- 필요한 경우 shared constants/types 추가

## 사용자에게 보여줄 상태

```text
통과
안 맞음
확인 부족
결정 필요
위험 감수
```

## 제외 범위

- LLM 질문 생성 구현
- 실제 PR 검증 실행
- autofix 실행
- DB migration 대규모 변경

## 완료 조건

- UI/도메인 타입이 존재함
- 상태 label mapping 테스트가 있음
- 주요 화면에서 쓸 수 있는 navigation copy가 정의됨

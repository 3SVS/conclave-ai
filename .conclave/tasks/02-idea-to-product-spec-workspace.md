# Stage 2 — 아이디어 입력과 제품 설명서 초안

## 목표

사용자가 raw idea를 입력하고, Conclave가 이해한 내용을 보여준 뒤, 제품 설명서 초안을 만들 수 있게 한다.

## 사용자 흐름

```text
아이디어 입력
→ Conclave가 이해한 내용
→ 사용자가 수정/확인
→ 제품 설명서 초안 생성
```

## 구현 범위

- raw idea 입력 UI
- 이해한 내용 preview UI
- 제품 설명서 draft UI
- mock 또는 deterministic parser 가능
- 저장 모델은 Stage 0 결과에 따라 결정

## 제외 범위

- 고급 LLM 질문 생성
- PR 연결
- 실제 검증 실행
- 자동수정

## 완료 조건

- 사용자가 아이디어를 입력할 수 있음
- 이해한 내용이 화면에 표시됨
- 제품 설명서 초안이 생성/표시됨
- 기본 테스트 또는 Story/fixture가 있음

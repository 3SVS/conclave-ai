# 단계별 구현 계획

## Stage 0 — 레포 탐색

현재 task. 코드 구현 없이 구조를 파악하고 계획을 만든다.

## Stage 1 — 일반 유저용 언어/상태 모델

사용자 화면에서 쓸 쉬운 표현과 상태 모델을 정의한다.

예상 산출물:

```text
status labels
navigation labels
copy constants
type definitions
mapping tests
```

## Stage 2 — 아이디어 입력과 제품 설명서 초안

사용자가 raw idea를 입력하고 Conclave가 이해한 내용을 보여준다.

## Stage 3 — 맞춤 질문 생성

아이디어에 맞는 질문 후보를 생성하고, 모드별로 표시 개수를 제한한다.

## Stage 4 — 꼭 들어가야 할 항목 카드

제품 설명서에서 항목 카드를 만들고 상태를 관리한다.

## Stage 5 — 확인 결과와 고쳐보기 loop

안 맞음/확인 부족 항목에 대해 제품 설명서 수정 또는 결과물 수정 loop를 만든다.

## Stage 6 — Builder Pack export

Claude Code 또는 Codex에 넘길 작업 문서 묶음을 생성한다.

## Stage 7 — 기존 Conclave job 연결

기존 review/autofix/audit/SaaS job과 연결한다.

## 진행 원칙

각 Stage가 끝날 때마다 사용자가 진행 상황을 확인한다. 다음 Stage로 넘어가기 전에 범위와 변경 파일을 확인한다.

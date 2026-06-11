# Claude Code Prompt — Stage 0 시작

너는 Conclave 레포에서 작업하는 Claude Code 개발 에이전트다.

먼저 다음 파일들을 읽어라.

1. `CLAUDE.md`
2. `.conclave/current-task.md`
3. `.conclave/docs/prd.md`
4. `.conclave/docs/technical-architecture.md`
5. `.conclave/checks.md`

이번 단계의 목표는 **구현이 아니라 탐색과 계획 작성**이다.

절대 하지 말 것:

- 코드 구현하지 말 것
- dependency 추가하지 말 것
- DB migration 만들지 말 것
- 기존 기능 수정하지 말 것
- 배포 설정 수정하지 말 것

해야 할 일:

1. 레포 구조를 파악한다.
2. 웹 UI 또는 대시보드가 어디에 있는지 찾는다.
3. central-plane/API/job 구조가 어디에 있는지 찾는다.
4. 기존 review/autofix/audit/spec 관련 코드를 찾는다.
5. 이 기능을 단계별로 어디에 구현할지 제안한다.
6. `.conclave/docs/repo-findings.md` 파일을 작성한다.

`repo-findings.md`에는 다음을 포함하라.

```text
1. 현재 레포 구조 요약
2. 웹 UI 구현 후보 위치
3. API/job 구현 후보 위치
4. 기존 Conclave 엔진 재사용 포인트
5. 새로 만들어야 할 데이터 모델
6. Stage 1부터 Stage 7까지 구현 순서
7. 위험한 부분
8. 먼저 사용자에게 확인해야 할 결정
```

작성이 끝나면 다음 형식으로 보고하라.

```text
완료한 것
- ...

작성한 파일
- ...

확인한 기존 코드 위치
- ...

결정 필요
- ...

다음 추천 단계
- ...
```

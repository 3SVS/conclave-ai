# Stage 6 — Claude/Codex용 Builder Pack Export

## 목표

제품 설명서와 꼭 들어가야 할 항목을 Claude Code 또는 Codex가 실행하기 좋은 작업 문서로 내보낸다.

## Builder Pack 구성

```text
PRODUCT.md          사람용 제품 설명서
CURRENT_TASK.md     이번에 만들 기능 하나
CHECKLIST.md        완성 기준
TEST_PLAN.md        확인 방법
DECISIONS.md        사용자가 결정한 것
OUT_OF_SCOPE.md     이번에 하지 않을 것
FIX_PROMPT.md       실패 시 다시 고치기 지시문
```

## 중요한 원칙

- 전체 제품을 한 번에 구현시키지 않는다.
- 기능 하나당 작업 문서 하나를 만든다.
- out-of-scope를 명확히 적는다.
- 완료 기준과 확인 방법을 반드시 포함한다.
- 실패한 항목을 다시 고칠 때는 해당 항목의 확인 근거를 포함한다.

## 완료 조건

- Builder Pack export 가능
- Claude Code용 prompt 생성 가능
- Codex용 AGENTS.md compatible prompt 생성 가능
- failed/inconclusive 항목에서 fix prompt 생성 가능

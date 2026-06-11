# Claude Code Prompt — 선택한 Stage 구현

다음 Stage를 구현하라: `<STAGE_NAME>`

반드시 먼저 읽을 파일:

- `CLAUDE.md`
- `.conclave/docs/repo-findings.md`
- `.conclave/tasks/<STAGE_FILE>.md`
- `.conclave/checks.md`

작업 방식:

1. 관련 기존 코드를 탐색한다.
2. 구현 계획을 짧게 작성한다.
3. 범위가 현재 Stage를 넘으면 멈추고 질문한다.
4. 구현한다.
5. 관련 테스트를 추가하거나 업데이트한다.
6. 가능한 typecheck/test/lint를 실행한다.
7. 완료 보고를 작성한다.

주의:

- 사용자 화면에는 쉬운 한국어 label을 사용한다.
- 내부 enum과 사용자 label을 분리한다.
- LLM 호출이 필요한 곳은 interface와 fallback/mock을 먼저 만든다.
- 자동수정 loop는 최대 2회 제한을 유지한다.

완료 보고 형식:

```text
완료한 것
- ...

변경한 파일
- ...

실행한 확인
- ...

통과한 완성 기준
- ...

남은 위험 / 확인 부족
- ...

다음 추천 단계
- ...
```

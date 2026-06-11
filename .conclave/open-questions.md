# Open Questions

Stage 0 탐색 후 답해야 할 질문들이다. Claude Code는 추측하지 말고 실제 레포를 보고 정리해야 한다.

1. 현재 Conclave의 웹 대시보드는 어느 앱에 있는가?
2. 일반 유저용 workspace를 기존 web app에 추가할 수 있는가, 아니면 새 app이 필요한가?
3. 현재 DB/D1 schema에 project, user, job 모델이 있는가?
4. product idea, question, product spec, requirement card, check result를 저장할 위치가 있는가?
5. 기존 `/saas/review`와 `/saas/autofix` job 모델을 재사용할 수 있는가?
6. 기존 PRD parsing 또는 `audit --spec` 로직이 재사용 가능한가?
7. LLM 호출은 central-plane에서 해야 하는가, container job에서 해야 하는가, CLI에서 해야 하는가?
8. 초기 MVP에서 GitHub 연결이 필수인가, 아니면 idea → product spec → builder pack export만 먼저 가능한가?
9. 사용자 인증은 이미 있는가?
10. 사용자가 만든 제품 설명서와 질문 답변을 어디에 저장할 것인가?

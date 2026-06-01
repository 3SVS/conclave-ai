# Conclave AI — 포지셔닝 & 랜딩 히어로 (scope-drift 각도)

> 목적: "AI 코드리뷰"라는 레드오션 용어를 버리고, 거인(CodeRabbit·Greptile·Cursor BugBot·Claude Code Review)이 안 앞세우는 **"AI가 스펙대로 짰는지"** 축을 선점한다.

## 한 줄 (택1, A 권장)
- **A.** "Your AI shipped code that runs. Conclave checks it's the code you actually asked for." — PR마다 PRD 대비 **스코프 이탈**을 잡는 리뷰 게이트.
- **B.** "The PR review that reads your spec, not just your diff."
- **C.** "AI writes fast. Conclave makes sure it didn't drift from the plan."

## 카테고리 워딩
범용 "AI code review" 대신 → **"PRD conformance gate" / "AI scope-drift guard"**. 거인과 같은 키워드로 안 싸운다.

## ICP (하나만)
빠르게 찍어내는 **AI-바이브코더 / 인디 팀** (Cursor·Claude Code·Copilot로 Next.js 류를 양산). 통증: AI가 "돌아가지만 시킨 게 아닌" 코드를 머지함 — 스펙 드리프트, 빠진 엣지케이스, 조용한 보안 갭.

## 왜 지금 (타이밍)
자율 코딩(Cursor·Claude Code·LazyCodex)이 퍼질수록 **사람 리뷰는 줄고 AI가 만든 PR은 폭증** → 스펙 이탈이 그대로 머지됨. Conclave의 수요 곡선이 곧 이 추세다.

## 메시징 3기둥
1. **스펙 대비 검사** — PRD를 붙이면 단일 LLM이 못 잡는 스코프 이탈·스펙 불일치를 잡는다. (diff만 보는 도구와의 차별점)
2. **3모델 council = 깊이** — 한 모델이 "사소하다"고 넘긴 걸 다른 모델이 잡는다. [자체 dogfood: PR당 평균 블로커 10.93 vs 단일 3.80, 같은 catch rate에 3× depth — n=15, 지표성·비peer-reviewed]
3. **PR 레이어, 머지 게이트** — IDE 어시스턴트 대체가 아니라, 머지 직전 마지막 방어선. autofix 워커 + merge/reject 학습.

## 랜딩 히어로 카피 (교체용)

**Eyebrow:** PRD-aware PR review · GitHub App
**H1:** Your AI built it. Did it build what you asked?
**Sub:** Conclave runs a council of three frontier models on every PR — and against your PRD — to catch the scope drift, missing edge cases, and silent security gaps a single reviewer waves through.
**CTA1:** Install the GitHub App  **CTA2:** See it catch a real drift (demo)
**Trust line:** Free on public repos · Self-hostable (FSL) · Reviews against your spec, not just your diff

**3-up (히어로 아래):**
- **Reads your spec.** PRD 붙이면 "요청 안 한 것/빠뜨린 것"을 PR마다 플래그.
- **Three models, one verdict.** 이종 모델 다양성으로 단일 LLM 사각지대 커버.
- **Gate, then fix.** 블로커는 머지 차단, 워커가 autofix, 결과로 학습.

## 안 할 것 (팩트 가드)
- 고객 로고·매출·펀딩 등 없는 것 포장 금지.
- 벤치 수치는 항상 "자체 dogfood, 지표성" 캐비엇과 함께. peer-reviewed인 척 금지.

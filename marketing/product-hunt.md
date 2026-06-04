# Product Hunt 런치 키트 (English)

> ⚠️ 올리기 전 본인 목소리로 한 번 손보세요. Reddit이 "low effort + AI generated"로 막았다는 건 카피가 AI 티가 난다는 신호. PH/HN/Reddit는 제너릭 마케팅 문구를 싫어합니다. 아래는 구체 디테일·1인칭 위주로 썼지만, 한두 문장 본인 경험으로 바꾸면 통과율↑.

---

## Name
Conclave AI

## Tagline (≤ 60 chars) — 택1
- **A.** Drop a PRD. Every PR auto-reviews against your spec ← 추천
- **B.** PR review that reads your spec, not just the diff
- **C.** Catches scope drift the diff doesn't show — automatically

## Description (≤ 260 chars)
Drop a .conclave/prd.md and every PR is automatically reviewed against your spec — catching scope drift, missing requirements, and unauthorized changes. Three frontier models, one verdict, autofix included. Free on public repos.

## Topics
Developer Tools · GitHub · Artificial Intelligence · Code Review · SaaS

---

## Maker's first comment (가장 중요 — 여기서 전환)

Hey PH 👋 I'm Seunghun, solo on this.

I ship almost everything with agents now, and I kept rubber-stamping PRs that *ran fine* but weren't what I'd asked for — an extra field nobody wanted, a requirement quietly dropped, an auth check that drifted from the server into the UI. Nothing in the diff was wrong, so my single-model reviewer had nothing to say. It only looked wrong next to the spec.

So Conclave runs three models as a council on each PR (they actually disagree, then I get one verdict), and if you attach a PRD it flags that scope drift directly. There's an autofix worker, and it learns from what I merge vs reject.

I dogfooded 15 synthetic-bug PRs across 5 Next.js templates: same catch rate as one model, but ~3× the blockers surfaced (10.93 vs 3.80/PR). The extras were boring-but-real — missing tests, edge cases, a string-concat query. (It's an n=15 internal run, indicative, protocol's in /benchmarks — please try to break it.)

It's not a Cursor/Copilot replacement. It sits at the PR layer as a merge gate. Free on public repos, self-hostable (FSL).

Two things I genuinely want PH's read on:
1. Does "review against the spec" matter to you, or do specs go stale too fast?
2. With Anthropic's own Claude Code Review now live, is a 3-model council differentiated enough?

I'm here all day — point me at a public PR and I'll post what it catches.

---

## Gallery — 실제 파일 (marketing/assets/, 이 순서로 업로드)
1. `ph-01-hero.png` — 썸네일. "Your AI built it. Did it build what you asked?"
2. `ph-04-pr-comment.png` — **실제 PR 코멘트**(verdict: REWORK, 블로커 1번이 [spec-mismatch]). 킬러 컷.
3. `ph-02-scopedrift.png` — 스코프 이탈 메시지 카드.
4. `ph-03-benchmark.png` — 10.93 vs 3.80 스탯.
5. `02-terminal-demo.png` — (apps/landing/public/screenshots/) 실제 CLI 데모 스샷.
6. **Video (PH 갤러리 영상 링크)**: ✅ YouTube 업로드 완료 (Unlisted) → **https://youtu.be/mg7j07eVR0c** — PH 갤러리에 이 링크 붙이면 인라인 플레이어로 뜸. (대체: `demo-14s.gif` 2MB / R2 직링크 .../conclave/demo.mp4)
   - 런치 시 영상을 Public으로 바꾸려면 YouTube Studio에서 Visibility만 변경.

> ph-01~03은 디자인 그래픽, ph-04·02-terminal·demo는 실제 제품 화면. 디자인+실물 섞인 갤러리가 PH에서 가장 강함.

## First image text overlay (썸네일)
"Your AI built it. Did it build what you asked?"

---

## 런치 메커니즘 (체크리스트)
- 게시: **화~목, 00:01 PT** 시작(PH 하루 단위). 그 시간에 맞춰 준비.
- 가능하면 **헌터** 섭외(팔로워 있는). 없으면 셀프 런치도 OK.
- 런치 당일 **모든 코멘트에 빠르게 응답**(랭킹 = 인게이지먼트).
- 사전: PH 프로필·로고·갤러리·첫 코멘트 미리 작성해 두기.
- 절대 금지: 가짜 업보트·표 구걸 DM(PH가 페널티). 진짜 네트워크에 "오늘 런치한다" 정도만.
- X 빌드인퍼블릭 스레드(이미 작성됨)와 같은 날 연동.

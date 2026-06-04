# Reddit drafts (post yourself)

> POSTS ARE IN ENGLISH (r/cursor, r/SaaS etc. are English). 메모만 한국어.
> 서브마다 문화 다름. 자기홍보는 "가치/스토리 먼저, 링크는 끝/댓글에 한 번". 신규·저카르마 계정은 묻히거나 밴 위험 — 평소 댓글로 카르마 쌓고, 서브 self-promo 룰 확인. 올린 뒤 실시간 응대 필수. 같은 글 여러 서브 복붙 금지 — 서브별로 다르게.

---

## r/cursor (or r/ChatGPTCoding) — experience angle

**Title:** Shipping fast with Cursor, I kept merging PRs that *run* but aren't what I asked for. So I added spec-aware review.

**Body:**
I build almost everything with agents now, and the same thing keeps slipping through: the code runs, tests pass, but it's subtly off-spec — an extra field I didn't ask for, a dropped requirement, a check that quietly moved from the server to the UI.

Diff-only review (human or bot) doesn't catch it, because nothing in the diff is *wrong* — it just isn't what I specified.

So I built a thing where every PR is reviewed by 3 models (Claude/GPT-5/Gemini) as a council, and if you attach a PRD it flags **scope drift**. In my internal tests (n=15, indicative) the council surfaced ~3× the blockers of a single model — mostly missing tests, edge cases, and security gaps.

Anyone else hit this with agent-written PRs? How are you gating AI output today? (I'm the author, so I'm biased — happy to run it on a public PR you point me at and post what it finds.)

Link in a comment (or first comment if the sub bars links in posts): conclave-ai.dev

---

## r/SaaS / r/indiehackers — builder angle

**Title:** Built a code-review SaaS that works but won't sell. Is "spec-conformance review" a real wedge in the AI-coding era?

**Body:**
I built multi-agent PR review — 3 models as a council, plus PRD-vs-PR scope-drift detection. Internal dogfood shows ~3× the depth of a single model (10.93 vs 3.80 blockers/PR, n=15, indicative). The product is solid; honestly, distribution is the weak point.

It's a red ocean — CodeRabbit ($60M raised), Greptile, plus Anthropic's own Claude Code Review. I can't win "AI code review" head-on. So I'm narrowing to **"a gate that checks your AI built what you specified" (PRD conformance)**.

Questions for this sub: (1) Is that narrowed position different enough to matter? (2) Do indie builders keep a spec current enough for spec-aware review to land, or is the angle hollow? Brutal takes welcome.

(I'm the founder. Link in a comment.)

---

## 공통 운영 팁 (한국어 메모)
- 게시 시간: 타깃 지역(미국) 평일 오전. 첫 2시간 응대 집중.
- 첫 댓글에 링크 + "author임" 디스클로즈(투명성=신뢰).
- 톤은 "피드백 원한다", 영업 톤("써보세요") 금지.
- 본인 계정. 여러 계정·지인 업보트 금지.

---

## (선택) 한국 채널도 노릴 거면
글로벌이 1순위지만, 한국 개발자도 같이 치고 싶으면 **GeekNews(news.hada.io)** · 한국 X 개발자 타임라인용 **한국어 버전**을 따로 만들어 줄 수 있음. 영어 글을 그대로 번역하지 말고 톤만 현지화. 필요하면 말해줘.

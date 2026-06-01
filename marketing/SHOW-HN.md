# Show HN 초안 (본인 게시용)

> HN은 진정성·기술 디테일·솔직함에 반응하고, 마케팅 냄새/과장에 가차없습니다. 자랑보다 "무엇을 어떻게 만들었고 뭐가 안 됐나"를. 올린 직후 1~2시간 댓글 실시간 응대가 성패를 가릅니다. 화~목 오전(미 동부) 권장. 본인 계정으로.

## 제목 (택1)
- **A.** Show HN: Conclave – a 3-model council that reviews your PRs against your PRD
- **B.** Show HN: PR review that checks your spec, not just the diff (3-model council)

(HN 제목은 담백하게. 느낌표·이모지·과장 금지.)

## URL
https://conclave-ai.dev

## 본문 (텍스트, 첫 댓글로 달아도 됨)

I build a lot with AI agents now, and my reviewer was still one model skimming a diff. It kept missing the same class of thing: code that *runs* but isn't what I asked for — an extra field, a dropped requirement, a check that moved from server to UI. The diff was "correct," so a diff-only reviewer had nothing to say.

Conclave runs three independent models (Claude, GPT-5, Gemini) as a council on every PR, debates blockers up to 3 rounds, and — if you attach a PRD — flags scope/spec drift. It's a GitHub App at the PR layer (not an IDE assistant), with an autofix worker and learning from merge/reject.

I dogfooded 15 synthetic-bug PRs across 5 Next.js templates. Same catch rate as a single agent (100%), but ~3× the blockers surfaced (10.93 vs 3.80/PR) — the extras were mostly missing tests, edge cases, and security gaps one model called "minor." It's an internal run, n=15, indicative not rigorous; protocol is in /benchmarks and I'd love people to break it.

Stack: pnpm+Turbo monorepo, TS strict, ESM, node --test (no Jest/Vitest), pluggable agents, every LLM call goes through an efficiency gate (cache/route/budget) so a 3-model review doesn't cost 3×. Free on public repos, self-hostable (FSL).

Honest open questions I'd want HN's take on:
1. Is "review against the spec" a real wedge, or do people not keep specs current enough for it to matter?
2. With Claude Code Review (Anthropic's own multi-agent PR review) now shipping, is a 3rd-party council differentiated enough?
3. 3-model latency is ~128s parallel. Acceptable as a merge gate, or too slow?

Repo: https://github.com/3SVS/conclave-ai · Demo: https://conclave-ai.dev

## 강력한 첫 댓글 (본문을 URL로 올렸을 때)
위 본문을 그대로 첫 댓글로. + 끝에: "I'm the author, around for the next few hours — happy to run Conclave on a public PR you point me at and post what it finds."

## 하면 안 되는 것
- 업보트 요청/지인 동원(HN 탐지·페널티). 자연 유입만.
- 경쟁사 비방. 질문받으면 "CodeRabbit/Greptile은 강하다, 우리 축은 spec conformance"로 담담히.
- 수치 과장. dogfood·n=15 캐비엇 반드시 유지.

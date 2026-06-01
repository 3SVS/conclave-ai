# GitHub Marketplace 리스팅 카피

## Name
Conclave AI — Code Council

## Tagline (short description, ≤ 80 chars)
A council of 3 AI models reviews every PR — against your spec, not just the diff.

## Categories
Code review · Code quality · AI assisted

## Pricing
Free for public repositories. Paid plans for private repos / teams (see conclave-ai.dev/pricing).

## Long description (Marketplace body)

**Three frontier models. One verdict. Reads your spec.**

Conclave reviews every pull request with a council of three independent models (Claude, GPT-5, Gemini) instead of one. Same catch rate as a single reviewer, but ~3× the depth — the missing tests, edge cases, and security gaps one model rates "minor enough to skip."

Attach a PRD and Conclave does what diff-only reviewers can't: it flags **scope drift** — when an AI-written PR runs fine but isn't what you actually specified.

**What you get**
- 🧠 **3-model council** — structured disagreement catches single-LLM blind spots.
- 📄 **Spec-aware** — review PRs against your PRD; catch scope/spec mismatch.
- 🔁 **Debate + autofix** — models debate blockers up to 3 rounds; a worker proposes fixes.
- 📈 **Learns** — improves from what you merge vs reject.
- 🔒 **Self-hostable** — FSL license; keep your code in your env.

**Not** an IDE assistant (Cursor/Copilot). Conclave runs at the PR layer as a merge gate — perfect for teams shipping AI-generated code fast.

**Setup:** Install → pick repos → open a PR. First review runs automatically. Optionally point it at your PRD.

→ Demo: conclave-ai.dev · Docs: conclave-ai.dev/docs

## Screenshots (캡처 권장 5컷)
1. PR에 달린 council 리뷰 코멘트(블로커 3~4개, 모델별 표시).
2. **스코프 이탈 플래그** — "PRD says X, this PR also does Y" 코멘트(킬러 컷).
3. 3모델 디베이트(의견 갈렸다가 합의) 뷰.
4. autofix 워커가 제안한 패치 diff.
5. 설정 화면(레포 선택 + PRD 연결) — 1클릭 강조.

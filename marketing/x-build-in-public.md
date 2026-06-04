# X (Twitter) — build-in-public thread & recurring format

> POSTS ARE IN ENGLISH (global dev audience). 메모만 한국어. 톤: 파운더 1인칭, 과장 없음, 구체 수치/예시, 해시태그 남발 X.
> 게시: 원하면 Claude in Chrome으로 내가 대신(로그인+승인), 아니면 복사해 직접.

---

## A. Launch thread (pin it) — 7 tweets

**1/**
AI writes most of my code now. My reviewer was still one model skimming a diff.

So I built Conclave: every PR gets reviewed by a **council of 3 frontier models** (Claude · GPT-5 · Gemini).
Same catch rate as one. ~3× the depth. 🧵

**2/**
The trick isn't a "smarter" model. It's **diversity**.

One model has one blind spot. A different model (different training, different priors) usually doesn't share it.
A council is just structured disagreement — and the missed blockers hide in the disagreement.

**3/**
Numbers (internal dogfood, n=15 PRs, 5 popular Next.js templates — indicative, not peer-reviewed):

· catch rate: 3-agent 100% / single 100%
· **blockers surfaced/PR: 10.93 vs 3.80**

Both find the planted bug. The council finds the 7 things around it.

**4/**
That "+7" was the stuff one model rated "minor enough to skip":
· missing tests for the path just changed
· edge cases (empty/zero/negative, the 2nd concurrent click, the unauth'd request)
· silent security gaps (a string-concat query, a check that lived in the UI but not the server)

**5/**
But the biggest surprise wasn't bugs.

Attach a PRD and the #1 category becomes **scope drift**.
The code runs. Tests pass. Nothing in the diff is wrong.
It's just… not what you asked for.

**6/**
That's the real failure mode of the AI-coding era.
Agents are great at *plausible* code, fast.
"Plausible" ≠ "what you specified" — and only a reviewer that reads the spec can tell them apart.

Diff-only review can't see this.

**7/**
Conclave is a GitHub App at the PR layer. 3-model review → debate → autofix → learns from merge/reject.
Free on public repos, self-hostable (FSL).

Not a Cursor/Copilot replacement — it's the **merge gate** for AI-written PRs.

Install 👉 github.com/apps/conclave-ai-code-council
Demo 👉 conclave-ai.dev

---

## B. Recurring format — "Today's scope drift" (2–3×/week; 스케줄러로 드래프트 큐잉 가능)

Template:
> An AI PR that almost merged today:
> 📄 Spec: "{what was asked}"
> 🤖 PR: {what it actually did — runs, but different}
> 🧠 Council caught it: {which model, why}
> Diff-only review would've passed it.

Example:
> An AI PR that almost merged today:
> 📄 Spec: "password reset is owner-only"
> 🤖 PR: anyone with a valid token can reset (owner check missing)
> 🧠 Gemini flagged it; Claude & GPT passed it as "fine"
> Tests green, diff clean. Only visible against the spec.

> An AI PR that almost merged today:
> 📄 Spec: "list latest 20 orders"
> 🤖 PR: loads all, sorts client-side, no tenant filter → you see other tenants' orders
> 🧠 2/3 of the council flagged the isolation gap
> Looks "fine" on a small dataset.

---

## C. Reply/quote angle (ride the autonomous-coding trend)
On "the agent just builds it all" posts (LazyCodex/Cursor/Claude Code):
> As autonomous coding gets better, human review shrinks and AI PRs explode. So who checks it built what you actually specified?
> That's exactly why we built a PR gate. Generation = your agent. Gate = the council. (link)
— No trashing competitors; complement-positioning only.

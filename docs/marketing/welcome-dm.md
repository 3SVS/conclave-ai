# Welcome DM template — first non-self installer

Send the moment a new `gh_app_installations` row appears with
`account_login != 'seunghunbae-3svs'`. The goal is two-fold:

1. Make the person feel **seen** (you saw their install within
   minutes, not a week later from a marketing pipeline).
2. Open the door to a **30-minute interview** while their first
   review is fresh in their head. Five users at this stage closes
   ~70% of the production-data gap (per `launch-day-ops.md` §사용자
   인터뷰).

Pick the channel **they already used to find us** — GitHub profile
email > LinkedIn > Threads > X. Avoid unsolicited cold-mail of
work emails scraped from elsewhere.

## How to detect

```powershell
# Run every 5–10 min; alerts on any account_login except your own
wrangler d1 execute conclave-ai --remote --command="
  SELECT installation_id, account_login, installed_at
    FROM gh_app_installations
   WHERE removed_at IS NULL
     AND account_login <> 'seunghunbae-3svs'
   ORDER BY installed_at DESC
   LIMIT 5;"
```

Or fold this check into the `launch-day-ops.md` 60-second alert loop
(Telegram dispatch on `account_login != self`).

---

## Template — English (DM / email)

> **Subject (email):** Conclave AI — thanks for installing
>
> Hey {firstName},
>
> Bae from Conclave AI here — I caught your install just now.
> You're literally the first non-me user, so this lands in my inbox
> instead of a CRM pipeline.
>
> Two quick things, no marketing fluff:
>
> 1. If anything broke or felt off in the first review, I want to
>    know directly — reply here and I'll patch it tonight. The
>    project is small enough that I'm the one in the codebase, not
>    a support layer.
> 2. If you've got 30 minutes this week, I'd love to ask **five
>    questions** about how your first PR review went. Five total,
>    not five buckets — I respect your time and won't drift. In
>    return I'll send you a `$3 First-PR pass` code so you can run
>    the SaaS path without wiring a BYO key. (Or you can just keep
>    the free tier; either is fine.)
>
> Either way — appreciate you trying it.
>
> — Bae
> seunghunbae@3svs.com · https://conclave-ai.dev

## Template — 한국어 (DM)

> {이름} 님, Conclave AI 만든 배승훈입니다.
>
> 방금 install 감지하고 바로 메시지 드립니다 — 본인 외 첫 외부
> 사용자라 CRM 거치지 않고 직접 들어옵니다.
>
> 두 가지만 짧게 부탁드릴게요:
>
> 1. 첫 review 에서 깨진 게 있거나 어색했던 부분이 있으면 여기로
>    답장 주세요. 오늘 밤 안에 패치 띄울 수 있을 정도로 코드베이스
>    가까이에 있습니다.
> 2. 이번 주에 30분만 시간 내주실 수 있으면 **다섯 가지** 질문
>    드리고 싶어요. 다섯 카테고리가 아니라 다섯 질문 자체로
>    끝납니다 — 시간 존중합니다. 답례로 `$3 First-PR pass` 코드를
>    드릴게요. 무료 tier 유지하셔도 전혀 부담 없습니다.
>
> 어느 쪽이든 — 시도해주신 것 자체에 감사드립니다.
>
> — 배승훈
> seunghunbae@3svs.com · https://conclave-ai.dev

---

## The five interview questions

Same five regardless of language. Don't expand mid-call — the user
agreed to five.

1. **어떤 PR / 리포에서 사용해보셨나요?** (What kind of code,
   what scale?)
2. **Verdict 가 expectation 과 일치했나요?** Where did Conclave
   read the PR the way you would? Where did it miss?
3. **False positive 가 있었다면 어떤 것이었나요?** (Which
   blocker would you have argued back on?)
4. **비용 / 지연이 합리적이었나요?** (~$0.07 tier-1, ~3 min
   latency — 합리적, 빠른 만큼 정확? 너무 비쌈?)
5. **다음 PR 에도 다시 쓰실 의향이세요?** Yes/no + the one thing
   that would tip the answer.

Five minutes per question, max. No follow-up "and what about…"
questions — that's how 30 min turns into 90 min and the user never
takes a second call.

---

## Follow-up if no reply within 72h

Don't double-DM. Instead, **wait for their first review** —
`jobs.user_id` will show their activity. If they ran 2+ reviews
without saying anything, that's strong signal (engagement >
politeness). Send a single thank-you note:

> Quick update — saw you ran a couple of reviews. Means more than a
> reply would. If you ever want to do that 30-min thing the offer
> stands, but no pressure either way.

If they ran 0 reviews after install, the install was tire-kicking
or they hit a blocker. Send a **diagnostic** DM, not a re-pitch:

> Noticed you installed but haven't run a review yet. Anything in
> the way? `conclave doctor` from the CLI side prints a checklist
> that usually catches the common issues, but if you'd rather just
> tell me what's missing I can probably fix it tonight.

---

## What to log after the call

In `.conclave/episodic/` (or a private notes file — these are
**user observations**, not system feedback). For each call:

- Repo type (Next.js / Go API / monorepo / etc.)
- Whether they had a PRD attached
- Top 1 false positive (if any)
- Their stated reason for installing — exact phrasing
- Will they recur (Y/N)

After 5 calls, group the false-positives by category. If any
category appears 3+ times, that's a `failure-classifier`
candidate — open a PR with the new category and seed it from the
classified examples.

---

## What NOT to do

- Don't paste the same DM verbatim to multiple installers — they
  talk; "Bae from Conclave here, I caught your install just now"
  reads scripted by user #3. Keep the 첫 문장만 personal-rewritten,
  rest can repeat.
- Don't ask for a public testimonial on the first call. Earn that
  on the third interaction.
- Don't offer a free Solo/Pro plan as bait — the pricing isn't
  even live yet. The `$3 First-PR pass` is the only real lever
  while LS is still pending.
- Don't quote internal D1 metrics ("you're install #2!"). Reads
  needy.

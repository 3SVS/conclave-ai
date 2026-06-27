# Fix Brief — http://localhost:3000/

## Observed failure

No onboarding/start CTA detected — cannot exercise the stated intent.

## Reproduction steps

1. open homepage
2. identify the primary CTA or primary input related to checking golf course/current playability conditions
3. click the primary CTA or interact with the primary input if safe
4. observe whether the app advances to a usable next screen, search/result state, course-condition view, or clear next step

## Expected behavior (from intent anchor)

> 골퍼가 앱을 열어 현재 골프장 컨디션 확인 도구임을 이해하고, 코스/라운드가 지금 플레이 가능한지 확인하는 핵심 플로우를 시작할 수 있어야 한다

Interacting with the primary intent CTA/input should advance the user to a usable next screen that serves the stated intent, with no console/network errors.

## Suspected area

Add a clearly labeled primary onboarding CTA (e.g. "Get started" / "Sign up") on the homepage, or ensure the data that renders it loads.

Read-only repo context (no code modified): golf-now reads its backend from process.env.NEXT_PUBLIC_SUPABASE_URL. Stage 258A's deployed target hit a Supabase host that did not resolve (ERR_NAME_NOT_RESOLVED). Stage 258C repair: useGolfCourses now falls back to the bundled koreanGolfCourses dataset (with a visible offline notice) when the backend is unconfigured or unreachable, so the course list and search remain usable without a live backend.

## Specific repair instruction

- Add a homepage primary CTA with clear onboarding text (e.g. "Get started"), linking to a valid onboarding route.

## Rerun command

```
node tools/simsa-completion-loop-spike/run.mjs
```

## Acceptance condition

- Interacting with the primary intent CTA/input advances to a usable next screen that serves the intent anchor.
- No console errors and no failed network requests during the flow.
- The same result is observed on two consecutive runs.

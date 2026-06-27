# Before — Stage 258A failure summary

**Target (production):** https://golf-nngxsj9ap-seunghunbae-3svs-projects.vercel.app/
**Intent anchor:** 골퍼가 앱을 열어 현재 골프장 컨디션 확인 도구임을 이해하고, 코스/라운드가 지금 플레이 가능한지 확인하는 핵심 플로우를 시작할 수 있어야 한다

## Browser evidence (Stage 258A)

- Homepage loaded: HTTP **200**.
- Primary CTA found: **no**. One text input detected: `골프장 검색 (이름, 지역)`.
- **Console errors: 2** — `Failed to load resource: net::ERR_NAME_NOT_RESOLVED`.
- **Network failures: 2–3** — `GET https://njcheczfpeszcqrbhrlf.supabase.co/rest/v1/golf_courses?select=*&is_active=eq.true&order=name.asc (net::ERR_NAME_NOT_RESOLVED)`.
- Reproducible across run-1/run-2 (core findings); network-failure count varied (retry noise).

## Decision (Stage 258A)

**Needs Fix** — a required backend host is unreachable, so a golfer cannot complete the
playability-checking flow regardless of UI.

## Fix Brief acceptance condition (Stage 258A)

- Interacting with the primary intent CTA/input advances to a usable next screen serving the intent.
- **No console errors and no failed network requests during the flow.**
- Same result observed on two consecutive runs.

## Suspected area (Stage 258A)

`NEXT_PUBLIC_SUPABASE_URL` (and the resulting client) points to a Supabase host that does not resolve
(`njcheczfpeszcqrbhrlf.supabase.co` → ERR_NAME_NOT_RESOLVED) — a dead/paused project or stale deploy
env. The homepage course list (`useGolfCourses` → `fetchCourses` → `golf_courses`) therefore fails.

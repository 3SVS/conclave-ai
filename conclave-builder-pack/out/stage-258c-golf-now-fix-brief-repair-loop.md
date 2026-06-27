# Stage 258C — Golf Now Fix Brief → Repair Loop Closure

**Date:** 2026-06-27
**Decision:** **Option A — Repair loop closed.** (with honestly-documented Not Verified items)

---

## 1. Approval phrase observed

> "Golf Now fix brief repair loop closure approved."

## 2. golf-now branch / HEAD

- repo: `https://github.com/seunghunbae-3svs/golf-now` (authorized; separate from Simsa)
- branch: `fix/stage-258c-supabase-backend-repair-loop` (from `origin/main` `c4c3974`), commit **`3c94ab3`**

## 3. Original Stage 258A failure summary

Homepage loaded (HTTP 200) but fired `GET …njcheczfpeszcqrbhrlf.supabase.co/rest/v1/golf_courses…` →
**`net::ERR_NAME_NOT_RESOLVED`** (2 console errors, 2–3 network failures). No course list, no usable
flow. Simsa decision: **Needs Fix**. One input detected (`골프장 검색`).

## 4. Root cause analysis

`useGolfCourses` → `fetchCourses(supabase, …)` queries `golf_courses`. The client
(`getSupabaseBrowserClient`) only guarded **missing** env, not an **unreachable host**. With env set to
a dead Supabase host, the client was created and the request fired to a host that does not resolve. The
hook's null-client path returned no data + no error (empty page); the fetch-rejection path showed
error-only. Backend URL source: `process.env.NEXT_PUBLIC_SUPABASE_URL`. Classification: **(2) NEXT_PUBLIC_SUPABASE_URL
invalid/unresolvable in deployment** combined with **(5/6) missing backend-failure fallback** —
production root requires **(8) a deploy-env/config change** outside the repo.

## 5. Files changed in golf-now

3 files, +88/−6:
- `src/features/courses/fallbackCourses.ts` (new) — `getFallbackCourses()` maps bundled
  `koreanGolfCourses` → `GolfCourse[]`.
- `src/features/courses/useGolfCourses.ts` — fall back to bundled data when Supabase is unconfigured or
  unreachable; expose `usingFallback`.
- `src/app/page.tsx` — render fallback list + visible offline notice; blocking error only when no data.

## 6. Repair summary

The smallest safe in-repo fix that closes the user-facing failure **without** changing secrets/env:
when the backend is unavailable, serve the bundled offline course dataset and **clearly tell the user**
it is offline data (live data never implied). The golfer can still open the app, understand its
purpose, browse courses, and use search. The backend failure is not hidden.

## 7. Local verification commands / results

- `npm install` → ok.
- `npx tsc --noEmit` → **pass** (full project type-check).
- `CI=true NEXT_TELEMETRY_DISABLED=1 npm run build` → **pass** (exit 0; homepage `/` compiles/prerenders).
- `npm run dev` → server ready at `http://localhost:3000/` (HTTP 200). (`next lint` requires
  interactive ESLint setup the repo lacks → skipped; tsc + build cover types/compile.)
- Direct Playwright probe of the running app: offline notice visible **true**, `한양CC` course visible
  **true**, ~422 course-name matches, 21,796 chars rendered (course list populated).

## 8. repair-run-1 browser evidence summary

`http://localhost:3000/` HTTP **200**; **console errors 0**, **network failures 0**; primary CTA found
**no**; input detected `골프장 검색`; screenshot `after/repair-run-1/screenshots/before.png`. Decision
**Needs Clarification**.

## 9. repair-run-2 browser evidence summary

Identical core findings: HTTP 200, **0 console errors, 0 network failures**, no CTA, search input
present; screenshot `after/repair-run-2/screenshots/before.png`. Decision **Needs Clarification**.

## 10. Before-after comparison

console errors 2→**0**; network failures 2–3→**0**; course list visible no→**yes**; offline disclosure
none→**shown**; decision **Needs Fix → Needs Clarification**. The exact `ERR_NAME_NOT_RESOLVED` failure
is resolved. See `comparison/before-after-comparison.md`.

## 11. Reproducibility comparison

**REPRODUCIBLE (core findings)** — repair-run-1 and repair-run-2 agree on target, CTA, route, error
class, and decision (**Needs Clarification**). See `comparison/reproducibility-comparison.md`.

## 12. Whether the original failure was resolved

**Yes — resolved in the local rerun.** The Supabase host-resolution failure and the failed
`golf_courses` request are gone (0 network failures, 0 console errors); the course list + search are
usable. **Production** closure is **blocked** pending a deploy-env change to a live
`NEXT_PUBLIC_SUPABASE_URL` (not performed — no secret/env change).

## 13. Remaining Not Verified items

- **Production live-data path** — deployed env still points at the dead host; needs a Vercel env change
  (live Supabase URL+key) + redeploy.
- **Primary CTA / click-based flow** — the spike's CTA detector is button-centric; this app is
  search-input driven, so `primaryCtaFound=false` → Needs Clarification, not Ready (Simsa spike
  coverage limitation, not a golf-now defect).
- **Next-screen usability** — no visual oracle in the spike.

## 14. AI Opinion vs Browser Evidence separation — confirmed

Receipts keep `browserEvidence` (facts) and `aiOpinion` (labeled interpretation) as separate sections.
Post-repair, `aiOpinion.likelyIntentMismatch=false` and no backend-failure reasons remain — consistent
with the factual 0/0 error evidence.

## 15. Fix Brief closure status

**Partially closed (local PASS, production BLOCKED).** Acceptance condition "no console errors and no
failed network requests during the flow" → **met locally**. "Advances to a usable next screen serving
the intent" → course list + search usable (a clicked end-to-end next-screen remains Not Verified by the
spike). Production env remains the open blocker.

## 16. golf-now PR number / URL

**golf-now PR #38** — https://github.com/seunghunbae-3svs/golf-now/pull/38 (OPEN, **not merged**).

## 17. Production impact

**Simsa production impact: 0.** No Simsa deploy, no Simsa D1/auth/env/payment/OAuth/DNS change. golf-now
was **not deployed** (only a branch + PR). No golf-now production env/secret change.

## 18. Safety scan

No secrets committed/printed (`.env.local` absent locally; backend URL is the public `NEXT_PUBLIC`
value, no keys). No destructive actions, no real-account creation, no auth bypass, no
payment/delete/send/invite/publish/deploy. golf-now PR not merged. Simsa production untouched
(app.trysimsa.com / Worker healthy throughout). Dogfood PRs #121–130 untouched. No auto-merge.

## 19. Recommended next stage

**Stage 258D — Golf Now Repair PR Merge Gate.** Only after: "Golf Now repair PR #38 merge approved."
(Note: merging closes the *local/UX* failure mode; full **production** closure additionally needs a
live `NEXT_PUBLIC_SUPABASE_URL` deploy-env change — a separate, explicitly-approved action.)

After closure, recommended Simsa product stage: **Stage 260A — Visual/Interaction Coverage Gate
Upgrade** (strengthen the click/search-driven flow detection — directly addresses the "click-based
flow is still weak" note) or **Stage 259A — Multi-Agent Candidate Comparison Evidence**.

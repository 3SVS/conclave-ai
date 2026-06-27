# Before / After Comparison — Stage 258A → Stage 258C repair

| Signal | Before (258A, prod target) | After (258C, repaired local) | Change |
| --- | --- | --- | --- |
| Homepage load | HTTP 200 | HTTP 200 | same |
| Console errors | **2** (`ERR_NAME_NOT_RESOLVED`) | **0** | ✅ resolved |
| Network failures | **2–3** (`…supabase.co/golf_courses` unreachable) | **0** | ✅ resolved |
| Course list visible to user | no (broken/empty) | **yes** (offline fallback list renders; `한양CC` etc.) | ✅ improved |
| Honest backend-state disclosure | none | **offline-data notice shown** | ✅ added |
| Search input present | yes (`골프장 검색`) | yes (`골프장 검색`) | same |
| Primary CTA detected by spike | no | no | unchanged |
| Decision | **Needs Fix** | **Needs Clarification** | ✅ improved (no longer broken) |

## What was resolved

The exact Stage 258A failure — the homepage firing `golf_courses` requests to an unresolvable Supabase
host (`ERR_NAME_NOT_RESOLVED`) and dead-ending the user — is **gone** in the repaired build. With the
backend unconfigured/unreachable, `useGolfCourses` now serves the bundled course dataset and the page
shows a course list + a clear "offline data" notice, with **zero console/network errors**. A golfer can
open the app, understand it is a golf-course tool, browse courses, and use search.

## What remains Not Verified

- **Primary CTA**: the spike's CTA detector is button/link-keyword-centric; this app is search-input +
  card driven, so `primaryCtaFound=false` → decision **Needs Clarification** (not Ready). This is a
  Simsa spike-coverage limitation (the "click-based flow is still weak" note), not a golf-now defect.
- **Live data path**: the local rerun runs with the backend unconfigured, so it exercises the *fallback*
  path. The **production** deployment's `NEXT_PUBLIC_SUPABASE_URL` still points at the dead host — full
  production closure is **blocked by a deploy-env/config change** (a live Supabase URL+key), which this
  stage does not perform (no secret/env change without separate approval).
- **Next-screen usability**: the spike has no visual oracle to confirm a clicked next screen is usable.

## Reproducibility

Both repaired runs (repair-run-1, repair-run-2) agree on all core findings (target, CTA, route, error
class, decision **Needs Clarification**) — see `reproducibility-comparison.md`.

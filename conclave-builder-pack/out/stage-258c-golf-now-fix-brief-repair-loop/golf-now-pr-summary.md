# golf-now PR summary

- **PR:** https://github.com/seunghunbae-3svs/golf-now/pull/38
- **Title:** Stage 258C — Repair Golf Now backend completion flow
- **Branch:** `fix/stage-258c-supabase-backend-repair-loop` (from `origin/main`), commit `3c94ab3`
- **Status:** OPEN — **not merged** (per Stage 258C runbook).

## Files changed (golf-now)

- `src/features/courses/fallbackCourses.ts` (new, +38) — `getFallbackCourses()` maps the bundled
  `koreanGolfCourses` to `GolfCourse[]`.
- `src/features/courses/useGolfCourses.ts` (+) — fall back to the bundled dataset when Supabase is
  unconfigured (null client) or unreachable (fetch throws); expose `usingFallback`.
- `src/app/page.tsx` (+) — render the fallback list + a visible offline notice; blocking error only
  when there is no data at all.

Total: 3 files, 88 insertions, 6 deletions.

## Verification

- `npx tsc --noEmit` → pass.
- `CI=true npm run build` → pass (homepage `/` compiles).
- Simsa completion-loop spike re-run twice at `http://localhost:3000/`.

## Closure

The Stage 258A failure (`golf_courses` → `ERR_NAME_NOT_RESOLVED`) is **resolved** in the repaired local
build (0 console / 0 network errors; course list + search usable). Production closure remains blocked
by a deploy-env change (live `NEXT_PUBLIC_SUPABASE_URL`), intentionally not performed.

## Safety

No secrets committed, no env/credential changes, no destructive actions, no production deploy. PR not
merged.

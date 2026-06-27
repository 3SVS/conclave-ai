# Stage 258A — External Vibe App Completion Loop Spike

**Date:** 2026-06-27
**Decision:** **Option A — External vibe app completion loop spike PR opened.**

---

## 1. Approval phrase observed

> "External vibe app completion loop spike approved."

Plus an authorized target fixture with explicit ownership ("Authorized by Bae / Seunghun Bae for safe
QA testing … separate golf-now app, not Simsa").

## 2. Branch / HEAD

- base main: `149ab5f`
- feature branch: `feat/stage-258a-external-vibe-app-completion-loop-spike`, head **`f484d0c`** (`f484d0ce711e833c3ff7177f7c19ea9fb9ff1aed`)

## 3. Normalized target URL

`https://golf-nngxsj9ap-seunghunbae-3svs-projects.vercel.app/`
(As-provided value had a doubled `https://` scheme; normalized to a single scheme. Reachability
confirmed read-only: HTTP 200, Next.js on Vercel.)

## 4. Repo URL / local path used as read-only context

- repoUrl: `https://github.com/seunghunbae-3svs/golf-now`
- localRepoPath: `C:\Users\seung\.conclave\golf-now` (present)
- **Read-only** inspection only (no code modified/pushed/deployed). Used to ground the Fix Brief:
  golf-now reads its backend from `process.env.NEXT_PUBLIC_SUPABASE_URL` (`src/lib/supabase/*`).

## 5. Intent anchor

> A golfer should be able to open the app, understand that it helps check current golf course
> conditions, and start a core flow for checking whether a course or round is playable now.

## 6. Core flow

open homepage → identify the primary CTA/input related to checking course/playability conditions →
click/interact if safe → observe whether the app advances to a usable next screen / search-result /
course-condition view / clear next step.

## 7. Forbidden actions

payment · delete · send email · invite external users · publish · deploy · destructive data mutation ·
production data mutation · account creation with real personal data. (None were performed; the spike
also never bypasses auth and never blind-types into unknown forms.)

## 8. Files changed

24 files (spike code + docs + artifacts), additive only:
- `tools/simsa-completion-loop-spike/` — `config.json`, `run.mjs` (Playwright runner), `spike.mjs`
  (two-run orchestrator), `lib/{safety,classify,receipt,compare}.mjs`, `test/shaping.test.mjs`,
  `package.json`, `.gitignore`. **Outside the pnpm workspace** (`packages/*`, `apps/*`) → not in CI.
- `docs/simsa-external-vibe-app-completion-loop-spike.md`
- `conclave-builder-pack/out/stage-258a-external-vibe-app-completion-loop-spike/` — run-1/run-2
  receipts (json+md), fix-briefs, browser-evidence.json, before-click screenshots, and
  reproducibility-comparison.md.

No migration, no `wrangler.toml`, no deploy config, no `.env`/secret, no GitHub Actions, no dashboard,
no production route. `node_modules` is gitignored (Playwright installed locally only).

## 9. Spike implementation summary

A real Chromium (Playwright, headless) loads the target, screenshots it, collects visible buttons/
links/role=button + safe text inputs, picks the highest-priority **safe** CTA matching the intent
(golf-domain + onboarding keyword set), clicks only if safe (forbidden/unclear → Skipped), then records
factual evidence. Pure deterministic helpers shape the rest: `classify` (AI Opinion + decision),
`receipt` (Internal Completion Receipt + Fix Brief, no numeric score), `compare` (run-1 vs run-2). The
orchestrator runs the target twice and writes the comparison.

## 10. Run-1 browser evidence summary

Loaded `…vercel.app/` (HTTP 200, viewport 1280x800). Primary intent **CTA: none matched**; **1 text
input detected** (`골프장 검색 (이름, 지역)` — course search). No click performed. **2 console errors**
(`ERR_NAME_NOT_RESOLVED`) and **2 network failures** — `GET …supabase.co/rest/v1/golf_courses…`
(host unreachable). Screenshot: `run-1/screenshots/before.png`.

## 11. Run-2 browser evidence summary

Same load (HTTP 200), same CTA result (none), same input detected, same console-error class, **3**
network failures (one extra retry vs run-1). Screenshot: `run-2/screenshots/before.png`. Decision
identical to run-1.

## 12. Reproducibility comparison

**REPRODUCIBLE (core findings).** run-1 and run-2 agree on target URL, CTA-found (false), CTA text (—),
route-after-click (—), console-error class (present), network-failure class (present), and **decision
(Needs Fix)**. The only difference — network-failure *count* (2 vs 3) — is reported as **non-gating
timing/retry variance** against an unreachable host, not a core divergence. The run was not marked
nondeterministic.

## 13. Receipt summary

Decision **Needs Fix**: a required backend host is unreachable, so a user cannot complete the intended
playability-check flow regardless of UI. Receipt keeps Browser Evidence, AI Opinion, Not Verified,
Skipped, and Decision in separate sections; carries **no numeric score** (guarded by
`assertNoNumericScores`). Not Verified: primary intent CTA (an input was found instead); next-screen
usability (no visual oracle).

## 14. Fix brief summary

Observed failure (backend requests failing) · reproduction steps (the core flow) · expected behavior
(from the intent anchor) · suspected area + **read-only repo context** (backend URL from
`NEXT_PUBLIC_SUPABASE_URL`; deployed host returns `ERR_NAME_NOT_RESOLVED`) · specific repair
instruction (restore/repoint the backend env to a live host, redeploy; do NOT commit secrets) · rerun
command · acceptance condition (intent CTA/input advances to a usable next screen, no console/network
errors, stable across two runs).

## 15. AI Opinion vs Browser Evidence separation — confirmed

The receipt stores `browserEvidence` (facts only) and `aiOpinion` (labeled "interpretation — NOT a
measured fact") as distinct objects; the markdown renders them under separate headers. The opinion
correctly sets `likelyIntentMismatch=false` (an intent-relevant input exists) and attributes the
high-severity blocker to the backend outage — an interpretation a reader can reject without losing the
facts.

## 16. Safety scan

No: production deploy · production D1 mutation · migration · env/secret change · AUTH_* change · OAuth
· DNS/CORS · payment · destructive action · real-account creation · auth bypass · **golf-now code
modification/push/deploy** · Simsa self-demo · **auto-merge**. Artifacts scanned — no JWT/anon/service
keys (the captured backend URL is the public `NEXT_PUBLIC` value, not a credential). Simsa production
(`app.trysimsa.com`, Worker) untouched and healthy. Dogfood PRs #121–130 untouched.

## 17. Verification results

- spike deterministic shaping tests: **11/11**
- spike ran **twice** against the live authorized target → **reproducible** (decision Needs Fix)
- repo-wide `pnpm typecheck`: **57/57** · `pnpm verify`: **green** (spike is outside the workspace, so
  it cannot affect CI/build — confirmed FULL TURBO cache, no recompute)

## 18. Production impact

**0.** Nothing was deployed or mutated. The spike only drove a real browser against an authorized
external app and wrote local artifacts. Simsa Worker remains 0.13.15; D1 unchanged; auth/sign-up
policy unchanged.

## 19. PR number / URL

**PR #177** — https://github.com/3SVS/conclave-ai/pull/177
OPEN · MERGEABLE · CLEAN · head `f484d0c` · CI Node 20+22 pass. **Not merged** (per runbook).

## 20. Recommended next stage

**Stage 258B — PR Merge Gate for Stage 258A.** Only after: "PR #177 merge approved."

After merge, candidate product stages (each separately approved): **260A** Visual / Interaction
Coverage Gate (turn this spike's contract into a fuller runner) · **259A** Cross-Agent Review Evidence
· **258C** Fix-Brief → repair-loop closure (re-run after a fix to verify the acceptance condition).
Alternative runtime path: **Stage 256 — Auth Workspace Bridge Deploy Readiness Gate.**

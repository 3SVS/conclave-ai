# Stage 257A — Simsa Acceptance Graph + Evidence Pack Foundation Code-Readiness PR

**Date:** 2026-06-27
**Decision:** **Option A — Simsa Acceptance Graph + Evidence Pack Foundation PR opened.**

---

## 1. Approval phrase observed

> "Simsa acceptance graph and evidence pack code readiness approved."

Scope: foundational pure contracts + helpers + tests + docs. No runtime automation, no browser
runner, no auto-merge, no deploy, no production mutation. None of the disallowed actions performed.

## 2. Branch / HEAD

- base main: `a302cd0` (`a302cd05fcbd1e4e7aed5f1718680e386335294d`)
- feature branch: `feat/stage-257a-acceptance-graph-evidence-pack`, head **`919e203`** (`919e203bcee21af52ac18d7e8be6b8e419d8cec9`)

## 3. Production baseline (read-only)

- `/account` **200** · `/api/auth/ok` **200** `{"ok":true}` · sign-up **403** `signup_disabled`
- Worker `/health` **200** (0.13.15) · `/workspace/membership/me` **404** (PR #174 merged, not deployed)
- D1 (unchanged): workspaces **0** · members **0** · workspace_projects **3** · workspace_id NULL **3/3** · user_key **3/3** · user **1** · account **1** · session **1** · verification **0**

## 4. Files changed

5 files, additive only — **+1096 / -0**:
- `apps/central-plane/src/acceptance-graph.ts` (+365) — graph contracts + helpers
- `apps/central-plane/src/evidence-pack.ts` (+312) — evidence pack + gate + receipt
- `apps/central-plane/test/acceptance-graph.test.mjs` (+112)
- `apps/central-plane/test/evidence-pack.test.mjs` (+191)
- `docs/simsa-acceptance-graph.md` (+116)

**No route wired into `router.ts`** (helpers are pure foundation), no migration, no `wrangler.toml`,
no deploy config, no `.env`/secret, no GitHub Actions, no auto-merge enablement, no dashboard UI.

## 5. Acceptance graph contract

9 nodes: User Intent · Clarifying Answers · PRD (with id+text acceptance criteria) · Build Plan
(task→criteria links) · Implementation Evidence (tests linked to criteria, CI, deployment) ·
Cross-Review Evidence · Visual/Interaction Evidence (**contract only — no runner**) · Gate Decision ·
Receipt. `createAcceptanceGraph` is pure and never invents intent/PRD; `deriveIntakeSource` infers
idea/prd/repo/mixed; `summarizeAcceptanceGap` derives per-criterion verified/broken/not_verified from
linked test observations (failing→broken, passing→verified, none/skipped→not_verified).

## 6. Evidence pack contract

`deriveEvidencePack(graph)` produces a deterministic pack: ids · intake · branch/base/head · PR ·
artifact summary · changed files · product evidence · engineering evidence · cross-review evidence ·
visual evidence placeholder · risk flags · verified/broken/skipped/notVerified/userDecisionNeeded ·
humanGateRequired · requiredApprovalPhrase · nextSafestAction · doNotDoYet · limitations. Risk flags
are booleans from changed-file paths + diff text (policy §12 — agent prose is never proof).

## 7. Receipt contract

`createReceipt(pack)` → receiptType · summary (readiness state, no number) · changed · improved ·
verified · broken · notVerified · skipped · userDecisionNeeded · requiredHumanGate · nextSafestAction ·
limitations. `assertNoNumericScores` rejects any `*score*` field or `NN/100`/`score: N` string.

## 8. Decision states

11 states, none containing a digit: Ready · Conditionally Ready · Needs Clarification · Needs Evidence
· Needs Expert Review · Not Applicable · Not Judged · Do Not Build Yet · Not Verified · Needs Fix ·
User Acceptance Required. Classifier priority (deterministic): Needs Clarification → Needs Fix (broken)
→ User Acceptance Required → Needs Evidence → Not Verified → Ready/Conditionally Ready → Not Judged.

## 9. Risk flags

14 deterministic booleans: migrationChanged · deployConfigChanged · envSecretTouched ·
authPolicyTouched · paymentTouched · oauthTouched · dnsCorsTouched · d1WriteDetected ·
destructiveActionDetected · workspaceClaimTouched · publicLaunchTouched · visualEvidenceMissing ·
acceptanceCriteriaMissing · userIntentAmbiguous. The first 11 (`HARD_GATE_FLAGS`) force a hard human
gate + a required approval phrase.

## 10. Pure helpers

`createAcceptanceGraph · deriveIntakeSource · isUserIntentAmbiguous · summarizeAcceptanceGap ·
deriveRiskFlags · deriveEvidencePack · classifyGateDecision · listNotVerified · listUserDecisionNeeded
· createReceipt · assertNoNumericScores`. All pure: no network, no DB, no env, no LLM; deterministic
output for deterministic input (proven by a same-input→identical-receipt test).

## 11. Test coverage

19 tests across both files, covering the 8 mandated cases: (1) idea-only → Needs Clarification, no
fake Done · (2) PRD-first no impl → Not Verified, not Ready · (3) repo-first no PRD → User Acceptance
Required · (4) PRD+impl partial coverage → verified/not-verified separated · (5) tests pass but visual
missing → not Ready · (6) implementation choice over ambiguous PRD → userDecisionNeeded · (7) risk-flag
detection (migration/deploy/env/auth/payment/oauth/D1/destructive) · (8) no numeric scoring (guard
throws on score field / NN-100). Plus intake inference, malformed-input dropping, determinism.

## 12. Documentation

`docs/simsa-acceptance-graph.md`: why Simsa is not a code-review wrapper / not a generic QA tool ·
acceptance graph definition · idea/PRD/repo/mixed intake · product vs engineering vs visual evidence ·
verified/broken/not-verified/user-decision · cross-agent review position · visual gate position ·
explicit limitations (no all-bugs claim, no perfect-product claim, no numeric scoring) · future stages.

## 13. Verification results

- central-plane build: **OK** (tsc clean)
- new tests: **19/19** (`acceptance-graph` + `evidence-pack`)
- full central-plane suite: **1265/1265**
- `pnpm typecheck`: **57/57** · `pnpm verify`: **green** · pre-push verify **passed**
- PR #176 CI: `typecheck-build (20)` **pass** · `typecheck-build (22)` **pass**

## 14. Safety scan

No: production deploy · D1 mutation · migration apply · workspace/member row creation ·
workspace_projects update · project claim · legacy userKey migration · user creation · sign-up/sign-in
· smoke cleanup · auth rollback · env/secret change · AUTH_SIGNUP_MODE change · AUTH_ENABLED change ·
OAuth · DNS/CORS production change · payment · MCP/npm publish · broad launch · **auto-merge enabled**
· **browser automation against production**. No route mounted. Dogfood PRs #121–130 untouched. All
production access was read-only HTTP + read-only SQL.

## 15. Production impact

**0.** All new code is pure and unmounted (no route serves it). PR unmerged/undeployed. Worker 0.13.15;
D1 unchanged; auth + sign-up policy unchanged; membership endpoint still 404.

## 16. PR number / URL

**PR #176** — https://github.com/3SVS/conclave-ai/pull/176
OPEN · MERGEABLE · mergeStateStatus CLEAN · head `919e203`. **Not merged** (per runbook).

## 17. Recommended next stage

**Stage 257B — PR Merge Gate for Stage 257A.** Only after: "PR #176 merge approved."

Next product stages after merge: **258A** Artifact Alignment Gate · **259A** Cross-Agent Review Evidence
· **260A** Visual / Interaction Coverage Gate Spike. Alternative runtime path: **Stage 256 — Auth
Workspace Bridge Deploy Readiness Gate.**

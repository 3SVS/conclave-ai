# Stage 256B — Simsa Autopilot Policy Spec Code-Readiness PR

**Date:** 2026-06-27
**Decision:** **Option A — Simsa Autopilot policy spec PR opened.**

---

## 1. Approval phrase observed

> "Simsa autopilot policy spec code readiness approved."

Scope: adds the autopilot operating model as durable repo documentation. Does NOT implement runtime
automation, enable auto-merge, deploy, or change production behavior. None of the disallowed actions
were performed.

## 2. Branch / HEAD

- base main: `7dad790` (`7dad7904d24efdaab9bf774cd245ee76e232a4ac`)
- feature branch: `feat/stage-256b-simsa-autopilot-policy-spec`, head **`5ca5d13`** (`5ca5d13868403ce4b8c57484394c7f309cd7ca3b`)

## 3. Production baseline (read-only)

- `/account` **200** · `/api/auth/ok` **200** `{"ok":true}` · sign-up **403** `signup_disabled`
- Worker `/health` **200** (0.13.15) · `/workspace/membership/me` **404** (PR #174 merged, not deployed — expected)
- D1 (unchanged, rows_written 0): workspaces **0** · members **0** · workspace_projects **3** · workspace_id NULL **3/3** · user_key **3/3** · user **1** · account **1** · session **1** · verification **0**

## 4. Files changed

1 file, additive only — **+308 / -0**:
- `docs/simsa-autopilot-operating-model.md`

No runtime code, no migration, no `wrangler.toml`, no deploy config, no `.env`/secret, no GitHub
Actions, no auto-merge enablement, no doc-test (repo has no doc-policy test pattern → none added per
Step 5 guidance). Single comprehensive doc (repo `docs/*.md` is flat, no index README to update).

## 5. Policy spec summary

`docs/simsa-autopilot-operating-model.md` — 19 sections: Purpose · Current problem · Operating
principle · Risk tier model · Auto-advance rules · Stop triggers · Hard human gates · Exact approval
phrase policy · Claude/Codex handoff protocol · Single vs dual-agent routing · Evidence pack format ·
Deterministic evidence rules · GitHub labels · GitHub status checks · Telegram/Slack summary format ·
Stage compression rules · Initial (shadow-first) rollout policy · Explicit non-goals · Roadmap.

## 6. Risk tier model summary

Tier 0 docs / Tier 1 low-risk code (non-deployed read-only) / Tier 2 runtime+deploy (no data
mutation) / Tier 3 prod data·schema·env·auth / Tier 4 critical·irreversible·external. Tier ≤1
auto-eligible; Tier 2 deploy stays a gate; Tier 3+ hard human gate (Tier 4 two-step + rollback plan).

## 7. Auto-advance / stop rules summary

Auto-advance only when ALL of: Tier ≤1, no migration/deploy/wrangler.toml/env/secret/auth/signup/
payment/OAuth/DNS/CORS, no prod API change, no D1 write, no destructive SQL, no workspace_projects
UPDATE, no claim, no invite/share, no launch copy, CI green, branch up-to-date, diff under threshold,
evidence pack, ≥1 self-review, no unresolved blocker. 21 explicit stop triggers (any → human review),
including production baseline drift and D1 row drift.

## 8. Hard human gates summary

20 always-exact-phrase gates: central-plane/dashboard deploy · D1 schema apply · D1 data mutation ·
env/secret · AUTH_ENABLED · AUTH_SIGNUP_MODE · OAuth prod · payment · DNS/CORS · destructive cleanup ·
smoke deletion · project claim/backfill · workspace/member writes · invite/share · sign-up opening ·
public launch · MCP/npm publish · customer data export/delete · auth-disabling rollback. Phrase format
is scoped per action; one approval never implies another.

## 9. Agent handoff protocol summary

task packet → lead implement → verify → self-review → challenge cross-review → fix high/medium →
evidence pack → risk tier → Simsa decision (auto/approval/hold) → Bae gets summary only when needed.
Dual-agent for auth/migration/payment/permission/deploy/data-model/launch/critical; single-agent for
docs/tests/copy/narrow-UI/helpers/read-only instrumentation.

## 10. Evidence pack format summary

22 fields: taskId · branch/base/head · PR · changedFiles · diffRiskScan · migration/deploy/d1/env/
auth/payment/launch risk booleans · testsRun · CI · preview/deploy · prod baseline · D1 drift ·
selfReview · crossReview · blockers · rollback plan · recommendedDecision · requiredApprovalPhrase.
Deterministic rule: risk booleans from git/CI/diff facts only; agent prose never treated as proof; no
secrets/tokens in logs.

## 11. GitHub labels / checks summary

14 labels (`simsa:risk-0-docs`…`risk-4-critical`, `auto-eligible`, `human-gate`, `deploy/d1/env/
auth-required`, `blocked`, `ready-for-bae`, `autopilot-held`). 7 status checks (Risk Classification ·
Diff Safety Scan · Evidence Pack · Agent Self-Review · Cross-Review · Human Gate Required · Auto-Merge
Eligibility). Auto-merge only when Human Gate Required absent AND Auto-Merge Eligibility passes.

## 12. Telegram/Slack format summary

Title · Risk tier · Changed · No (what did NOT change) · CI · Production impact · Recommendation ·
Approval phrase + actions [Approve/Hold/Ask cross-review/Rollback plan/More detail]. PR #174 worked
example included.

## 13. Stage compression summary

docs-only = 1 flow · low-risk code = auto/1 summary · runtime = PR/merge auto + deploy gate · D1 =
PR/merge separate, apply hard gate · env/auth/payment/DNS = never compress · observation = auto +
anomaly-only alert. Old 6-step flow → new evidence-driven flow with deploy as the human pivot.

## 14. Verification results

- `git diff --cached --stat`: 1 file, +308/-0 (docs-only)
- `pnpm typecheck`: **57/57** (FULL TURBO cache — confirms no build surface touched)
- `pnpm verify`: **green**
- PR #175 CI: `typecheck-build (20)` **pass** · `typecheck-build (22)` **pass**

## 15. PR number / URL

**PR #175** — https://github.com/3SVS/conclave-ai/pull/175
OPEN · MERGEABLE · mergeStateStatus CLEAN · head `5ca5d13`. **Not merged** (per runbook).

## 16. Docs path

This report: `conclave-builder-pack/out/stage-256b-simsa-autopilot-policy-spec-code-readiness.md`
Policy doc shipped in PR: `docs/simsa-autopilot-operating-model.md`

## 17. Local checkpoint commit

Committed to local checkpoint branch `docs/stage-177-dual-pr-merge-order-checkpoint` (report only).
Not pushed; not on main; no PR for the report.

## 18. Safety scan / no-work confirmation

No: production deploy · production D1 mutation · migration apply · workspace/member row creation ·
workspace_projects update · project claim · legacy userKey migration · user creation · sign-up/sign-in ·
smoke cleanup · auth rollback · env/secret change · AUTH_SIGNUP_MODE change · AUTH_ENABLED change ·
OAuth · DNS/CORS production change · payment · MCP/npm publish · broad launch · **auto-merge enabled**.
Dogfood PRs #121–130 untouched. All production access was read-only HTTP + read-only SQL.

## 19. Production impact

**0.** PR #175 is docs-only and unmerged/undeployed. Worker remains 0.13.15; D1 unchanged; auth
activation and sign-up policy unchanged; membership endpoint still 404 (not deployed).

## 20. Recommended next stage

**Stage 256C — PR Merge Gate for Stage 256B.** Only after: "PR #175 merge approved."

Next product stage after merge: **Stage 257A — Simsa Evidence Pack Generator code-readiness PR.**
Alternative bridge path: **Stage 256 — Auth Workspace Bridge Deploy Readiness Gate**
("Auth workspace bridge deploy readiness approved.").

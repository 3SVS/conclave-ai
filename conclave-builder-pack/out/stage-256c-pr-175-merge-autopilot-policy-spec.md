# Stage 256C — PR #175 Merge Gate / Simsa Autopilot Policy Spec

**Date:** 2026-06-27
**Decision:** **Option A — PR #175 merged; Simsa Autopilot and Product Boundary policy spec on main with no live impact.**

---

## 1. Approval phrase observed

> "PR #175 merge approved."

Scope: merge PR #175 into main only. Does NOT approve runtime automation, GitHub Actions automation,
auto-merge enablement, deploy, production D1 schema/data mutation, migration apply, workspace/member
row creation, project claim, legacy userKey migration, destructive cleanup, smoke account deletion,
user creation, sign-up/sign-in, auth rollback, env/secret changes, AUTH_SIGNUP_MODE/AUTH_ENABLED
changes, OAuth, DNS/CORS, payment, MCP/npm publish, or broad/invite/share/membership launch. None
performed.

## 2. PR #175 status before merge

- number 175 · state OPEN · base `main` · head `feat/stage-256b-simsa-autopilot-policy-spec`
- head OID `d6e5ca2d88e6d97a9e233addbd5f4b7d42db3083` (== Stage 256B-1 report)
- mergeable **MERGEABLE** · mergeStateStatus **CLEAN**
- CI: `typecheck-build (20)` **pass** · `typecheck-build (22)` **pass** — no pending/failed/cancelled

## 3. Final diff summary (PR head vs main `7dad790`)

1 file, **additive only — +472 / -0**: `docs/simsa-autopilot-operating-model.md`. No runtime code,
no migration, no `wrangler.toml`, no deploy config, no `.env`/secret, no GitHub Actions, no auto-merge
enablement, no auth policy change, no D1/dashboard code, no package-publish config.

All 30 required sections verified present: §1 Purpose · §2 Current problem · §3 Operating principle ·
§4 Risk tier model · §5 Auto-advance rules · §6 Stop triggers · §7 Hard human gates · §8 Exact phrase
policy · §9 Handoff protocol · §10 Single vs dual-agent · §11 Evidence pack format · §12 Deterministic
evidence rules · §13 GitHub labels · §14 GitHub status checks · §15 Telegram/Slack format · §16 Stage
compression · §17 Shadow-first rollout · §18 Non-goals · §19 Roadmap · §20 No Numeric Scoring · §21
Intent-Based Evaluation · §22 Qualification Boundary · §23 Novel Product Gate · §24 Adaptive Receipt
Rules · §25 Receipt Taxonomy · §26 Anti-Slop Rules · §27 Standards Drift Guard · §28 Technology Radar
· §29 Aggregated Trend Signals · §30 Independent Technical Moat. Matches Stage 256B/256B-1 reports.

## 4. Policy spec summary (Part I)

Risk-tiered autopilot operating model: 5 tiers (0 docs → 4 critical), 20-condition auto-advance gate,
21 stop triggers, 20 hard human gates with scoped exact-phrase approvals, Claude/Codex lead+challenge
handoff, 22-field evidence pack, deterministic-evidence rule (risk booleans from git/CI/diff facts,
not agent prose), 14 GitHub labels + 7 status checks, Telegram/Slack decision summary, stage
compression rules, shadow-first rollout (classify+evidence+recommend before any auto-merge), non-goals,
roadmap (257A–261A + bridge 256/257).

## 5. Product boundary / receipt policy summary (Part II)

Constrains Simsa from becoming a fake judge / scoring tool / slop generator / closed-loop policy
machine. Covers no-numeric-scoring, intent-based evaluation, qualification boundary, novel product
gate, adaptive receipts, 6-type receipt taxonomy, anti-slop rules, standards drift guard, technology
radar, aggregated/privacy-preserving trend signals, and the independent technical moat (governance,
not model).

## 6. No Numeric Scoring Policy summary (§20)

Versioned 1.0. Bans generic numeric scores (false authority) → 8 readiness states (Ready · Conditionally
Ready · Needs Clarification · Needs Evidence · Needs Expert Review · Not Applicable · Not Judged · Do
Not Build Yet) + always explain ready/unclear/missing/safe-next/not-yet.

## 7. Intent-Based Evaluation summary (§21)

Evaluate against the user's declared intent (10 dimensions), not a universal idea-quality score; ask
clarifying questions when intent is unclear; never judge an idea good/bad absolutely.

## 8. Qualification Boundary summary (§22)

CAN assess buildability/testability/readiness/risk/evidence-gaps; MUST NOT certify market/investment/
founder/legal/medical/financial/scientific/originality/unevidenced-domain. Lacking qualification →
Unknown / Needs Evidence / Needs Expert Review / Not Judged / Out of Scope.

## 9. Novel Product Gate summary (§23)

No penalty for missing standard category conventions; evaluate the product hypothesis (13 dimensions)
+ 7 hypothesis questions (what must be true, who cares first, what behavior proves interest, smallest
test, what not to build, what evidence changes plan, what needs expert validation).

## 10. Adaptive receipt / receipt taxonomy summary (§24–25)

Receipts adapt to project type + stage (Required/Recommended/Optional/Later/Not Applicable/Unknown;
every N/A carries a reason). 6 receipt types: Idea · PRD · Build · Release Gate · Progress · Technology
Recommendation; each distinguishes 6 missing/unknown states (blocking · later · N/A · evidence-insufficient
· outside-qualification · requires-expert-review).

## 11. Anti-slop / standards drift / technology radar summary (§26–28)

Anti-slop: bans generic scoring, unsupported confidence, stale-as-current, trend-without-fit,
SaaS-everywhere, blocker-everywhere, hidden uncertainty, self-process-optimizing, evidence-untethered
summaries; every recommendation carries evidence/assumptions/unknowns/reasoning/safe-next/not-yet.
Standards drift guard: Simsa's own rules are versioned + reviewed and can declare themselves possibly
outdated. Technology radar: Discover/Assess/Trial/Adopt/Hold/Reject with full adoption analysis; never
recommend tech just because it is new.

## 12. Independent technical moat summary (§30)

Moat is governance, not model/GPU: Acceptance Graph · Receipt Schema · Policy Engine · Evidence Pack
Generator · Risk Classifier · Agent Handoff Protocol · Connector Layer · Audit Log · Deployment Modes
· Standards Radar · Privacy-Preserving Trend Layer. Acceptance Graph `Idea → Clarifying Answers → PRD
→ Acceptance Criteria → Build Tasks → PR → Tests → Evidence → Gate Decision → Receipt`. Enterprise/
on-prem: sell the governance layer, BYO model/cloud/Git/CI/LLM.

## 13. Pre-merge verification results

- diff `main...HEAD`: only `docs/simsa-autopilot-operating-model.md` (docs-only)
- `pnpm typecheck`: **57/57** (FULL TURBO) · `pnpm verify`: **green**
- PR #175 CI: Node 20 **pass** · Node 22 **pass**

## 14. Merge result

Squash-merged via `gh pr merge 175 --squash`.
- squash title: "Stage 256B — Simsa Autopilot policy spec code readiness"
- state **MERGED** · mergedAt 2026-06-27T17:17:41Z · merge commit **`a302cd0`** (`a302cd05fcbd1e4e7aed5f1718680e386335294d`)

## 15. Main HEAD after merge

- `git checkout main` + `git pull --ff-only` → HEAD **`a302cd0`** · HEAD == origin/main · worktree clean
- Merge contains exactly 1 file (`docs/simsa-autopilot-operating-model.md`, +472). `git diff 7dad790
  a302cd0` over `apps/ packages/ .github/ wrangler.toml *.ts *.mjs` is **empty** (docs-only confirmed).

## 16. Post-merge verification results

- doc present on main; Part I header + Part II header both present (grep count 2)
- `pnpm typecheck`: **57/57** · `pnpm verify`: **green**
- no runtime automation, no auto-merge enablement, no migration, no deploy config, no env/secret, no
  auth policy change, no dashboard code on main.

## 17. Live production impact confirmation

**0.** Docs-only merge does not touch the Worker. Post-merge live:
- `/api/auth/ok` **200** `{"ok":true}` · sign-up **403** `signup_disabled`
- Worker `/health` **200** (version **0.13.15**, unchanged) · `/workspace/membership/me` **404** (PR #174 not deployed)
- D1 (pre-merge read, rows_written 0): workspaces **0** · members **0** · workspace_projects **3** ·
  workspace_id NULL **3/3** · user_key **3/3** · user **1** · account **1** · session **1** · verification **0** — unchanged.

## 18. Explicit non-actions

No runtime automation · no GitHub Actions automation · **no auto-merge enablement** · no deploy
(wrangler/vercel) · no production D1 mutation · no migration apply · no workspace/member row creation ·
no workspace_projects update · no project claim · no legacy userKey migration · no destructive cleanup
· no smoke account deletion · no user creation · no sign-up/sign-in · no auth rollback · no env change ·
no secret change · no AUTH_SIGNUP_MODE change · no AUTH_ENABLED change · no OAuth · no DNS · no CORS
production change · no payment · no MCP/npm publish · no broad launch. Dogfood PRs #121–130 untouched.
All production access was read-only HTTP + read-only SQL.

## 19. Recommended next stage

**Stage 257A — Simsa Evidence Pack Generator code-readiness PR.** Suggested approval phrase:
"Simsa evidence pack generator code readiness approved."

Alternative runtime path: **Stage 256 — Auth Workspace Bridge Deploy Readiness Gate.** Suggested
approval phrase: "Auth workspace bridge deploy readiness approved."

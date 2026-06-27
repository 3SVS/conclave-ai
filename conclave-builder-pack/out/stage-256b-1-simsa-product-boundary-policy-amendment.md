# Stage 256B-1 — Simsa Product Boundary & Receipt Policy Amendment

**Date:** 2026-06-27
**Decision:** **Option A — PR #175 amended with Simsa product boundary and receipt policy.**

---

## 1. Approval phrase observed

> "Simsa product boundary policy amendment approved."

Scope: docs-only amendment to the existing PR #175 policy spec. No runtime code, no automation, no
auto-merge, no deploy, no production change. None of the disallowed actions were performed.

## 2. PR #175 branch / HEAD before and after

- branch: `feat/stage-256b-simsa-autopilot-policy-spec`
- head **before:** `5ca5d13` (`5ca5d13868403ce4b8c57484394c7f309cd7ca3b`)
- head **after:** `d6e5ca2` (`d6e5ca2d88e6d97a9e233addbd5f4b7d42db3083`)
- base main: `7dad790` (unchanged)

## 3. Production baseline (read-only)

- `/account` **200** · `/api/auth/ok` **200** `{"ok":true}` · sign-up **403** `signup_disabled`
- Worker `/health` **200** (0.13.15) · `/workspace/membership/me` **404** (PR #174 merged, not deployed)
- D1 (unchanged): workspaces **0** · members **0** · workspace_projects **3** · workspace_id NULL **3/3** · user_key **3/3** · user **1** · account **1** · session **1** · verification **0**

## 4. Files changed

1 file, additive only — **+164 / -0** (amendment commit `d6e5ca2`):
- `docs/simsa-autopilot-operating-model.md` (appended "Part II — Product Boundary & Receipt Policy",
  §20–§30, after the existing §1–§19 operating model)

No runtime code, no migration, no `wrangler.toml`, no deploy config, no `.env`/secret, no GitHub
Actions, no auto-merge enablement.

## 5. No Numeric Scoring Policy (§20)

Versioned policy (1.0). Bans generic numeric scores (Idea Quality 82/100, PRD Score, Founder Score,
Market Potential, Originality) — they create false authority. Replaced by 8 readiness states (Ready ·
Conditionally Ready · Needs Clarification · Needs Evidence · Needs Expert Review · Not Applicable ·
Not Judged · Do Not Build Yet) + always explain ready/unclear/missing/safe-next/not-yet.

## 6. Intent-Based Evaluation (§21)

Evaluate artifacts against the user's **declared intent**, not a universal idea-quality score.
Identifies 10 intent dimensions; asks clarifying questions when intent is too unclear to generate/
evaluate a PRD; never judges an idea good/bad in absolute terms.

## 7. Qualification Boundary (§22)

CAN assess: clarity, completeness, consistency, buildability, testability, implementation alignment,
release readiness, risk exposure, evidence gaps, next safe action. MUST NOT certify: market success,
investment worthiness, founder quality, legal/medical/scientific correctness, financial outcome,
final originality, unevidenced domain claims. Lacking qualification → Unknown / Needs Evidence / Needs
Expert Review / Not Judged / Out of Scope for Simsa.

## 8. Novel Product Gate (§23)

Products outside known categories are **not penalized** for missing standard conventions; instead the
**product hypothesis** is evaluated (13 dimensions). Includes 7 hypothesis questions (What must be
true? · Who must care first? · What behavior proves interest? · Smallest test? · What not to build
yet? · What evidence changes the plan? · What needs domain expert validation?).

## 9. Adaptive Receipt Rules (§24)

Receipts adapt to project type + stage. Each area marked Required / Recommended / Optional / Later /
Not Applicable / Unknown — every *Not Applicable* carries a reason. Examples: billing Required for
paid SaaS but N/A for internal/research/OSS tools; invite/share Required for team products but Later
for single-user MVPs; privacy/account-deletion Required before public launch but Later for internal
prototypes.

## 10. Receipt Taxonomy (§25)

6 receipt types: Idea · PRD · Build · Release Gate · Progress · Technology Recommendation. Each
distinguishes 6 states of "missing/unknown": missing-and-blocking · missing-but-later · missing-
because-not-applicable · unknown-because-evidence-insufficient · outside-Simsa's-qualification ·
requires-expert-review.

## 11. Anti-Slop Rules (§26)

Bans: generic checklist scoring · unsupported confidence · pretending outdated knowledge is current ·
trendy tools without fit analysis · treating every project as SaaS · treating every missing category
as a blocker · hiding uncertainty · optimizing Simsa's own process over user value · summaries not
tied to evidence. Every major recommendation must carry evidence/assumptions/unknowns/project-specific
reasoning/what-changed/what-improved/what's-weak/safe-next/not-yet.

## 12. Standards Drift Guard (§27)

Simsa's own judgment rules are versioned + reviewed (policy version · date · reason · applies/
not-applies examples · known failure modes · review cadence). Simsa must be able to say "our standard
may be outdated; a review is recommended."

## 13. Technology Radar (§28)

Discover / Assess / Trial / Adopt / Hold / Reject classification. Each recommendation: why-relevant-now
· expected benefit · adoption risk · compatibility · operational burden · rollback path · smallest
useful experiment · adoption criteria · reasons not to adopt. **Never recommend tech just because it
is new.**

## 14. Aggregated Trend Signals / Privacy (§29)

Ecosystem insights **only from anonymized + aggregated metadata**. Allowed: category, stage, common
blockers/missing-PRD-fields/stacks/workflows/risk-gates/launch-blockers, adopt-hold-reject patterns,
build-to-release conversion. Never exposed: raw ideas, proprietary PRDs, code, customer names,
workspace strategy, identifiable data, secrets. Must be anonymized · aggregated · permission-aware ·
thresholded · opt-out capable · **separated from model-training consent.**

## 15. Independent Technical Moat (§30)

Moat is NOT model ownership/GPU — it is: Acceptance Graph · Receipt Schema · Policy Engine · Evidence
Pack Generator · Risk Classifier · Agent Handoff Protocol · Connector Layer · Audit Log · Deployment
Modes · Standards Radar · Privacy-Preserving Trend Layer. Acceptance Graph: `Idea → Clarifying Answers
→ PRD → Acceptance Criteria → Build Tasks → PR → Tests → Evidence → Gate Decision → Receipt`.
Enterprise/on-prem thesis: sell the **governance layer, not the model** (BYO model/cloud/Git/CI/LLM;
Simsa brings receipt/gate/policy/evidence/approval/audit). Key line: *"Simsa's proprietary value is
not that it generates AI output — it is that it makes AI-generated product and engineering work
acceptable, reviewable, auditable, and governable."*

## 16. Verification results

- `git diff --cached --stat`: 1 file, +164/-0 (docs-only)
- `git diff --name-only main...HEAD`: only `docs/simsa-autopilot-operating-model.md`
- `pnpm typecheck`: **57/57** (FULL TURBO — no build surface touched)
- `pnpm verify`: **green** · pre-push verify **passed**
- PR #175 CI (post-amendment, head `d6e5ca2`): `typecheck-build (20)` **pass** · `(22)` **pass**

## 17. PR #175 status / URL

**PR #175** — https://github.com/3SVS/conclave-ai/pull/175
OPEN · MERGEABLE · mergeStateStatus CLEAN · head `d6e5ca2`. PR body updated (Part I + Part II). **Not merged.**

## 18. Docs path

This report: `conclave-builder-pack/out/stage-256b-1-simsa-product-boundary-policy-amendment.md`
Amended policy doc (in PR): `docs/simsa-autopilot-operating-model.md`

## 19. Local checkpoint commit

Committed to local checkpoint branch `docs/stage-177-dual-pr-merge-order-checkpoint` (report only).
Not pushed; not on main; no PR for the report.

## 20. Safety scan / no-work confirmation

No: production deploy · D1 mutation · migration apply · workspace/member row creation ·
workspace_projects update · project claim · legacy userKey migration · user creation · sign-up/sign-in
· smoke cleanup · auth rollback · env/secret change · AUTH_SIGNUP_MODE change · AUTH_ENABLED change ·
OAuth · DNS/CORS production change · payment · MCP/npm publish · broad launch · **auto-merge enabled**.
Dogfood PRs #121–130 untouched. All production access was read-only HTTP + read-only SQL.

## 21. Production impact

**0.** PR #175 remains docs-only, unmerged, undeployed. Worker 0.13.15; D1 unchanged; auth activation
+ sign-up policy unchanged; membership endpoint still 404.

## 22. Recommended next stage

**Stage 256C — PR #175 Merge Gate.** Only after: "PR #175 merge approved."

Next product stage after merge: **Stage 257A — Simsa Evidence Pack Generator code-readiness PR.**
Alternative runtime path: **Stage 256 — Auth Workspace Bridge Deploy Readiness Gate.**

# Stage 256A — Simsa Autopilot Operating Model Readiness

**Date:** 2026-06-27
**Type:** Planning / readiness only (no code, no PR, no deploy, no production mutation)
**Decision:** **Option A — Simsa Autopilot operating model readiness complete; proceed to policy spec PR.**

---

## 1. Approval phrase observed

> "Simsa autopilot operating model readiness approved."

Scope: this approves **defining** the autopilot operating model only. It does NOT approve code,
PRs, deploys, production D1 schema/data mutation, migration apply, workspace/member creation,
project claim, legacy userKey migration, destructive cleanup, smoke account deletion, production
users, production sign-up/sign-in, auth rollback, env/secret changes, AUTH_SIGNUP_MODE changes,
OAuth, DNS/CORS, payment, MCP/npm publish, or broad/invite/share/membership launch. None performed.

## 2. Branch / HEAD

- branch `main`, HEAD **`7dad790`** (`7dad7904d24efdaab9bf774cd245ee76e232a4ac`), HEAD == origin/main, worktree clean.
- No deploy after Stage 246; no production D1 mutation after Stage 252; no env/secret change after Stage 244. AUTH_ENABLED true; AUTH_SIGNUP_MODE unset.

## 3. Current production baseline (read-only)

- `app.trysimsa.com/account` → **200** · `/api/auth/ok` → **200** `{"ok":true}` · sign-up → **403** `signup_disabled`
- Worker `/health` → **200**, version **0.13.15** · `/workspace/membership/me` → **404** (PR #174 not deployed — expected)
- D1 (rows_written 0): workspaces **0** · workspace_members **0** · workspace_projects **3** · workspace_id NULL **3/3** · user_key present **3/3** · user **1** · account **1** · session **1** · verification **0**

## 4. Current manual gate inventory (Stages 223–255)

Observed gate types and what they actually cost vs. what they actually protected:

| Gate type | Evidence collected | Approval required | Actually risky? | Automatable? | Must stay human |
| --- | --- | --- | --- | --- | --- |
| Readiness gate | plan, baseline, diff scope | phrase | No (planning) | **Yes** (fold into PR) | No |
| Code-readiness PR gate | build/test/typecheck/verify, diff stat | phrase | No (not deployed) | **Yes** if Tier ≤1 | No |
| PR merge gate | CI green, MERGEABLE/CLEAN, diff review | phrase | Low (additive, no deploy) | **Yes** if Tier ≤1 | No |
| Deploy readiness gate | preview, deploy plan, rollback | phrase | Medium (about to go live) | Partial (report auto) | **Deploy = yes** |
| Production deploy gate | wrangler/vercel deploy | phrase | **High** | No | **Yes** |
| D1 migration readiness gate | migration file static test, additivity | phrase | Low (file only) | Partial | No (apply=yes) |
| D1 apply gate | targeted `--remote --file` apply | phrase | **High** (schema) | No | **Yes** |
| Post-deploy observation gate | HTTP + D1 read-only re-check | phrase | No (read-only) | **Yes** (auto, alert-on-anomaly) | No |
| Env/secret provisioning gate | secret set out-of-band | phrase | **High** | No | **Yes** |
| Auth activation gate | AUTH_ENABLED flip | phrase | **Critical** | No | **Yes** |
| Dashboard deploy gate | vercel deploy | phrase | Medium-High | No | **Yes** |
| Rollback/containment gate | revert/disable plan | phrase | **High** | No | **Yes** |
| Product launch gate | sign-up open / broad launch | phrase | **Critical** | No | **Yes** |

**Repeated-every-stage checks** (prime candidates for a Simsa evidence pack): git baseline + HEAD==origin,
diff stat + file-scope scan, build/test/typecheck/verify, smokes, CI status, production HTTP probes,
D1 read-only drift, stale-PR-untouched, "explicit non-actions" enumeration.

**Core finding:** the bulk of approval load (readiness + code-readiness + merge for Tier 0/1 work)
guards work with **zero production impact**. The genuinely risky gates are a small set: deploy, D1
apply, env/secret, auth activation, launch. Autopilot should collapse the former and harden the latter.

## 5. Risk tier model

- **Tier 0 — Informational / docs-only:** docs, reports, comments, planning md. Autopilot: auto-checks, auto-PR, auto-merge if CI green + branch protection. Human gate: only for user-facing/legal/brand copy.
- **Tier 1 — Low-risk code, no production impact:** tests, pure helpers, type defs, read-only endpoint *not deployed*, non-live UI copy, no migration. Autopilot: implement → self-review → cross-review → PR → CI → auto-merge if policy passes. Human gate: optional summary only.
- **Tier 2 — Runtime code, deploy required, no data mutation:** read-only central-plane endpoint, dashboard surface, safe routing/rewrite. Autopilot: PR + CI + preview + deploy-readiness report. Human gate: **production deploy approval still required**.
- **Tier 3 — Production data/schema/env risk:** D1 schema apply, env/secret, auth policy, signup mode, workspace/member creation logic, project claim. Human gate: **required, exact phrase, no auto-apply**.
- **Tier 4 — Critical / irreversible / external-facing:** destructive cleanup, payment, public launch, DNS, OAuth prod, account deletion, bulk migration, customer-data access. Human gate: **required, two-step, rollback/containment plan mandatory**.

## 6. Auto-advance rules

**Auto-advance eligible:** docs-only PRs · tests-only PRs · pure-helper changes with no runtime
imports · PRs with no migration/deploy/env/data-mutation · CI green AND risk tier ≤ 1 · diff-scan
confirms no dangerous files/patterns · local report/checkpoint creation · read-only production
observation · stale-PR-untouched verification · evidence-pack generation.

**Auto-advance MUST halt (→ human gate) if any:** migration file added/changed · `wrangler.toml`
changed · deployment workflow changed · `.env`/secret-related files changed · auth activation or
sign-up policy touched · payment/OAuth/DNS/CORS touched · production deploy needed · production D1
apply needed · data-write path added · destructive SQL detected · `workspace_projects` UPDATE
detected · project claim introduced · invite/share permission introduced · broad-launch copy
introduced · CI fails · diff exceeds threshold · agent reviews conflict · risk score ≥ Tier 2
without a prior policy explicitly allowing it.

## 7. Hard human gates (always exact-phrase)

production central-plane deploy · production dashboard deploy · production D1 schema apply ·
production D1 data mutation/backfill · env/secret changes · AUTH_ENABLED changes · AUTH_SIGNUP_MODE
changes · OAuth production setup · payment/billing setup · DNS/domain/CORS production changes ·
destructive cleanup · smoke account deletion · project claim/backfill · workspace/member production
write behavior · invite/share launch · public sign-up opening · public launch · MCP/npm publish ·
customer data export/delete · rollback that disables auth or changes production behavior.

Exact-phrase format (preserve current convention):
- PR merge: `PR #<number> merge approved.`
- central-plane deploy: `<feature> central-plane production deploy approved.`
- dashboard deploy: `<feature> dashboard production deploy approved.`
- D1 apply: `<feature> production D1 apply approved.`
- env/secret: `<feature> production env provisioning approved.`
- public launch: `<feature> public launch approved.`

## 8. Claude/Codex agent handoff protocol

1. Simsa creates a task packet from issue/stage. 2. Lead agent implements on a branch. 3. Lead agent
runs required verification. 4. Lead agent writes a self-review. 5. Challenge agent performs
cross-review. 6. Lead agent fixes only high/medium findings. 7. Simsa compiles the evidence pack.
8. Simsa assigns a risk tier. 9. Simsa decides: auto-advance / request human approval / hold-contain.
10. Bae receives only a decision summary when human input is needed.

- **Dual-agent (lead + challenge) required:** auth · migrations · payment · permissions · deploy ·
  data model · broad launch · critical bug fixes.
- **Single-agent sufficient:** docs · tests · copy · narrow UI fixes · pure helpers · low-risk
  read-only instrumentation.

## 9. Evidence pack format

Standard schema (JSON + rendered markdown) per task:
`taskId/stageId · branch · base · head · prNumber · changedFiles[] · diffRiskScan ·
migrationDetected(bool) · deployRequired(bool) · d1MutationRisk(bool) · envSecretRisk(bool) ·
authSignupRisk(bool) · paymentOAuthDnsRisk(bool) · userFacingLaunchRisk(bool) · testsRun[] ·
ciStatus · previewDeployStatus · productionBaseline(optional) · d1RowDrift(optional) ·
agentSelfReview · crossReviewSummary · unresolvedBlockers[] · rollbackContainmentPlan ·
recommendedDecision · requiredApprovalPhrase(optional)`.

Determinism rule: the pack is assembled from git/CI/diff facts, not LLM prose — agent narrative
lives only in `agentSelfReview`/`crossReviewSummary` fields, never in the risk booleans.

## 10. GitHub labels / status checks

Labels: `simsa:risk-0-docs` · `simsa:risk-1-low` · `simsa:risk-2-runtime` · `simsa:risk-3-prod-data`
· `simsa:risk-4-critical` · `simsa:auto-eligible` · `simsa:human-gate` · `simsa:deploy-required` ·
`simsa:d1-required` · `simsa:env-required` · `simsa:auth-required` · `simsa:blocked` ·
`simsa:ready-for-bae` · `simsa:autopilot-held`.

Status checks: Simsa Risk Classification · Simsa Diff Safety Scan · Simsa Evidence Pack · Simsa Agent
Self-Review · Simsa Cross-Review · Simsa Human Gate Required · Simsa Auto-Merge Eligibility.
(Auto-merge only when "Human Gate Required" is absent AND "Auto-Merge Eligibility" passes.)

## 11. Telegram/Slack summary format

```
[Simsa] <title>
Risk: Tier <n> <label>
Changed: <one-line what>
No: <deploy/D1/writes/claim — what did NOT change>
CI: <green/red>
Production impact: <none / pending deploy / …>
Recommendation: <auto-merge eligible / approve / hold>
Approval needed: "<exact phrase>"
[Approve] [Hold] [Ask cross-review] [Rollback plan] [More detail]
```

Example:
```
[Simsa] PR #174 Bridge Endpoint
Risk: Tier 1 low, no production impact
Changed: read-only /workspace/membership/me on main
No: deploy, D1 mutation, workspace writes, claim
CI: green
Recommendation: auto-merge eligible
Approval needed: "PR #174 merge approved."
```

## 12. Stage compression rules

- Docs-only: readiness + PR + merge → **one autopilot flow**.
- Low-risk code: code-readiness + merge → **auto, or one human summary**.
- Runtime deploy: code PR + merge → auto if low-risk; **deploy stays a gate**.
- D1 migration: readiness + code PR + merge may stay separate; **apply stays a hard gate**.
- Env/auth/payment/DNS: **never compress the production-mutation gate**.
- Post-deploy observation: auto-run, notify only on anomaly.

Old: `readiness → PR → merge → deploy readiness → deploy → observation`
New: `agent work → PR/CI/evidence → auto-merge or approval → deploy-readiness summary → human deploy approval → auto observation`

## 13. Implementation roadmap

- **Stage 256B** — Simsa Autopilot Policy Spec PR (`docs/policy/autopilot-operating-model.md` + risk-tier spec; no runtime change).
- **Stage 257A** — Simsa Evidence Pack Generator code-readiness PR (JSON/md from PR diff + CI + labels; no deploy).
- **Stage 258A** — Simsa Risk Classifier code-readiness PR (file/path/pattern risk classification; no auto-merge yet).
- **Stage 259A** — Simsa Telegram Decision Summary PR (summary format + approval-phrase extraction; no production mutation).
- **Stage 260A** — Simsa Low-Risk Auto-Merge readiness gate (policy gate for docs/tests/pure-helper auto-merge only).
- **Stage 261A** — Simsa Agent Handoff Workflow PR (Claude/Codex self-review + cross-review protocol).

Kept separate (bridge runtime path): **Stage 256** — Auth Workspace Bridge Deploy Readiness Gate ·
**Stage 257** — Auth Workspace Bridge Production Deploy Gate.

## 14. Initial autopilot policy recommendation (conservative first cut)

Allow auto-merge **only when ALL** are true: Tier 0 or 1 · no migration files · no deploy files · no
`wrangler.toml` · no `.env`/secrets · no auth/signup policy · no payment/OAuth/DNS · no production API
behavior change · no D1 writes · no destructive patterns · CI green · branch up-to-date · diff under
configured threshold · Simsa evidence pack generated · ≥1 agent self-review · no unresolved
cross-review blocker. **Everything else → human approval required.** Start with classifier +
evidence pack in *shadow* (label/comment only, no auto-merge) before enabling auto-merge — mirrors
the existing Sprint-E5 "shadow before live" substrate convention.

## 15. Risks / holds

over-automation → unsafe merge · hidden production impact from "small" code · agent-hallucinated
verification (mitigate: Simsa parses CI/git facts, not agent claims) · CI green but product unsafe ·
stale branch / outdated baseline (require HEAD==origin + up-to-date) · approval-phrase spoofing
(bind phrase to PR number + actor + immutable audit) · Telegram action ambiguity (explicit phrase,
not a bare button) · logs leaking secrets (never echo secret values — existing rule) · noisy evidence
pack → alert fatigue · Bae ignoring alerts (compress to decision-only) · auto-merge before rollback
plan (require rollback field for Tier ≥2) · audit trail not durable · enterprise-trust risk if
automation is not explainable (every auto-decision must carry its evidence pack).

## 16. M&A / enterprise readiness note

This is the product thesis: **Simsa is an AI software acceptance and governance layer for
agent-driven development**, not merely an app with auth/workspaces. The risk-tier + evidence-pack +
hard-gate model is the diligence-ready artifact — it makes "which agent changes can ship without a
human, and why" explainable and auditable, which is exactly what an acquirer or enterprise buyer
underwrites. Landing it conservatively (shadow → low-risk auto-merge → never auto-mutate production)
keeps trust intact while compressing Bae's micro-approval load.

## 17. Explicit non-actions

No code implementation · no PR opened · no deploy (wrangler/vercel) · no production D1 mutation · no
migration apply · no workspace/member row creation · no workspace_projects update · no project claim ·
no legacy userKey migration · no destructive cleanup · no user creation · no production sign-up/sign-in ·
no auth rollback · no env change · no secret change · no AUTH_SIGNUP_MODE change · no AUTH_ENABLED
change · no OAuth · no DNS · no CORS production change · no payment · no MCP/npm publish · no broad
launch. All production access was read-only HTTP + read-only SQL (SELECT/COUNT, rows_written 0).
Dogfood PRs #121–130 untouched.

## 18. Recommended next stage

**Stage 256B — Simsa Autopilot Policy Spec PR.** Suggested approval phrase:
"Simsa autopilot policy spec code readiness approved."

Alternative (if Bae prioritizes the runtime bridge first):
**Stage 256 — Auth Workspace Bridge Deploy Readiness Gate.** Suggested approval phrase:
"Auth workspace bridge deploy readiness approved."

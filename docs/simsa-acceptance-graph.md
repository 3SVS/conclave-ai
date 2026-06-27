# Simsa Acceptance Graph

> **Status:** Foundation (Stage 257A). Defines the data contracts and pure deterministic helpers
> for Simsa's core acceptance system. This stage ships **contracts + helpers + tests only** — it does
> NOT run a browser/interaction runner, does NOT mutate data, and does NOT enable auto-merge. See
> `docs/simsa-autopilot-operating-model.md` for the governing policy (this file implements its
> Part II product-boundary rules).

## Why Simsa is not a code-review wrapper

A code-review tool answers "is this diff acceptable?" Simsa answers a larger question: **"has the
user's intent been translated, without silent gaps, into a PRD, a build plan, an implementation, and
verifiable acceptance evidence?"** The diff is one node in that chain, not the whole story.

## Why Simsa is not a generic QA tool

A generic QA tool runs tests and reports pass/fail. Simsa tracks **what could not be verified** as a
first-class outcome. Absent evidence is reported **Not Verified**, never **Pass**. Tests passing while
the product UI was never exercised is reported honestly, not as "Done".

## The Acceptance Graph

A normalized, deterministic graph linking the artifacts of a project:

```
Idea / Intent → Clarifying Answers → PRD → Acceptance Criteria
   → Build Plan → Implementation Evidence → Cross-Review Evidence
   → Visual / Interaction Evidence → Gate Decision → Receipt
```

Nodes (see `apps/central-plane/src/acceptance-graph.ts`):

1. **User Intent** — summary, target first user, desired behavior change, non-goals, assumptions, unknowns.
2. **Clarifying Answers** — question/answer pairs with why they were asked and what they affect.
3. **PRD** — requirements, user flows, **acceptance criteria** (id + text), edge cases, out-of-scope.
4. **Build Plan** — tasks, task→criteria links, dependencies, risk notes.
5. **Implementation Evidence** — repo/branch/PR, changed files, diff summary, **tests linked to criteria**, CI status, deployment status.
6. **Cross-Review Evidence** — reviewer/role, findings, severity, affected criteria, unresolved blockers.
7. **Visual / Interaction Evidence** — *contract only in this stage*: routes detected, clickable elements, safe clicks, skipped-destructive, auth-blocked, failed interactions, screenshots, console/network errors, `notVerified`.
8. **Gate Decision** — decision state, reasons, verified / broken / not-verified, user decision needed, human-gate required, next safest action.
9. **Receipt** — the durable, shareable artifact (no numeric score).

## Intake support: idea / PRD / repo / mixed

Simsa supports projects that enter from any direction:

- **idea-only** → has intent, lacks PRD → decision tends to *Needs Clarification* / *Needs Evidence*.
- **PRD-first** → criteria exist, implementation does not → implementation is *Not Verified*.
- **repo-first** → code exists, intent/PRD missing → *User Acceptance Required* (confirm the code matches intent).
- **mixed** → more than one of the above.

Intake is inferred deterministically (`deriveIntakeSource`) when not declared.

## Product evidence vs engineering evidence vs visual evidence

- **Product evidence** — is there intent? a PRD? acceptance criteria to verify against?
- **Engineering evidence** — tests (pass/fail/skipped, linked to criteria), CI status, deployment status.
- **Visual evidence** — did the actual rendered product behave? **When missing, product/UI behavior is
  Not Verified** regardless of how many unit tests passed (`visualEvidenceMissing` risk flag).

## Verified / Broken / Not Verified / User Decision Needed

Per acceptance criterion, status is derived deterministically from linked test observations:

- a **failing** linked test → **broken**
- else a **passing** linked test → **verified**
- else (no linked test, or only skipped) → **not verified**

`User Acceptance Required` is raised when an implementation makes a choice the PRD left ambiguous, or a
repo-first project lacks a PRD — a human accept/reject is needed, not a Simsa verdict.

## Decision states (no numeric scoring)

`Ready · Conditionally Ready · Needs Clarification · Needs Evidence · Needs Expert Review · Not
Applicable · Not Judged · Do Not Build Yet · Not Verified · Needs Fix · User Acceptance Required`.

There is **no** "82/100", no "PRD Score", no "Founder Score". `assertNoNumericScores` guards receipts
against any numeric-score field or `NN/100` string.

## Evidence pack & risk flags

`deriveEvidencePack` (see `apps/central-plane/src/evidence-pack.ts`) compiles the graph into a
deterministic pack. Risk flags are **booleans derived from changed-file paths + diff text**, never from
agent prose (policy §12): `migrationChanged · deployConfigChanged · envSecretTouched · authPolicyTouched
· paymentTouched · oauthTouched · dnsCorsTouched · d1WriteDetected · destructiveActionDetected ·
workspaceClaimTouched · publicLaunchTouched · visualEvidenceMissing · acceptanceCriteriaMissing ·
userIntentAmbiguous`. Any of the first eleven forces a **hard human gate** and a required approval
phrase.

## Cross-agent review position

Cross-review evidence is a node, not a score. Unresolved blockers are treated as **broken** signals
(something is actively wrong), which outrank "not verified" in the gate decision. Automated cross-agent
review wiring is a later stage (259A); this stage only defines where its evidence attaches.

## Visual / interaction gate position

The visual node is a **contract** here. A real runner (route discovery, safe-click coverage, skip of
destructive actions, screenshot/console/network capture) is a later spike (260A). Until then, every
project with UI behavior reports `visualEvidenceMissing = true` and is **Not Verified** at the product
level — by design, so Simsa never over-claims.

## Limitations (explicit)

- Simsa does **not** claim to find all bugs.
- Simsa does **not** claim to produce a perfect or "100% ideal" product.
- Risk flags read file paths and diff text; they do not execute the diff.
- Visual evidence is not yet collected — UI behavior is unverified until the runner lands.
- Simsa does not certify market/founder/legal/medical/financial/scientific claims (policy §22).

## Future stages

- **258A** — Artifact Alignment Gate (PRD ↔ implementation coverage).
- **259A** — Cross-Agent Review Evidence automation.
- **260A** — Visual / Interaction Coverage Gate (the real runner).
- later — Receipt UI surface in the dashboard.

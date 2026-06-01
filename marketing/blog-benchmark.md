title: One reviewer says "looks good." Three find 3× more. What we learned dogfooding a code-review council.
slug: three-model-council-pr-review-benchmark
audience: indie devs / AI-app builders shipping fast
canonical: https://conclave-ai.dev/blog/three-model-council-pr-review-benchmark

---

# One reviewer says "looks good." Three find 3× more.

AI writes most of our code now. The reviewer is still one model (or one tired human) skimming a diff. We wanted to know: does running **three independent frontier models** as a council actually catch more than one — or is it just more tokens and noise?

So we dogfooded it. Here's the run, the numbers, and the part that surprised us: the biggest gap wasn't bugs. It was **scope drift** — code that runs but isn't what the spec asked for.

## The setup

- **15 PRs** seeded with synthetic bugs, across **5 popular vibe-coder Next.js templates** (Vercel commerce, ai-chatbot, next-forge, platforms, postgres-auth-starter).
- Each PR reviewed two ways: **Conclave** (Claude + GPT-5 + Gemini, debated, against an attached PRD) vs **a single agent** (Claude alone).
- Scored on: catch rate (did it find the planted blockers) and **mean blockers surfaced per PR** (depth).

> Honest caveat up front: this is an **internal dogfooding run (n=15)**, indicative — not a peer-reviewed benchmark. Protocol and rubric live in [`/benchmarks`](https://github.com/3SVS/conclave-ai/tree/main/benchmarks). Treat it as a ratio, not gospel.

## The numbers

| | Conclave (3-agent) | Single agent |
|---|---|---|
| Catch rate (synthetic blockers) | 100% | 100% |
| **Mean blockers surfaced / PR** | **10.93** | 3.80 |
| Latency | 128s (parallel) | 12s |
| Cache hit rate | 39.9% | — |

Same catch rate — but **~3× the depth.** Both find the planted bug. The council also finds the seven things around it.

## Why three beats one (it's diversity, not horsepower)

The extra blockers weren't duplicates. They clustered in three buckets a single model consistently rated "minor enough to skip":

1. **Missing tests** for the path that was just changed.
2. **Edge cases** — empty/zero/negative inputs, the second concurrent click, the unauth'd request.
3. **Silent security gaps** — a query built by string concat, a check that lived in the UI but not the server, a token in the wrong place.

One model has one blind spot. A different model (different training, different priors) often doesn't share it. The council is just *structured disagreement* — and disagreement is where the missed blockers hide.

## The part we didn't expect: scope drift

The single biggest category — once we attached a PRD — wasn't a bug at all. It was the PR doing something **adjacent to** the spec: an extra field nobody asked for, a renamed behavior, a dropped requirement. The code ran. Tests (such as they were) passed. A diff-only reviewer had nothing to flag, because *nothing in the diff was wrong* — it just wasn't what we asked for.

This is the failure mode of the AI-coding era. Agents are great at producing *plausible* code fast. "Plausible" and "what you specified" are not the same thing, and only a reviewer that reads the spec can tell them apart.

## What we shipped

Conclave runs at the PR layer as a GitHub App: three models review every PR, debate blockers, an autofix worker proposes patches, and it learns from what you merge vs reject. Attach a PRD and it flags scope drift. Free on public repos, self-hostable (FSL).

→ **[Install the GitHub App](https://github.com/apps/conclave-ai-code-council)** · **[Try the demo](https://conclave-ai.dev)** · **[Read the protocol](https://github.com/3SVS/conclave-ai/tree/main/benchmarks)**

*If you run it on your own repo and the numbers don't hold, tell us — we'll publish what we find.*

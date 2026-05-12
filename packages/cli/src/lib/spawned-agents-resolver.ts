/**
 * v0.14.3 — Sprint E5 council wire-in: spawned-agents resolver.
 *
 * Before each council pass, the CLI fetches active spawned-agent
 * personas (status='trial' or 'promoted') matching the resolved review
 * domain. Each one becomes a ClaudeAgent instance whose system prompt
 * is the Haiku-synthesized persona. They join the council alongside
 * the hardcoded baseline agents (claude/openai/gemini/design).
 *
 * Status semantics in the council:
 *   - 'promoted' → full member, reject verdict counts.
 *   - 'trial'    → member with reduced agent-score weight (advisory).
 *                  The H2 #10 weight system already demotes <0.5
 *                  agents' rejects to advisory-rework — we synthesize
 *                  weight=0.4 for trial members so a single brand-new
 *                  spawned agent cannot block a merge during its
 *                  trial window.
 *
 * Cost: one HTTP call per pass (single GET with status=trial,promoted
 * via two queries). Worker returns the full row including system_prompt.
 * Failure mode is best-effort: any error → empty list → council runs
 * with baseline agents only.
 *
 * BYO users without INTERNAL_CALLBACK_TOKEN see an empty list — the
 * spawned-agents surface is operator-only since promoting an agent
 * requires a deliberate operator decision.
 */
const DEFAULT_API_BASE = "https://conclave-ai.seunghunbae.workers.dev";
const FETCH_TIMEOUT_MS = 4_000;

/** The trial-state weight that triggers H2 #10's advisory-rework demote. */
export const TRIAL_AGENT_WEIGHT = 0.4;

export interface ActiveSpawnedAgent {
  /** Sticky pk (sa_<sha8>) — the worker uses this as the foreign key. */
  id: string;
  /** Kebab-case identifier (e.g. "k8s-manifest"). Becomes the agent.id at council time. */
  agentId: string;
  displayName: string;
  domain: "code" | "design";
  status: "trial" | "promoted";
  systemPrompt: string;
}

interface SpawnedAgentWire {
  id: string;
  agent_id: string;
  display_name: string;
  domain: string;
  status: string;
  system_prompt: string;
}

interface SpawnedAgentsResponse {
  count: number;
  agents: SpawnedAgentWire[];
}

/**
 * Returns the union of trial + promoted spawned agents matching `domain`.
 * "mixed" reviews include BOTH 'code' and 'design' spawned agents (matches
 * the same union the baseline tier list does for mixed runs).
 *
 * Best-effort: failure to fetch returns an empty list and the review
 * proceeds with baseline agents only. Network/auth errors are silent.
 */
export async function fetchActiveSpawnedAgents(opts: {
  bearerToken?: string;
  apiBase?: string;
  domain: "code" | "design" | "mixed";
  fetchImpl?: typeof fetch;
}): Promise<ActiveSpawnedAgent[]> {
  if (!opts.bearerToken) return []; // operator-only surface

  const apiBase = (opts.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const domains: ReadonlyArray<"code" | "design"> =
    opts.domain === "mixed" ? ["code", "design"] : [opts.domain];

  const out: ActiveSpawnedAgent[] = [];
  for (const domain of domains) {
    for (const status of ["promoted", "trial"] as const) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      let r: Response;
      try {
        r = await fetchImpl(
          `${apiBase}/admin/spawned-agents?status=${status}&domain=${domain}`,
          {
            signal: ctrl.signal,
            headers: {
              accept: "application/json",
              authorization: `Bearer ${opts.bearerToken}`,
              "user-agent": "conclave-cli/spawned-agents-resolver",
            },
          },
        );
      } catch {
        clearTimeout(t);
        continue;
      } finally {
        clearTimeout(t);
      }
      if (!r.ok) continue;
      const j = (await r.json().catch(() => null)) as SpawnedAgentsResponse | null;
      if (!j || !Array.isArray(j.agents)) continue;
      for (const a of j.agents) {
        // Defensive: the worker only returns rows matching the WHERE
        // clause, but cross-check the domain field anyway in case of
        // future indexing changes.
        const dom: "code" | "design" = a.domain === "design" ? "design" : "code";
        if (dom !== domain) continue;
        out.push({
          id: a.id,
          agentId: a.agent_id,
          displayName: a.display_name,
          domain: dom,
          status: status === "promoted" ? "promoted" : "trial",
          systemPrompt: a.system_prompt,
        });
      }
    }
  }
  return out;
}

/**
 * Synthesize an entry for the agent-weights map for each trial spawned
 * agent. Promoted ones inherit weight 1.0 (default) and don't need an
 * explicit entry. Used by review.ts to merge into computeAllAgentScores
 * output before passing to council.
 */
export function buildTrialAgentWeights(
  agents: readonly ActiveSpawnedAgent[],
): Map<string, number> {
  const weights = new Map<string, number>();
  for (const a of agents) {
    if (a.status === "trial") weights.set(a.agentId, TRIAL_AGENT_WEIGHT);
  }
  return weights;
}

export interface SpawnedAgentOutcomeReport {
  agentId: string;
  reviewId: string;
  verdict: "approve" | "rework" | "reject";
  blockerCount: number;
  costUsd: number;
  latencyMs: number;
  /** Null when no smoke run was applicable for the repo. */
  smokePassed: boolean | null;
}

/**
 * Best-effort POST per outcome. Any failure is swallowed — the auto-
 * graduation cron tolerates missing rows because the duration window
 * spans many reviews.
 */
export async function reportSpawnedAgentOutcomes(
  outcomes: readonly SpawnedAgentOutcomeReport[],
  opts: {
    bearerToken: string;
    apiBase?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<{ recorded: number; failed: number }> {
  const apiBase = (opts.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  let recorded = 0;
  let failed = 0;
  for (const o of outcomes) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const r = await fetchImpl(`${apiBase}/admin/spawned-agent-outcomes`, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.bearerToken}`,
          "user-agent": "conclave-cli/spawned-agents-resolver",
        },
        body: JSON.stringify({
          agent_id: o.agentId,
          review_id: o.reviewId,
          verdict: o.verdict,
          blocker_count: o.blockerCount,
          cost_usd: o.costUsd,
          latency_ms: o.latencyMs,
          smoke_passed: o.smokePassed,
        }),
      });
      if (r.ok) recorded++;
      else failed++;
    } catch {
      failed++;
    } finally {
      clearTimeout(t);
    }
  }
  return { recorded, failed };
}

export interface SpawnedAgentSmokeReport {
  agentId: string;
  reviewId: string;
  /** Null collapses to "no smoke run" — auto-graduation treats null as neutral. */
  smokePassed: boolean | null;
}

/**
 * v0.17 — autofix-pipeline patches smoke_passed onto an already-recorded
 * outcome row. review.ts posts the initial outcome with smoke_passed=null
 * (it doesn't run smoke); after autofix's smoke step the real value is
 * threaded back so auto-graduation's pass-rate reflects build/test reality.
 *
 * Best-effort: any failure is swallowed. A 409 outcome_not_found (race
 * where review.ts hasn't flushed yet) is benign — the next review still
 * posts a fresh row and the trial window is many reviews wide.
 */
export async function reportSpawnedAgentSmokeOutcomes(
  outcomes: readonly SpawnedAgentSmokeReport[],
  opts: {
    bearerToken: string;
    apiBase?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<{ patched: number; failed: number }> {
  const apiBase = (opts.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  let patched = 0;
  let failed = 0;
  for (const o of outcomes) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const r = await fetchImpl(`${apiBase}/admin/spawned-agent-outcomes`, {
        method: "PATCH",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.bearerToken}`,
          "user-agent": "conclave-cli/spawned-agents-resolver",
        },
        body: JSON.stringify({
          agent_id: o.agentId,
          review_id: o.reviewId,
          smoke_passed: o.smokePassed,
        }),
      });
      if (r.ok) patched++;
      else failed++;
    } catch {
      failed++;
    } finally {
      clearTimeout(t);
    }
  }
  return { patched, failed };
}

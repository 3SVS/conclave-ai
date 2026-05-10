/**
 * v0.16.16 — Sprint E4 activation: prompt-variant resolver.
 *
 * Before each council pass, the CLI fetches active variants per agent
 * from the worker so review.ts can populate `ctx.systemPromptOverrides`
 * + spin up shadow-mode treatment runs.
 *
 *   - status='promoted' variant: replaces the agent's hardcoded baseline.
 *   - status='shadow' variant:  used for a parallel SHADOW review by the
 *     same agent. The shadow result is recorded but NEVER influences
 *     the user-visible verdict.
 *   - default (no active variant): agent uses hardcoded baseline.
 *
 * This file does the fetch + parse only. The actual shadow-runner lives
 * in commands/review.ts where it has access to the agent factory.
 *
 * Cost: one HTTP call per agent per review. Worker returns small JSON
 * (typically 0-2 rows per agent). Failure mode is best-effort: any
 * error → empty result → agents fall back to baseline.
 */
const DEFAULT_API_BASE = "https://conclave-ai.seunghunbae.workers.dev";
const FETCH_TIMEOUT_MS = 4_000;

export interface AgentPromptVariants {
  /** The variant that should override the baseline for this agent (status='promoted'). */
  promoted?: { variantPk: string; variantId: string; systemPrompt: string };
  /** Shadow variants — run in parallel for outcome collection. status='shadow'. */
  shadow: Array<{ variantPk: string; variantId: string; systemPrompt: string }>;
}

interface VariantWire {
  id: string;
  agent_id: string;
  variant_id: string;
  is_baseline: boolean;
  status: string;
  description: string | null;
  system_prompt: string;
}

interface VariantsResponse {
  count: number;
  variants: VariantWire[];
}

/**
 * Returns a per-agent map of active variants. Resolution rules:
 *   - At most ONE promoted variant per agent (we pick the most recent
 *     if somehow multiple are flagged).
 *   - Any number of shadow variants — each will spawn a shadow run.
 *   - Empty agent entry when none of either status is set.
 *
 * `bearerToken` is the operator's INTERNAL_CALLBACK_TOKEN (the routes
 * are admin-gated since variant prompts may carry sensitive operator
 * IP). When unavailable (BYO user without admin), this returns an
 * empty map and agents use baselines — which is the correct safe
 * default.
 */
export async function fetchActivePromptVariants(opts: {
  bearerToken?: string;
  apiBase?: string;
  agentIds: readonly string[];
  fetchImpl?: typeof fetch;
}): Promise<Record<string, AgentPromptVariants>> {
  const out: Record<string, AgentPromptVariants> = {};
  for (const id of opts.agentIds) out[id] = { shadow: [] };
  if (!opts.bearerToken) return out; // no admin token → no overrides

  const apiBase = (opts.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;

  for (const agentId of opts.agentIds) {
    for (const status of ["promoted", "shadow"] as const) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      let r: Response;
      try {
        r = await fetchImpl(
          `${apiBase}/admin/prompt-variants?agent_id=${encodeURIComponent(agentId)}&status=${status}`,
          {
            signal: ctrl.signal,
            headers: {
              accept: "application/json",
              authorization: `Bearer ${opts.bearerToken}`,
              "user-agent": "conclave-cli/prompt-variant-resolver",
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
      const j = (await r.json().catch(() => null)) as VariantsResponse | null;
      if (!j || !Array.isArray(j.variants)) continue;
      for (const v of j.variants) {
        if (!out[agentId]) out[agentId] = { shadow: [] };
        if (status === "promoted") {
          // Most recent wins if multiple flagged. Server already orders by created_at DESC.
          if (!out[agentId]!.promoted) {
            out[agentId]!.promoted = {
              variantPk: v.id,
              variantId: v.variant_id,
              systemPrompt: v.system_prompt,
            };
          }
        } else {
          out[agentId]!.shadow.push({
            variantPk: v.id,
            variantId: v.variant_id,
            systemPrompt: v.system_prompt,
          });
        }
      }
    }
  }
  return out;
}

/**
 * Build the systemPromptOverrides map for ReviewContext from resolved
 * variants. Only includes agents whose `promoted` variant is set.
 */
export function buildOverrides(
  variants: Record<string, AgentPromptVariants>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [agentId, v] of Object.entries(variants)) {
    if (v.promoted) out[agentId] = v.promoted.systemPrompt;
  }
  return out;
}

export interface OutcomeReport {
  variantPk: string;
  agentId: string;
  reviewId: string;
  verdict?: "approve" | "rework" | "reject";
  blockerCount?: number;
  costUsd?: number;
  latencyMs?: number;
}

/**
 * Best-effort POST per outcome. Any failure is swallowed — telemetry is
 * not in the critical path of a successful review.
 */
export async function reportPromptOutcomes(
  outcomes: readonly OutcomeReport[],
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
      const r = await fetchImpl(`${apiBase}/admin/prompt-variant-outcomes`, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.bearerToken}`,
          "user-agent": "conclave-cli/prompt-variant-resolver",
        },
        body: JSON.stringify({
          variant_pk: o.variantPk,
          agent_id: o.agentId,
          review_id: o.reviewId,
          ...(o.verdict ? { verdict: o.verdict } : {}),
          ...(o.blockerCount !== undefined ? { blocker_count: o.blockerCount } : {}),
          ...(o.costUsd !== undefined ? { cost_usd: o.costUsd } : {}),
          ...(o.latencyMs !== undefined ? { latency_ms: o.latencyMs } : {}),
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

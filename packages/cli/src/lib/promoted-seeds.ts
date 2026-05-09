/**
 * v0.16.10 — Sprint C client for promoted-seed fetcher.
 *
 * Hits central-plane GET /seeds/promoted/:domain to pull pattern entries
 * that the seed-promoter cron has synthesized from accumulated classified
 * user_feedback. Returns split arrays so review.ts + audit.ts can append
 * into ctx.answerKeys / failureCatalog alongside bundled-seeds + user
 * memory + external-references.
 *
 * Ordering rationale (caller side):
 *   local memory > promoted seeds > external references
 * — local is repo-specific (most relevant), promoted is community-
 * derived from real user feedback (high-relevance signal), external is
 * curated public knowledge.
 *
 * Failure mode: best-effort. Network blip → empty arrays, the review
 * still runs with everything else. Never throws.
 */
const DEFAULT_API_BASE = "https://conclave-ai.seunghunbae.workers.dev";
const FETCH_TIMEOUT_MS = 5_000;

export interface PromotedSeedsSplit {
  answerKeys: string[];
  failureCatalog: string[];
}

interface PromotedSeedWire {
  kind: "answer_key" | "failure";
  domain: "code" | "design";
  category: string;
  prompt_text: string;
}

interface SeedsResponse {
  domain: string;
  count: number;
  seeds: PromotedSeedWire[];
}

export async function fetchPromotedSeeds(
  domain: "code" | "design",
  opts: { apiBase?: string; fetchImpl?: typeof fetch } = {},
): Promise<PromotedSeedsSplit> {
  const apiBase = (opts.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetchImpl(`${apiBase}/seeds/promoted/${domain}`, {
      signal: ctrl.signal,
      headers: { accept: "application/json", "user-agent": "conclave-cli/promoted-seeds" },
    });
    clearTimeout(t);
    if (!r.ok) return { answerKeys: [], failureCatalog: [] };
    const j = (await r.json()) as SeedsResponse;
    if (!j || !Array.isArray(j.seeds)) return { answerKeys: [], failureCatalog: [] };
    const answerKeys: string[] = [];
    const failureCatalog: string[] = [];
    for (const s of j.seeds) {
      if (typeof s?.prompt_text !== "string") continue;
      if (s.kind === "answer_key") answerKeys.push(s.prompt_text);
      else if (s.kind === "failure") failureCatalog.push(s.prompt_text);
    }
    return { answerKeys, failureCatalog };
  } catch {
    clearTimeout(t);
    return { answerKeys: [], failureCatalog: [] };
  }
}

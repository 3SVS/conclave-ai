/**
 * v0.17 — Sprint E7 client for the external-intel feed.
 *
 * Hits central-plane GET /seeds/external-intel/:domain to pull entries
 * harvested from the 4 external-intel miners (CVE advisories, MCP
 * server registry, shadcn community blocks, awesome-list catalogs).
 *
 * Failure mode: best-effort. Network blip → empty arrays. RAG
 * injection downstream is additive — missing one source never blocks
 * the review.
 */
const DEFAULT_API_BASE = "https://conclave-ai.seunghunbae.workers.dev";
const FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_LIMIT = 50;

export interface ExternalIntelSplit {
  answerKeys: string[];
  failureCatalog: string[];
}

interface IntelResponse {
  domain: string;
  answer_keys: string[];
  failures: string[];
  counts: { answer_keys: number; failures: number };
}

export async function fetchExternalIntel(
  domain: "code" | "design",
  opts: { apiBase?: string; fetchImpl?: typeof fetch; limit?: number } = {},
): Promise<ExternalIntelSplit> {
  const apiBase = (opts.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const limit = Math.max(1, Math.min(200, opts.limit ?? DEFAULT_LIMIT));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetchImpl(`${apiBase}/seeds/external-intel/${domain}?limit=${limit}`, {
      signal: ctrl.signal,
      headers: { accept: "application/json", "user-agent": "conclave-cli/external-intel" },
    });
    clearTimeout(t);
    if (!r.ok) return { answerKeys: [], failureCatalog: [] };
    const j = (await r.json()) as IntelResponse;
    if (!j || !Array.isArray(j.answer_keys) || !Array.isArray(j.failures)) {
      return { answerKeys: [], failureCatalog: [] };
    }
    return {
      answerKeys: j.answer_keys.filter((s): s is string => typeof s === "string"),
      failureCatalog: j.failures.filter((s): s is string => typeof s === "string"),
    };
  } catch {
    clearTimeout(t);
    return { answerKeys: [], failureCatalog: [] };
  }
}

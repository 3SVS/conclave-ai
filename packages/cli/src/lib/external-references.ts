/**
 * v0.16.8 — Phase 4 client for external design-reference cache.
 *
 * Hits central-plane GET /references/:domain to pull lessons extracted
 * from public design sources (Vercel Design / shadcn/ui / Refactoring UI
 * / etc). Returns split arrays so review.ts + audit.ts can append into
 * ctx.answerKeys / failureCatalog alongside bundled seeds + user-written
 * entries.
 *
 * Failure mode: best-effort. Network blip → returns empty arrays, the
 * review still runs with bundled + user data. Never throws.
 *
 * Caller responsibility: pass the right `apiBase`. Default points at
 * production worker; the CLI's existing `central` config could override
 * for staging deploys, but that integration is left for a follow-up.
 */
const DEFAULT_API_BASE = "https://conclave-ai.seunghunbae.workers.dev";
const FETCH_TIMEOUT_MS = 5_000;

export interface ExternalReferenceSplit {
  answerKeys: string[];
  failureCatalog: string[];
}

interface CachedReferenceWire {
  kind: "answer_key" | "failure";
  domain: "design";
  prompt_text: string;
}

interface ReferencesResponse {
  domain: string;
  count: number;
  references: CachedReferenceWire[];
}

export async function fetchExternalReferences(
  domain: "code" | "design",
  opts: { apiBase?: string; fetchImpl?: typeof fetch } = {},
): Promise<ExternalReferenceSplit> {
  const apiBase = (opts.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetchImpl(`${apiBase}/references/${domain}`, {
      signal: ctrl.signal,
      headers: { accept: "application/json", "user-agent": "conclave-cli/external-references" },
    });
    clearTimeout(t);
    if (!r.ok) return { answerKeys: [], failureCatalog: [] };
    const j = (await r.json()) as ReferencesResponse;
    if (!j || !Array.isArray(j.references)) return { answerKeys: [], failureCatalog: [] };
    const answerKeys: string[] = [];
    const failureCatalog: string[] = [];
    for (const ref of j.references) {
      if (typeof ref?.prompt_text !== "string") continue;
      if (ref.kind === "answer_key") answerKeys.push(ref.prompt_text);
      else if (ref.kind === "failure") failureCatalog.push(ref.prompt_text);
    }
    return { answerKeys, failureCatalog };
  } catch {
    clearTimeout(t);
    return { answerKeys: [], failureCatalog: [] };
  }
}

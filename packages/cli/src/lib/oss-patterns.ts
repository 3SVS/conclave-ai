/**
 * v0.16.13 — Sprint E2 client for OSS PR pattern fetcher.
 *
 * Hits central-plane GET /seeds/oss-patterns/:domain to pull patterns
 * extracted from recently-merged bugfix PRs in popular OSS repos
 * (Next.js, React, shadcn/ui, Tailwind, etc). Mirrors lib/external-
 * references.ts and lib/promoted-seeds.ts shape so review.ts/audit.ts
 * append into ctx.failureCatalog the same way.
 *
 * Failure mode: best-effort. Network blip → empty arrays.
 */
const DEFAULT_API_BASE = "https://conclave-ai.seunghunbae.workers.dev";
const FETCH_TIMEOUT_MS = 5_000;

export interface OssPatternSplit {
  answerKeys: string[];
  failureCatalog: string[];
}

interface OssPatternWire {
  kind: "answer_key" | "failure";
  domain: "code" | "design";
  category: string;
  prompt_text: string;
  pr_url: string;
}

interface PatternsResponse {
  domain: string;
  count: number;
  patterns: OssPatternWire[];
}

export async function fetchOssPatterns(
  domain: "code" | "design",
  opts: { apiBase?: string; fetchImpl?: typeof fetch } = {},
): Promise<OssPatternSplit> {
  const apiBase = (opts.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetchImpl(`${apiBase}/seeds/oss-patterns/${domain}`, {
      signal: ctrl.signal,
      headers: { accept: "application/json", "user-agent": "conclave-cli/oss-patterns" },
    });
    clearTimeout(t);
    if (!r.ok) return { answerKeys: [], failureCatalog: [] };
    const j = (await r.json()) as PatternsResponse;
    if (!j || !Array.isArray(j.patterns)) return { answerKeys: [], failureCatalog: [] };
    const answerKeys: string[] = [];
    const failureCatalog: string[] = [];
    for (const p of j.patterns) {
      if (typeof p?.prompt_text !== "string") continue;
      if (p.kind === "answer_key") answerKeys.push(p.prompt_text);
      else if (p.kind === "failure") failureCatalog.push(p.prompt_text);
    }
    return { answerKeys, failureCatalog };
  } catch {
    clearTimeout(t);
    return { answerKeys: [], failureCatalog: [] };
  }
}

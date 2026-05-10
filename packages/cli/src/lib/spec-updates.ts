/**
 * v0.16.14 — Sprint E3 client for spec-update fetcher.
 *
 * Hits central-plane GET /seeds/spec-updates/:domain to pull entries
 * extracted from new releases of foundational frameworks/specs (React,
 * Next.js, Tailwind, TypeScript, shadcn-ui, Storybook).
 *
 * Failure mode: best-effort. Network blip → empty arrays.
 */
const DEFAULT_API_BASE = "https://conclave-ai.seunghunbae.workers.dev";
const FETCH_TIMEOUT_MS = 5_000;

export interface SpecUpdatesSplit {
  answerKeys: string[];
  failureCatalog: string[];
}

interface SpecUpdateWire {
  kind: "answer_key" | "failure";
  domain: "code" | "design";
  source_id: string;
  release_tag: string;
  prompt_text: string;
}

interface UpdatesResponse {
  domain: string;
  count: number;
  updates: SpecUpdateWire[];
}

export async function fetchSpecUpdates(
  domain: "code" | "design",
  opts: { apiBase?: string; fetchImpl?: typeof fetch } = {},
): Promise<SpecUpdatesSplit> {
  const apiBase = (opts.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetchImpl(`${apiBase}/seeds/spec-updates/${domain}`, {
      signal: ctrl.signal,
      headers: { accept: "application/json", "user-agent": "conclave-cli/spec-updates" },
    });
    clearTimeout(t);
    if (!r.ok) return { answerKeys: [], failureCatalog: [] };
    const j = (await r.json()) as UpdatesResponse;
    if (!j || !Array.isArray(j.updates)) return { answerKeys: [], failureCatalog: [] };
    const answerKeys: string[] = [];
    const failureCatalog: string[] = [];
    for (const u of j.updates) {
      if (typeof u?.prompt_text !== "string") continue;
      if (u.kind === "answer_key") answerKeys.push(u.prompt_text);
      else if (u.kind === "failure") failureCatalog.push(u.prompt_text);
    }
    return { answerKeys, failureCatalog };
  } catch {
    clearTimeout(t);
    return { answerKeys: [], failureCatalog: [] };
  }
}

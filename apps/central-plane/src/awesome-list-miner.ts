/**
 * awesome-* list miner — fourth consumer of the external-intel
 * framework. Scrapes a curated set of high-traffic `awesome-*`
 * GitHub repos so a review can answer "which {library, tool,
 * resource} exists for X?" against a community-vetted catalog
 * instead of guessing.
 *
 * Why this and not just RAG-ing the entire web: awesome-lists are
 * already curated (each entry survived a maintainer's quality
 * check) and structurally uniform (markdown bullets grouped by
 * `## Section` headers). Cheap to parse, high signal-to-noise.
 *
 * Cost: no Haiku call. ~14 README fetches per pass, ~3 MB total.
 *
 * Cron: weekly Friday 0800 UTC. Awesome-list churn is slow.
 */
import type { Env } from "./env.js";
import {
  type ExternalIntelRow,
  type IntelDomain,
  makeIntelId,
  readIntelState,
  renderIntelPrompt,
  upsertIntel,
  writeIntelState,
} from "./external-intel.js";

const TIMEOUT_MS = 8_000;
const PER_LIST_ENTRY_LIMIT = 200; // cap to keep one rogue list from dominating

interface AwesomeListTarget {
  list_id: string;
  repo: string;
  branch: string;
  domain: IntelDomain;
}

const AWESOME_LISTS: ReadonlyArray<AwesomeListTarget> = [
  // Code-domain catalogs
  { list_id: "awesome-react",         repo: "enaqx/awesome-react",            branch: "master", domain: "code" },
  { list_id: "awesome-react-components", repo: "brillout/awesome-react-components", branch: "master", domain: "code" },
  { list_id: "awesome-nextjs",        repo: "unicodeveloper/awesome-nextjs",  branch: "master", domain: "code" },
  { list_id: "awesome-typescript",    repo: "dzharii/awesome-typescript",     branch: "master", domain: "code" },
  { list_id: "awesome-vue",           repo: "vuejs/awesome-vue",              branch: "master", domain: "code" },
  { list_id: "awesome-svelte",        repo: "TheComputerM/awesome-svelte",    branch: "main",   domain: "code" },
  { list_id: "awesome-nodejs",        repo: "sindresorhus/awesome-nodejs",    branch: "main",   domain: "code" },
  { list_id: "awesome-bun",           repo: "apvarun/awesome-bun",            branch: "main",   domain: "code" },
  { list_id: "awesome-cloudflare-workers", repo: "Erisa/awesome-cloudflare-workers", branch: "main", domain: "code" },
  { list_id: "awesome-mcp-servers",   repo: "punkpeye/awesome-mcp-servers",   branch: "main",   domain: "code" },
  { list_id: "awesome-ai-tools",      repo: "mahseema/awesome-ai-tools",      branch: "main",   domain: "code" },
  { list_id: "awesome-deno",          repo: "denolib/awesome-deno",           branch: "master", domain: "code" },
  // Design-domain catalogs
  { list_id: "awesome-tailwindcss",   repo: "aniftyco/awesome-tailwindcss",   branch: "master", domain: "design" },
  { list_id: "awesome-design-systems", repo: "klaufel/awesome-design-systems", branch: "main",  domain: "design" },
];

interface AwesomeEntry {
  name: string;
  url: string;
  description: string;
  section: string;
}

async function timedFetch(url: string): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { Accept: "text/plain", "User-Agent": "conclave-ai/awesome-list-miner" },
      signal: ctrl.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pull section header + linked-bullet entries. Loose grammar — readme
 * formats drift, we'd rather pick up new entries than block on
 * imperfect parse.
 */
function parseAwesomeReadme(md: string): AwesomeEntry[] {
  const out: AwesomeEntry[] = [];
  const lines = md.split(/\r?\n/);
  let section = "general";
  const sectionRe = /^##\s+(.+)$/;
  const linkedRe = /^[*-]\s+\[([^\]]+)\]\(([^)]+)\)\s*[-–—:]\s*(.+)$/;
  for (const raw of lines) {
    const line = raw.trim();
    const sec = sectionRe.exec(line);
    if (sec) {
      section = sec[1]!.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      continue;
    }
    const m = linkedRe.exec(line);
    if (!m) continue;
    const name = m[1]!.trim();
    const url = m[2]!.trim();
    let description = m[3]!.trim();
    if (!name || !description || name.length > 100) continue;
    if (!/^https?:\/\//.test(url)) continue;
    if (description.length > 400) description = description.slice(0, 400);
    out.push({ name: name.slice(0, 120), url, description, section });
  }
  return out;
}

function rowFromAwesome(target: AwesomeListTarget, entry: AwesomeEntry): ExternalIntelRow {
  // Source id namespaces by list to avoid cross-list collisions on
  // entries with the same name in different ecosystems.
  const slug = entry.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const sourceId = `${target.list_id}:${slug}`;
  const title = `${target.list_id} — ${entry.name}`.slice(0, 180);
  return {
    id: "",
    intel_type: "awesome-entry",
    source_id: sourceId,
    source_url: entry.url,
    source_repo: target.repo,
    domain: target.domain,
    kind: "answer_key",
    category: target.domain === "design" ? "design-component" : "ecosystem-tool",
    severity: null,
    title,
    body: entry.description,
    tags: ["awesome", target.list_id, entry.section],
    prompt_text: renderIntelPrompt({
      intel_type: "awesome-entry",
      source_id: sourceId,
      title,
      body: entry.description,
      tagSuffix: `${target.list_id} / ${entry.section}`,
    }),
    metadata: {
      list_id: target.list_id,
      section: entry.section,
      url: entry.url,
      list_repo: target.repo,
    },
  };
}

async function processList(env: Env, target: AwesomeListTarget): Promise<number> {
  const url = `https://raw.githubusercontent.com/${target.repo}/${target.branch}/README.md`;
  const resp = await timedFetch(url);
  if (!resp?.ok) return 0;
  const text = await resp.text();
  const entries = parseAwesomeReadme(text).slice(0, PER_LIST_ENTRY_LIMIT);
  let inserted = 0;
  for (const entry of entries) {
    const row = rowFromAwesome(target, entry);
    row.id = await makeIntelId("awesome-entry", row.source_id);
    await upsertIntel(env, row);
    inserted += 1;
  }
  await writeIntelState(env, "awesome-entry", target.list_id, {
    last_seen_at: new Date().toISOString(),
    last_seen_marker: `entries:${entries.length}`,
  });
  return inserted;
}

export async function runAwesomeListMiner(env: Env): Promise<{
  inserted: number;
  lists_processed: number;
  per_list: Record<string, number>;
}> {
  let inserted = 0;
  let lists_processed = 0;
  const per_list: Record<string, number> = {};
  for (const target of AWESOME_LISTS) {
    // Carry per-list bookmark for operator observability; the unique
    // (intel_type, source_id) key handles idempotency.
    await readIntelState(env, "awesome-entry", target.list_id);
    const count = await processList(env, target);
    inserted += count;
    if (count > 0) lists_processed += 1;
    per_list[target.list_id] = count;
  }
  return { inserted, lists_processed, per_list };
}

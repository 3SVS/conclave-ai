/**
 * v0.16.13 — Sprint E2: OSS PR pattern miner.
 *
 * For each repo in MINER_TARGETS, fetch recently-merged PRs filtered
 * to "fix/perf/a11y/security" patterns, pull the diff + commit body,
 * ask Haiku "what anti-pattern was fixed here?", store the answer as
 * a FailureEntry-shaped row in oss_pr_patterns. CLI subsequently
 * fetches via GET /seeds/oss-patterns/:domain and injects alongside
 * promoted_seeds + external_references.
 *
 * Cost: each repo ~5-10 Haiku calls per daily run × ~$0.0001 each = a
 * few cents/day worst case. We cap PRs per run with PER_REPO_LIMIT to
 * prevent a backlog explosion when a repo lands a flurry of bugfixes.
 *
 * GitHub API: unauthenticated 60 req/h is sufficient (we make ~3-5
 * requests per repo: list PRs + per-PR diff + per-PR labels). If we
 * hit rate limits later we'll need to authenticate.
 */
import type { Env } from "./env.js";

const MINER_MODEL = "claude-haiku-4-5";
const MINER_TIMEOUT_MS = 8_000;
const PER_REPO_LIMIT = 5;        // PRs per repo per pass (cap Haiku spend)
const DIFF_BYTES_CAP = 12_000;   // diff snippet sent to Haiku

interface MinerTarget {
  repo: string; // "vercel/next.js"
  /** Which conclave domain this repo's lessons map to. */
  domain: "code" | "design";
}

const MINER_TARGETS: ReadonlyArray<MinerTarget> = [
  { repo: "vercel/next.js", domain: "code" },
  { repo: "facebook/react", domain: "code" },
  { repo: "shadcn-ui/ui", domain: "design" },
  { repo: "tailwindlabs/tailwindcss", domain: "design" },
  { repo: "vercel/style-guide", domain: "code" },
  { repo: "storybookjs/storybook", domain: "design" },
];

// PR is mineable when its title or any of its labels match these.
const RELEVANT_TITLE_RE =
  /^(fix|perf|a11y|security|sec|hotfix)(?:\([^)]*\))?:|^bug:|^breaking:/i;
const RELEVANT_LABEL_KEYWORDS = ["bug", "fix", "perf", "a11y", "accessibility", "security"];

interface GithubPRItem {
  number: number;
  title: string;
  html_url: string;
  merged_at: string | null;
  labels: Array<{ name: string }>;
}

interface MinerExtraction {
  category: string;
  severity: "blocker" | "major" | "minor";
  title: string;
  body: string;
  tags: string[];
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

const EXTRACTOR_PROMPT = `You read a recently-merged OSS pull request (a real bugfix/perf/a11y/security fix from a popular open-source repo) and distill the anti-pattern it eliminates into a single review rule a code-review agent could check on FUTURE pull requests.

Output ONE JSON object only — no prose, no fences:
{
  "category": "<one of: accessibility | correctness | performance | security | design-tokens | typography | spacing-layout | responsive | maintainability | other>",
  "severity": "<blocker | major | minor>",
  "title": "<3-7 words, what the antipattern is>",
  "body": "<one paragraph: the rule, written as a directive to a reviewer — what to flag and why>",
  "tags": ["3-5 lowercase keywords"]
}

Base your answer ONLY on the PR title + commit message + diff. Do not invent details. If the diff doesn't actually expose a generalizable rule (e.g. it's a typo fix or a version bump), pick category="other", severity="minor", and a body that says "no general rule extractable".`;

async function callHaiku(env: Env, system: string, user: string): Promise<string | null> {
  if (!env.ANTHROPIC_API_KEY) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), MINER_TIMEOUT_MS);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MINER_MODEL,
        max_tokens: 512,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const j = (await r.json()) as AnthropicResponse;
    return j.content?.[0]?.text ?? "";
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function parseExtraction(text: string): MinerExtraction | null {
  try {
    const stripped = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "");
    const obj = JSON.parse(stripped) as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title.slice(0, 200) : null;
    const body = typeof obj.body === "string" ? obj.body.slice(0, 1200) : null;
    const category = typeof obj.category === "string" ? obj.category.slice(0, 64) : null;
    if (!title || !body || !category) return null;
    const sev = obj.severity === "blocker" || obj.severity === "major" || obj.severity === "minor"
      ? obj.severity
      : "minor";
    const tags = Array.isArray(obj.tags)
      ? obj.tags.slice(0, 8).map((t) => String(t).slice(0, 32))
      : [];
    return { title, body, category, severity: sev, tags };
  } catch {
    return null;
  }
}

async function fetchRecentPRs(repo: string, since: string | null): Promise<GithubPRItem[]> {
  // closed PRs sorted by updated desc — recent merges surface first.
  const url = `https://api.github.com/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), MINER_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "conclave-ai/oss-pr-miner",
        "x-github-api-version": "2022-11-28",
      },
      signal: ctrl.signal,
    });
    if (!r.ok) return [];
    const items = (await r.json()) as GithubPRItem[];
    return items.filter((p) => {
      if (!p.merged_at) return false;
      if (since && p.merged_at <= since) return false;
      return true;
    });
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

async function fetchPRDiff(repo: string, prNumber: number): Promise<string | null> {
  const url = `https://api.github.com/repos/${repo}/pulls/${prNumber}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), MINER_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: {
        accept: "application/vnd.github.v3.diff",
        "user-agent": "conclave-ai/oss-pr-miner",
      },
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const text = await r.text();
    return text.slice(0, DIFF_BYTES_CAP);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function isRelevantPR(pr: GithubPRItem): boolean {
  if (RELEVANT_TITLE_RE.test(pr.title)) return true;
  for (const l of pr.labels ?? []) {
    const name = l?.name?.toLowerCase() ?? "";
    if (RELEVANT_LABEL_KEYWORDS.some((kw) => name.includes(kw))) return true;
  }
  return false;
}

function renderPromptText(e: MinerExtraction): string {
  return `[${e.category}/${e.severity}] ${e.title} — ${e.body}`;
}

async function shaHex8(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
}

interface RowCount {
  n: number;
}

async function repoHighWaterMark(env: Env, repo: string): Promise<string | null> {
  const r = await env.DB.prepare(
    `SELECT last_merged_at_seen FROM oss_pr_miner_state WHERE repo = ?`,
  )
    .bind(repo)
    .first<{ last_merged_at_seen: string | null }>();
  return r?.last_merged_at_seen ?? null;
}

async function setRepoHighWaterMark(env: Env, repo: string, mergedAt: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO oss_pr_miner_state (repo, last_merged_at_seen, last_run_at)
     VALUES (?, ?, ?)
     ON CONFLICT(repo) DO UPDATE SET last_merged_at_seen = excluded.last_merged_at_seen, last_run_at = excluded.last_run_at`,
  )
    .bind(repo, mergedAt, now)
    .run()
    .catch(() => undefined);
}

export interface MinerRepoResult {
  repo: string;
  scanned: number;
  saved: number;
  skipped_existing: number;
  skipped_irrelevant: number;
  failed: number;
  high_water_mark_after: string | null;
}

export interface MinerRunSummary {
  total_saved: number;
  total_failed: number;
  per_repo: MinerRepoResult[];
}

/**
 * One miner pass over MINER_TARGETS. Idempotent: skips PRs already
 * stored (UNIQUE(repo, pr_number)) and advances per-repo high-water
 * mark only on success.
 */
export async function runOssPrMiner(env: Env): Promise<MinerRunSummary> {
  const summary: MinerRunSummary = {
    total_saved: 0,
    total_failed: 0,
    per_repo: [],
  };

  for (const target of MINER_TARGETS) {
    const since = await repoHighWaterMark(env, target.repo);
    const prs = await fetchRecentPRs(target.repo, since);
    const relevant = prs.filter(isRelevantPR).slice(0, PER_REPO_LIMIT);

    const result: MinerRepoResult = {
      repo: target.repo,
      scanned: prs.length,
      saved: 0,
      skipped_existing: 0,
      skipped_irrelevant: prs.length - relevant.length,
      failed: 0,
      high_water_mark_after: null,
    };

    let latestMerged: string | null = null;

    for (const pr of relevant) {
      // Skip if we already extracted this PR.
      const existing = await env.DB.prepare(
        `SELECT 1 as n FROM oss_pr_patterns WHERE repo = ? AND pr_number = ?`,
      )
        .bind(target.repo, pr.number)
        .first<RowCount>();
      if (existing) {
        result.skipped_existing++;
        if (!latestMerged || pr.merged_at! > latestMerged) latestMerged = pr.merged_at;
        continue;
      }

      const diff = await fetchPRDiff(target.repo, pr.number);
      if (!diff) {
        result.failed++;
        continue;
      }

      const userMessage = [
        `Repo: ${target.repo}`,
        `PR title: ${pr.title}`,
        `Labels: ${(pr.labels ?? []).map((l) => l.name).join(", ")}`,
        "",
        "Diff (truncated):",
        "---",
        diff,
      ].join("\n");

      const raw = await callHaiku(env, EXTRACTOR_PROMPT, userMessage);
      if (!raw) {
        result.failed++;
        continue;
      }
      const extraction = parseExtraction(raw);
      if (!extraction) {
        result.failed++;
        continue;
      }

      const id = `op_${await shaHex8(`${target.repo}#${pr.number}`)}`;
      const promptText = renderPromptText(extraction);
      try {
        await env.DB.prepare(
          `INSERT INTO oss_pr_patterns
             (id, repo, pr_number, pr_url, pr_title, pr_merged_at, pr_labels,
              domain, kind, category, severity, title, body, tags, prompt_text, extracted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'failure', ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            id,
            target.repo,
            pr.number,
            pr.html_url,
            pr.title.slice(0, 240),
            pr.merged_at,
            JSON.stringify((pr.labels ?? []).map((l) => l.name).slice(0, 16)),
            target.domain,
            extraction.category,
            extraction.severity,
            extraction.title,
            extraction.body,
            JSON.stringify(extraction.tags),
            promptText,
            new Date().toISOString(),
          )
          .run();
        result.saved++;
        if (!latestMerged || pr.merged_at! > latestMerged) latestMerged = pr.merged_at;
      } catch {
        // UNIQUE constraint race
        result.skipped_existing++;
      }
    }

    if (latestMerged) {
      await setRepoHighWaterMark(env, target.repo, latestMerged);
      result.high_water_mark_after = latestMerged;
    }
    summary.per_repo.push(result);
    summary.total_saved += result.saved;
    summary.total_failed += result.failed;
  }

  return summary;
}

// --- Reader (used by GET /seeds/oss-patterns/:domain) -------------------

export interface OssPatternRow {
  kind: "answer_key" | "failure";
  domain: "code" | "design";
  category: string;
  prompt_text: string;
  pr_url: string;
}

export async function listOssPatterns(
  env: Env,
  domain: "code" | "design",
): Promise<OssPatternRow[]> {
  const r = await env.DB.prepare(
    `SELECT kind, domain, category, prompt_text, pr_url
       FROM oss_pr_patterns
      WHERE domain = ? AND removed_at IS NULL
      ORDER BY extracted_at DESC LIMIT 32`,
  )
    .bind(domain)
    .all<{ kind: string; domain: string; category: string; prompt_text: string; pr_url: string }>();
  const rows = r.results ?? [];
  return rows
    .filter((row) => row.kind === "answer_key" || row.kind === "failure")
    .map((row) => ({
      kind: row.kind as "answer_key" | "failure",
      domain: row.domain as "code" | "design",
      category: row.category,
      prompt_text: row.prompt_text,
      pr_url: row.pr_url,
    }));
}

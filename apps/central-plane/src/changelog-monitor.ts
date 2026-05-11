/**
 * v0.16.14 — Sprint E3: changelog / spec monitor.
 *
 * Weekly scan of release feeds for the foundational frameworks /
 * specs conclave's design + code reviewers reference. For each new
 * release vs the last-seen mark, ask Haiku to distill the release
 * body into answer-key (new recommended patterns) + failure
 * (deprecated, "don't do this anymore") entries.
 *
 * Cost (with 250-source corpus from `watched-sources.ts`):
 *   ~250 sources × ~1-3 new releases/wk × 1 Haiku call each ≈
 *   $0.025-0.075/wk. Still effectively free at production traffic.
 *
 * GitHub API: unauthenticated 60 req/h is the bottleneck. The list
 * call is one per source; with 250 sources we'd burn the entire
 * hourly window on the first pass. Mitigated by:
 *   (a) the worker carries an installation-style token for elevated
 *       rate-limit (handled by callers if `GH_APP_*` secrets exist);
 *   (b) the per-source state row in `spec_updates_state` short-circuits
 *       unchanged repos to a single HTTP HEAD.
 */
import type { Env } from "./env.js";
import { WATCHED_SOURCES, type WatchedSource } from "./watched-sources.js";

const MONITOR_MODEL = "claude-haiku-4-5";
const MONITOR_TIMEOUT_MS = 8_000;
const PER_SOURCE_RELEASE_LIMIT = 3;   // process up to N new releases per source per pass

type SpecTarget = WatchedSource;

const SPEC_TARGETS: ReadonlyArray<SpecTarget> = WATCHED_SOURCES;

interface GithubReleaseItem {
  tag_name: string;
  name: string | null;
  html_url: string;
  body: string | null;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

interface ExtractedEntry {
  kind: "answer_key" | "failure";
  title: string;
  body: string;
  tags: string[];
  category?: string;
  severity?: "blocker" | "major" | "minor";
}

const EXTRACTOR_PROMPT = `You read the release notes from a major version bump of a foundational framework or design library and distill the changes into review rules a code-review agent could apply on FUTURE pull requests in projects that use this library.

Output ONE JSON object PER LINE (JSONL — no outer array, no markdown fences):
{
  "kind": "answer_key" | "failure",
  "title": "<3-7 word label>",
  "body": "<one paragraph: the rule, written as a directive to a reviewer>",
  "tags": ["3-5 lowercase keywords"],
  "category": "<one of: accessibility | correctness | performance | security | design-tokens | typography | spacing-layout | responsive | maintainability | other>",
  "severity": "<blocker | major | minor>"   // failures only
}

Two kinds:
- answer_key — a NEW recommended pattern this release introduces (e.g. "Next.js 16 'use cache' directive — prefer it over manual revalidate timers").
- failure — a pattern this release DEPRECATES or marks anti (e.g. "React 20 deprecates manual useMemo dependency arrays — flag explicit deps as antipattern").

Rules:
- ONE JSON object per line. JSONL. Do not wrap in array.
- Cap at 6 entries total — pick the most impactful, most generalizable.
- Skip generic boilerplate (release date, contributor list, "thanks!").
- Base your answer ONLY on the release notes provided. Do not invent.
- If the release notes contain nothing reviewer-actionable, output nothing.`;

async function callHaiku(env: Env, system: string, user: string): Promise<string | null> {
  if (!env.ANTHROPIC_API_KEY) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), MONITOR_TIMEOUT_MS);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MONITOR_MODEL,
        max_tokens: 1024,
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

function parseJsonl(text: string): ExtractedEntry[] {
  const out: ExtractedEntry[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || !line.startsWith("{")) continue;
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (typeof obj?.title !== "string" || typeof obj?.body !== "string") continue;
      if (obj.kind !== "answer_key" && obj.kind !== "failure") continue;
      const entry: ExtractedEntry = {
        kind: obj.kind,
        title: String(obj.title).slice(0, 200),
        body: String(obj.body).slice(0, 1200),
        tags: Array.isArray(obj.tags)
          ? obj.tags.slice(0, 8).map((t) => String(t).slice(0, 32))
          : [],
      };
      if (typeof obj.category === "string") entry.category = String(obj.category).slice(0, 64);
      if (obj.kind === "failure") {
        entry.severity =
          obj.severity === "blocker" || obj.severity === "major" || obj.severity === "minor"
            ? obj.severity
            : "minor";
      }
      out.push(entry);
    } catch {
      // skip malformed
    }
  }
  return out.slice(0, 6);
}

async function fetchReleases(repo: string): Promise<GithubReleaseItem[]> {
  const url = `https://api.github.com/repos/${repo}/releases?per_page=10`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), MONITOR_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "conclave-ai/changelog-monitor",
        "x-github-api-version": "2022-11-28",
      },
      signal: ctrl.signal,
    });
    if (!r.ok) return [];
    const items = (await r.json()) as GithubReleaseItem[];
    return items.filter((rl) => !rl.draft && !rl.prerelease && rl.body && rl.published_at);
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

function renderPromptText(e: ExtractedEntry, sourceId: string, releaseTag: string): string {
  const tagPrefix = `${sourceId}@${releaseTag}`;
  if (e.kind === "answer_key") {
    return `[${tagPrefix}/${e.tags.slice(0, 2).join("/") || "spec"}] ${e.title} — ${e.body}`;
  }
  return `[${tagPrefix}/${e.category ?? "spec"}/${e.severity ?? "minor"}] ${e.title} — ${e.body}`;
}

async function shaHex8(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
}

async function getMonitorState(env: Env, sourceId: string): Promise<{ tag: string | null; publishedAt: string | null }> {
  const r = await env.DB.prepare(
    `SELECT last_release_tag, last_release_published_at FROM spec_monitor_state WHERE source_id = ?`,
  )
    .bind(sourceId)
    .first<{ last_release_tag: string | null; last_release_published_at: string | null }>();
  return {
    tag: r?.last_release_tag ?? null,
    publishedAt: r?.last_release_published_at ?? null,
  };
}

async function setMonitorState(
  env: Env,
  sourceId: string,
  tag: string,
  publishedAt: string,
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO spec_monitor_state (source_id, last_release_tag, last_release_published_at, last_run_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(source_id) DO UPDATE SET
        last_release_tag = excluded.last_release_tag,
        last_release_published_at = excluded.last_release_published_at,
        last_run_at = excluded.last_run_at`,
  )
    .bind(sourceId, tag, publishedAt, now)
    .run()
    .catch(() => undefined);
}

export interface SourceMonitorResult {
  source_id: string;
  releases_seen: number;
  releases_processed: number;
  entries_saved: number;
  failed: number;
  high_water_mark_after: string | null;
}

export interface MonitorRunSummary {
  total_releases_processed: number;
  total_entries_saved: number;
  total_failed: number;
  per_source: SourceMonitorResult[];
}

export async function runChangelogMonitor(env: Env): Promise<MonitorRunSummary> {
  const summary: MonitorRunSummary = {
    total_releases_processed: 0,
    total_entries_saved: 0,
    total_failed: 0,
    per_source: [],
  };

  for (const target of SPEC_TARGETS) {
    const state = await getMonitorState(env, target.source_id);
    const releases = await fetchReleases(target.source_repo);

    // Releases newer than high-water mark, oldest-first so we advance
    // the mark in order even if a later one fails.
    const fresh = releases
      .filter((rl) => {
        if (!state.publishedAt) return true;
        return (rl.published_at ?? "") > state.publishedAt;
      })
      .sort((a, b) => (a.published_at ?? "").localeCompare(b.published_at ?? ""))
      .slice(0, PER_SOURCE_RELEASE_LIMIT);

    const result: SourceMonitorResult = {
      source_id: target.source_id,
      releases_seen: releases.length,
      releases_processed: 0,
      entries_saved: 0,
      failed: 0,
      high_water_mark_after: null,
    };

    for (const rl of fresh) {
      if (!rl.body || !rl.published_at) continue;
      const body = rl.body.slice(0, 16_000);
      const userMessage = [
        `Source: ${target.source_id} (${target.source_repo})`,
        `Release: ${rl.tag_name}${rl.name ? ` — ${rl.name}` : ""}`,
        `Published: ${rl.published_at}`,
        "",
        "Release notes:",
        "---",
        body,
      ].join("\n");

      const raw = await callHaiku(env, EXTRACTOR_PROMPT, userMessage);
      result.releases_processed++;
      if (!raw) {
        result.failed++;
        continue;
      }
      const entries = parseJsonl(raw);
      if (entries.length === 0) {
        // Mark high-water still — this release was processed, just no actionable entries.
        await setMonitorState(env, target.source_id, rl.tag_name, rl.published_at);
        result.high_water_mark_after = rl.published_at;
        continue;
      }
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i]!;
        const id = `su_${await shaHex8(`${target.source_id}::${rl.tag_name}::${i}`)}`;
        const promptText = renderPromptText(e, target.source_id, rl.tag_name);
        try {
          await env.DB.prepare(
            `INSERT INTO spec_updates
               (id, source_id, source_repo, release_tag, release_url, release_published_at,
                domain, kind, category, severity, title, body, tags, prompt_text, extracted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
            .bind(
              id,
              target.source_id,
              target.source_repo,
              rl.tag_name,
              rl.html_url,
              rl.published_at,
              target.domain,
              e.kind,
              e.category ?? null,
              e.severity ?? null,
              e.title,
              e.body,
              JSON.stringify(e.tags),
              promptText,
              new Date().toISOString(),
            )
            .run();
          result.entries_saved++;
        } catch {
          // dup id (re-run on same release) — ignore
        }
      }
      await setMonitorState(env, target.source_id, rl.tag_name, rl.published_at);
      result.high_water_mark_after = rl.published_at;
    }

    summary.total_releases_processed += result.releases_processed;
    summary.total_entries_saved += result.entries_saved;
    summary.total_failed += result.failed;
    summary.per_source.push(result);
  }

  return summary;
}

// --- Reader (used by GET /seeds/spec-updates/:domain) -----------------

export interface SpecUpdateRow {
  kind: "answer_key" | "failure";
  domain: "code" | "design";
  source_id: string;
  release_tag: string;
  prompt_text: string;
}

export async function listSpecUpdates(
  env: Env,
  domain: "code" | "design",
): Promise<SpecUpdateRow[]> {
  const r = await env.DB.prepare(
    `SELECT kind, domain, source_id, release_tag, prompt_text
       FROM spec_updates
      WHERE domain = ? AND removed_at IS NULL
      ORDER BY release_published_at DESC LIMIT 32`,
  )
    .bind(domain)
    .all<{ kind: string; domain: string; source_id: string; release_tag: string; prompt_text: string }>();
  const rows = r.results ?? [];
  return rows
    .filter((row) => row.kind === "answer_key" || row.kind === "failure")
    .map((row) => ({
      kind: row.kind as "answer_key" | "failure",
      domain: row.domain as "code" | "design",
      source_id: row.source_id,
      release_tag: row.release_tag,
      prompt_text: row.prompt_text,
    }));
}

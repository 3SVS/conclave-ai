/**
 * workspace/github-pr.ts
 *
 * GitHub API helpers for fetching PR files/diff.
 * Stage 11: PR diff-only — no full repo clone.
 */
import type { FetchLike } from "../github.js";

const GITHUB_API = "https://api.github.com";

export const MAX_FILES = 50;
export const MAX_PATCH_CHARS_PER_FILE = 8_000;
export const MAX_TOTAL_PATCH_CHARS = 80_000;

export type PullRequestFile = {
  filename: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged" | string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
};

export type PullRequestMeta = {
  number: number;
  title: string;
  body?: string;
  state: string;
  headBranch: string;
  baseBranch: string;
  headSha: string;
  additions: number;
  deletions: number;
  changedFiles: number;
};

export type FetchPRFilesResult = {
  meta: PullRequestMeta;
  files: PullRequestFile[];
  warnings: string[];
};

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "conclave-ai",
  };
}

export async function fetchPRMeta(
  owner: string,
  repo: string,
  prNumber: number,
  token: string,
  fetchImpl: FetchLike,
): Promise<PullRequestMeta> {
  const resp = await fetchImpl(
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`,
    { headers: ghHeaders(token) },
  );
  if (!resp.ok) throw new Error(`GitHub PR metadata HTTP ${resp.status}`);
  const pr = (await resp.json()) as {
    number: number; title: string; body?: string; state: string;
    head: { ref: string; sha: string }; base: { ref: string };
    additions: number; deletions: number; changed_files: number;
  };
  return {
    number: pr.number,
    title: pr.title,
    body: pr.body ?? undefined,
    state: pr.state,
    headBranch: pr.head.ref,
    baseBranch: pr.base.ref,
    headSha: pr.head.sha,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
  };
}

export async function fetchPRFiles(
  owner: string,
  repo: string,
  prNumber: number,
  token: string,
  fetchImpl: FetchLike,
): Promise<FetchPRFilesResult> {
  const warnings: string[] = [];

  const meta = await fetchPRMeta(owner, repo, prNumber, token, fetchImpl);

  // Fetch up to MAX_FILES (GitHub paginates at 30 by default; page through)
  const rawFiles: PullRequestFile[] = [];
  let page = 1;
  while (rawFiles.length < MAX_FILES) {
    const resp = await fetchImpl(
      `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/files?per_page=100&page=${page}`,
      { headers: ghHeaders(token) },
    );
    if (!resp.ok) throw new Error(`GitHub PR files HTTP ${resp.status}`);
    const batch = (await resp.json()) as Array<{
      filename: string; status: string;
      additions: number; deletions: number; changes: number;
      patch?: string;
    }>;
    if (batch.length === 0) break;
    for (const f of batch) {
      rawFiles.push({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch,
      });
    }
    if (batch.length < 100) break;
    page++;
  }

  if (rawFiles.length > MAX_FILES) {
    warnings.push(`PR has ${rawFiles.length} files — showing first ${MAX_FILES} only.`);
  }

  // Truncate patches to stay within budget
  let totalPatchChars = 0;
  const files: PullRequestFile[] = rawFiles.slice(0, MAX_FILES).map((f) => {
    if (!f.patch) return f;
    if (totalPatchChars >= MAX_TOTAL_PATCH_CHARS) {
      return { ...f, patch: undefined };
    }
    let patch = f.patch;
    if (patch.length > MAX_PATCH_CHARS_PER_FILE) {
      patch = patch.slice(0, MAX_PATCH_CHARS_PER_FILE) + "\n[... patch truncated]";
      warnings.push(`${f.filename}: patch truncated to ${MAX_PATCH_CHARS_PER_FILE} chars.`);
    }
    totalPatchChars += patch.length;
    if (totalPatchChars > MAX_TOTAL_PATCH_CHARS) {
      const over = totalPatchChars - MAX_TOTAL_PATCH_CHARS;
      patch = patch.slice(0, patch.length - over) + "\n[... patch truncated: total budget exceeded]";
      warnings.push(`Total patch budget (${MAX_TOTAL_PATCH_CHARS} chars) reached.`);
    }
    return { ...f, patch };
  });

  return { meta, files, warnings };
}

/** Build a compact diff summary string for LLM context. */
export function buildDiffSummary(files: PullRequestFile[]): string {
  return files.map((f) => {
    const header = `=== ${f.filename} [${f.status}] +${f.additions}/-${f.deletions} ===`;
    return f.patch ? `${header}\n${f.patch}` : `${header}\n(binary or no diff available)`;
  }).join("\n\n");
}

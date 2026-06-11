/**
 * workspace/pr-db.ts
 *
 * D1 helpers for workspace_project_pull_requests.
 * Records the PR ↔ workspace-item mapping (no review job yet).
 */
import type { Env } from "../env.js";

function randId(): string {
  const ts = Date.now().toString(36).slice(-6);
  const r = Math.random().toString(36).slice(2, 6);
  return `wpr_${ts}${r}`;
}

export type DbProjectPR = {
  id: string;
  projectId: string;
  userKey: string;
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  prState: string;
  prUrl?: string;
  prHeadBranch?: string;
  prBaseBranch?: string;
  selectedItemIds: string[];
  createdAt: string;
  updatedAt: string;
};

export async function upsertProjectPR(
  env: Env,
  input: {
    projectId: string;
    userKey: string;
    repoFullName: string;
    prNumber: number;
    prTitle: string;
    prState: string;
    prUrl?: string;
    prHeadBranch?: string;
    prBaseBranch?: string;
    selectedItemIds: string[];
  },
): Promise<DbProjectPR> {
  const now = new Date().toISOString();

  // Check for existing row (unique on project_id, repo_full_name, pr_number)
  const existing = await env.DB.prepare(
    `SELECT id, created_at FROM workspace_project_pull_requests
     WHERE project_id = ? AND repo_full_name = ? AND pr_number = ?`,
  ).bind(input.projectId, input.repoFullName, input.prNumber).first<{ id: string; created_at: string }>();

  const id = existing?.id ?? randId();
  const createdAt = existing?.created_at ?? now;

  await env.DB.prepare(
    `INSERT INTO workspace_project_pull_requests
       (id, project_id, user_key, repo_full_name, pr_number, pr_title, pr_state,
        pr_url, pr_head_branch, pr_base_branch, selected_item_ids_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (project_id, repo_full_name, pr_number) DO UPDATE SET
       user_key = excluded.user_key,
       pr_title = excluded.pr_title,
       pr_state = excluded.pr_state,
       pr_url = excluded.pr_url,
       pr_head_branch = excluded.pr_head_branch,
       pr_base_branch = excluded.pr_base_branch,
       selected_item_ids_json = excluded.selected_item_ids_json,
       updated_at = excluded.updated_at`,
  )
    .bind(
      id, input.projectId, input.userKey, input.repoFullName,
      input.prNumber, input.prTitle, input.prState,
      input.prUrl ?? null, input.prHeadBranch ?? null, input.prBaseBranch ?? null,
      JSON.stringify(input.selectedItemIds), createdAt, now,
    )
    .run();

  return {
    id, projectId: input.projectId, userKey: input.userKey, repoFullName: input.repoFullName,
    prNumber: input.prNumber, prTitle: input.prTitle, prState: input.prState,
    prUrl: input.prUrl, prHeadBranch: input.prHeadBranch, prBaseBranch: input.prBaseBranch,
    selectedItemIds: input.selectedItemIds, createdAt, updatedAt: now,
  };
}

export async function getLinkedPRs(env: Env, projectId: string, limit = 30): Promise<DbProjectPR[]> {
  const rows = await env.DB.prepare(
    `SELECT id, project_id, user_key, repo_full_name, pr_number, pr_title, pr_state,
            pr_url, pr_head_branch, pr_base_branch, selected_item_ids_json, created_at, updated_at
     FROM workspace_project_pull_requests
     WHERE project_id = ?
     ORDER BY updated_at DESC
     LIMIT ?`,
  )
    .bind(projectId, limit)
    .all<{
      id: string; project_id: string; user_key: string; repo_full_name: string;
      pr_number: number; pr_title: string; pr_state: string;
      pr_url: string | null; pr_head_branch: string | null; pr_base_branch: string | null;
      selected_item_ids_json: string; created_at: string; updated_at: string;
    }>();

  return (rows.results ?? []).map((r) => ({
    id: r.id, projectId: r.project_id, userKey: r.user_key, repoFullName: r.repo_full_name,
    prNumber: r.pr_number, prTitle: r.pr_title, prState: r.pr_state,
    prUrl: r.pr_url ?? undefined, prHeadBranch: r.pr_head_branch ?? undefined,
    prBaseBranch: r.pr_base_branch ?? undefined,
    selectedItemIds: (() => { try { return JSON.parse(r.selected_item_ids_json) as string[]; } catch { return []; } })(),
    createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

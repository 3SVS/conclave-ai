/**
 * workspace/pr-comment-db.ts
 *
 * D1 helpers for workspace_pr_comments.
 * Tracks GitHub issue comments posted from the dashboard after a PR review run.
 */
import type { Env } from "../env.js";

export type PrCommentStatus = "draft" | "posted" | "error";

export type DbPrComment = {
  id: string;
  projectId: string;
  userKey: string;
  repoFullName: string;
  prNumber: number;
  reviewRunId?: string;
  selectedItemIds: string[];
  githubCommentId?: string;
  githubCommentUrl?: string;
  bodyPreview: string;
  status: PrCommentStatus;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

function randId(): string {
  const ts = Date.now().toString(36).slice(-6);
  const r = Math.random().toString(36).slice(2, 6);
  return `wprc_${ts}${r}`;
}

export async function insertPrComment(
  env: Env,
  input: {
    projectId: string;
    userKey: string;
    repoFullName: string;
    prNumber: number;
    reviewRunId?: string;
    selectedItemIds: string[];
    bodyPreview: string;
    status: PrCommentStatus;
  },
): Promise<DbPrComment> {
  const now = new Date().toISOString();
  const id = randId();

  await env.DB.prepare(
    `INSERT INTO workspace_pr_comments
       (id, project_id, user_key, repo_full_name, pr_number, review_run_id,
        selected_item_ids_json, body_preview, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id, input.projectId, input.userKey, input.repoFullName, input.prNumber,
      input.reviewRunId ?? null, JSON.stringify(input.selectedItemIds),
      input.bodyPreview, input.status, now, now,
    )
    .run();

  return {
    id,
    projectId: input.projectId,
    userKey: input.userKey,
    repoFullName: input.repoFullName,
    prNumber: input.prNumber,
    reviewRunId: input.reviewRunId,
    selectedItemIds: input.selectedItemIds,
    bodyPreview: input.bodyPreview,
    status: input.status,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updatePrComment(
  env: Env,
  id: string,
  update: {
    status: PrCommentStatus;
    githubCommentId?: string;
    githubCommentUrl?: string;
    errorMessage?: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE workspace_pr_comments
     SET status = ?, github_comment_id = ?, github_comment_url = ?,
         error_message = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      update.status,
      update.githubCommentId ?? null,
      update.githubCommentUrl ?? null,
      update.errorMessage ?? null,
      now,
      id,
    )
    .run();
}

export async function getPrComments(
  env: Env,
  projectId: string,
  repoFullName: string,
  prNumber: number,
): Promise<DbPrComment[]> {
  const rows = await env.DB.prepare(
    `SELECT id, project_id, user_key, repo_full_name, pr_number, review_run_id,
            selected_item_ids_json, github_comment_id, github_comment_url,
            body_preview, status, error_message, created_at, updated_at
     FROM workspace_pr_comments
     WHERE project_id = ? AND repo_full_name = ? AND pr_number = ?
     ORDER BY updated_at DESC LIMIT 20`,
  )
    .bind(projectId, repoFullName, prNumber)
    .all<{
      id: string; project_id: string; user_key: string; repo_full_name: string;
      pr_number: number; review_run_id: string | null;
      selected_item_ids_json: string; github_comment_id: string | null;
      github_comment_url: string | null; body_preview: string;
      status: string; error_message: string | null;
      created_at: string; updated_at: string;
    }>();

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    userKey: row.user_key,
    repoFullName: row.repo_full_name,
    prNumber: row.pr_number,
    reviewRunId: row.review_run_id ?? undefined,
    selectedItemIds: (() => { try { return JSON.parse(row.selected_item_ids_json) as string[]; } catch { return []; } })(),
    githubCommentId: row.github_comment_id ?? undefined,
    githubCommentUrl: row.github_comment_url ?? undefined,
    bodyPreview: row.body_preview,
    status: row.status as PrCommentStatus,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

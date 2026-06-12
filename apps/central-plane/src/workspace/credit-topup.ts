/**
 * workspace/credit-topup.ts
 *
 * Stage 33: user-initiated credit top-up request helpers.
 * No payment integration — admin grant only.
 *
 * status flow: requested → fulfilled | rejected
 * max 3 open (requested) requests per user
 */
import type { Env } from "../env.js";
import type { CreditType } from "./credits.js";
import { grantCredits } from "./credits.js";

export type TopUpStatus = "requested" | "fulfilled" | "rejected";

export type TopUpRequest = {
  id: string;
  userKey: string;
  creditType: CreditType;
  requestedAmount: number;
  status: TopUpStatus;
  note?: string;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
};

const MAX_OPEN_REQUESTS = 3;

type TopUpRow = {
  id: string;
  user_key: string;
  credit_type: string;
  requested_amount: number;
  status: string;
  note: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

function rowToRequest(r: TopUpRow): TopUpRequest {
  return {
    id: r.id,
    userKey: r.user_key,
    creditType: r.credit_type as CreditType,
    requestedAmount: r.requested_amount,
    status: r.status as TopUpStatus,
    ...(r.note !== null ? { note: r.note } : {}),
    ...(r.admin_note !== null ? { adminNote: r.admin_note } : {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(r.resolved_at !== null ? { resolvedAt: r.resolved_at } : {}),
  };
}

export type CreateTopUpInput = {
  userKey: string;
  creditType?: CreditType;
  requestedAmount: number;
  note?: string;
};

export type CreateTopUpResult =
  | { ok: true; request: TopUpRequest }
  | { ok: false; error: "invalid_amount" | "too_many_open_requests" | "db_error" };

export async function createTopUpRequest(
  env: Env,
  input: CreateTopUpInput,
): Promise<CreateTopUpResult> {
  if (!Number.isInteger(input.requestedAmount) || input.requestedAmount < 1 || input.requestedAmount > 100) {
    return { ok: false, error: "invalid_amount" };
  }

  const creditType: CreditType = input.creditType ?? "review";

  try {
    const openRow = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM workspace_credit_topup_requests
       WHERE user_key = ? AND status = 'requested'`,
    )
      .bind(input.userKey)
      .first<{ count: number }>();

    if ((openRow?.count ?? 0) >= MAX_OPEN_REQUESTS) {
      return { ok: false, error: "too_many_open_requests" };
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO workspace_credit_topup_requests
         (id, user_key, credit_type, requested_amount, status, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'requested', ?, ?, ?)`,
    )
      .bind(id, input.userKey, creditType, input.requestedAmount, input.note ?? null, now, now)
      .run();

    const request: TopUpRequest = {
      id,
      userKey: input.userKey,
      creditType,
      requestedAmount: input.requestedAmount,
      status: "requested",
      ...(input.note !== undefined ? { note: input.note } : {}),
      createdAt: now,
      updatedAt: now,
    };

    return { ok: true, request };
  } catch (err) {
    console.error("[createTopUpRequest] failed:", err);
    return { ok: false, error: "db_error" };
  }
}

export async function listTopUpRequests(
  env: Env,
  userKey: string,
): Promise<TopUpRequest[]> {
  const result = await env.DB.prepare(
    `SELECT id, user_key, credit_type, requested_amount, status, note, admin_note, created_at, updated_at, resolved_at
     FROM workspace_credit_topup_requests
     WHERE user_key = ?
     ORDER BY created_at DESC
     LIMIT 20`,
  )
    .bind(userKey)
    .all<TopUpRow>();
  return (result.results ?? []).map(rowToRequest);
}

export async function listAdminTopUpRequests(
  env: Env,
  status?: string,
): Promise<TopUpRequest[]> {
  const result = await (status
    ? env.DB.prepare(
        `SELECT id, user_key, credit_type, requested_amount, status, note, admin_note, created_at, updated_at, resolved_at
         FROM workspace_credit_topup_requests
         WHERE status = ?
         ORDER BY created_at DESC
         LIMIT 100`,
      ).bind(status)
    : env.DB.prepare(
        `SELECT id, user_key, credit_type, requested_amount, status, note, admin_note, created_at, updated_at, resolved_at
         FROM workspace_credit_topup_requests
         ORDER BY created_at DESC
         LIMIT 100`,
      )
  ).all<TopUpRow>();
  return (result.results ?? []).map(rowToRequest);
}

export type FulfillTopUpResult =
  | { ok: true; request: TopUpRequest; newBalance: number }
  | { ok: false; error: string };

export async function fulfillTopUpRequest(
  env: Env,
  id: string,
  adminNote?: string,
): Promise<FulfillTopUpResult> {
  const row = await env.DB.prepare(
    `SELECT id, user_key, credit_type, requested_amount, status, note, admin_note, created_at, updated_at, resolved_at
     FROM workspace_credit_topup_requests WHERE id = ?`,
  )
    .bind(id)
    .first<TopUpRow>();

  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "requested") {
    return { ok: false, error: `already_resolved:${row.status}` };
  }

  let newBalance = 0;
  try {
    const grantResult = await grantCredits(env, {
      userKey: row.user_key,
      creditType: row.credit_type as CreditType,
      amount: row.requested_amount,
      reason: `top-up-request:${id}`,
    });
    newBalance = grantResult.balance.balance;
  } catch (err) {
    return { ok: false, error: `grant_failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE workspace_credit_topup_requests
     SET status = 'fulfilled', admin_note = ?, updated_at = ?, resolved_at = ?
     WHERE id = ?`,
  )
    .bind(adminNote ?? null, now, now, id)
    .run();

  const request: TopUpRequest = {
    ...rowToRequest(row),
    status: "fulfilled",
    adminNote: adminNote,
    updatedAt: now,
    resolvedAt: now,
  };

  return { ok: true, request, newBalance };
}

export type RejectTopUpResult =
  | { ok: true; request: TopUpRequest }
  | { ok: false; error: string };

export async function rejectTopUpRequest(
  env: Env,
  id: string,
  adminNote?: string,
): Promise<RejectTopUpResult> {
  const row = await env.DB.prepare(
    `SELECT id, user_key, credit_type, requested_amount, status, note, admin_note, created_at, updated_at, resolved_at
     FROM workspace_credit_topup_requests WHERE id = ?`,
  )
    .bind(id)
    .first<TopUpRow>();

  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "requested") {
    return { ok: false, error: `already_resolved:${row.status}` };
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE workspace_credit_topup_requests
     SET status = 'rejected', admin_note = ?, updated_at = ?, resolved_at = ?
     WHERE id = ?`,
  )
    .bind(adminNote ?? null, now, now, id)
    .run();

  const request: TopUpRequest = {
    ...rowToRequest(row),
    status: "rejected",
    adminNote: adminNote,
    updatedAt: now,
    resolvedAt: now,
  };

  return { ok: true, request };
}

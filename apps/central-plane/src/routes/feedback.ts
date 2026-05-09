/**
 * v0.16.9 — Sprint A: feedback intake routes.
 *
 *   POST /feedback                    — Bearer-auth user submits feedback on
 *                                       a prior conclave run. Sync classify with
 *                                       async fallback (status='pending' if Haiku
 *                                       fails; cron retries every 6h).
 *   GET  /me/feedback                 — Bearer-auth user lists their own
 *                                       last 50 feedback entries.
 *   POST /admin/classify-feedback     — INTERNAL_CALLBACK_TOKEN-auth retry
 *                                       of pending rows. Called by cron and
 *                                       manually for debugging.
 *
 * Returns 200 when sync classify succeeded, 202 when queued as pending.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { findUserByToken } from "../db/saas.js";
import { classifyFeedback, type ClassifyResult } from "../feedback-classifier.js";

const SEVERITIES = ["blocker", "major", "minor", "nit"] as const;
const DOMAINS = ["code", "design"] as const;
const MAX_TEXT_LEN = 4000;
const RETRY_LIMIT = 50;        // rows per /admin/classify-feedback call
const MAX_RETRIES_PER_ROW = 3; // after which status flips to 'failed'

type Severity = (typeof SEVERITIES)[number];
type Domain = (typeof DOMAINS)[number];

interface FeedbackInput {
  run_id?: unknown;
  job_id?: unknown;
  domain?: unknown;
  severity?: unknown;
  what_user_wanted?: unknown;
  what_we_produced?: unknown;
}

function isSeverity(s: unknown): s is Severity {
  return typeof s === "string" && (SEVERITIES as readonly string[]).includes(s);
}

function isDomain(s: unknown): s is Domain {
  return typeof s === "string" && (DOMAINS as readonly string[]).includes(s);
}

function newId(): string {
  const t = Date.now().toString(36);
  // 16 chars from crypto-strong randomness so two parallel intakes can't collide.
  const buf = new Uint8Array(10);
  crypto.getRandomValues(buf);
  const r = [...buf].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
  return `fb_${t}_${r}`;
}

export function createFeedbackRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // --- POST /feedback -----------------------------------------------------
  app.post("/feedback", async (c) => {
    const auth = c.req.header("authorization") ?? c.req.header("Authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m) return c.json({ error: "missing bearer token" }, 401);
    const found = await findUserByToken(c.env, m[1]!);
    if (!found) return c.json({ error: "invalid token" }, 401);

    const body = (await c.req.json().catch(() => null)) as FeedbackInput | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "invalid_request", error_description: "JSON body required" }, 400);
    }
    if (!isDomain(body.domain)) {
      return c.json({ error: "invalid_domain", error_description: "domain must be 'code' or 'design'" }, 400);
    }
    if (!isSeverity(body.severity)) {
      return c.json(
        { error: "invalid_severity", error_description: "severity must be one of blocker|major|minor|nit" },
        400,
      );
    }
    if (typeof body.what_user_wanted !== "string" || body.what_user_wanted.trim().length === 0) {
      return c.json({ error: "invalid_request", error_description: "what_user_wanted required (non-empty string)" }, 400);
    }
    if (typeof body.what_we_produced !== "string" || body.what_we_produced.trim().length === 0) {
      return c.json({ error: "invalid_request", error_description: "what_we_produced required (non-empty string)" }, 400);
    }

    const id = newId();
    const now = new Date().toISOString();
    const userId = found.user.id;
    const domain = body.domain;
    const severity = body.severity;
    const wantedTrim = body.what_user_wanted.slice(0, MAX_TEXT_LEN);
    const producedTrim = body.what_we_produced.slice(0, MAX_TEXT_LEN);
    const jobId = typeof body.job_id === "string" && body.job_id.length > 0 ? body.job_id : null;
    const runId = typeof body.run_id === "string" && body.run_id.length > 0 ? body.run_id : null;

    let cls: ClassifyResult | null = null;
    let lastError: string | null = null;
    try {
      cls = await classifyFeedback(c.env, {
        domain,
        severity,
        what_user_wanted: wantedTrim,
        what_we_produced: producedTrim,
      });
    } catch (err) {
      lastError = (err as Error).message.slice(0, 240);
      console.error("[feedback] sync classify failed; queued for cron retry:", lastError);
    }

    const status: "classified" | "pending" = cls ? "classified" : "pending";
    const classifiedAt = cls ? now : null;
    const retryCount = cls ? 0 : 1; // sync attempt counts as retry 1

    await c.env.DB.prepare(
      `INSERT INTO user_feedback
        (id, user_id, job_id, run_id, domain, severity,
         what_user_wanted, what_we_produced,
         category, confidence, reasoning,
         status, retry_count, last_error,
         created_at, classified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        userId,
        jobId,
        runId,
        domain,
        severity,
        wantedTrim,
        producedTrim,
        cls?.category ?? null,
        cls?.confidence ?? null,
        cls?.reasoning ?? null,
        status,
        retryCount,
        lastError,
        now,
        classifiedAt,
      )
      .run();

    return c.json(
      {
        id,
        status,
        category: cls?.category ?? null,
        confidence: cls?.confidence ?? null,
        reasoning: cls?.reasoning ?? null,
      },
      status === "classified" ? 200 : 202,
    );
  });

  // --- GET /me/feedback ---------------------------------------------------
  app.get("/me/feedback", async (c) => {
    const auth = c.req.header("authorization") ?? c.req.header("Authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m) return c.json({ error: "missing bearer token" }, 401);
    const found = await findUserByToken(c.env, m[1]!);
    if (!found) return c.json({ error: "invalid token" }, 401);

    const r = await c.env.DB.prepare(
      `SELECT id, domain, severity, category, confidence, reasoning, status, created_at, classified_at
         FROM user_feedback
        WHERE user_id = ? AND removed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 50`,
    )
      .bind(found.user.id)
      .all();
    return c.json({ feedback: r.results ?? [] });
  });

  // --- POST /admin/classify-feedback --------------------------------------
  app.post("/admin/classify-feedback", async (c) => {
    const expected = c.env.INTERNAL_CALLBACK_TOKEN;
    if (!expected) return c.json({ error: "admin_disabled" }, 503);
    const auth = c.req.header("authorization") ?? c.req.header("Authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m || m[1] !== expected) return c.json({ error: "unauthorized" }, 401);

    const result = await retryPendingFeedback(c.env, RETRY_LIMIT);
    return c.json(result);
  });

  return app;
}

export interface RetryPendingResult {
  scanned: number;
  classified: number;
  failed_terminal: number;          // hit MAX_RETRIES_PER_ROW
  failed_transient: number;         // will retry next cron
  failures: Array<{ id: string; reason: string }>;
}

/**
 * Retry classification for `pending` rows. Idempotent — safe to call
 * concurrently because each UPDATE is keyed on the row id and bumps
 * `retry_count`. Rows that have failed `MAX_RETRIES_PER_ROW` times flip
 * to status='failed' and are skipped on subsequent passes.
 */
export async function retryPendingFeedback(env: Env, limit: number): Promise<RetryPendingResult> {
  const r = await env.DB.prepare(
    `SELECT id, domain, severity, what_user_wanted, what_we_produced, retry_count
       FROM user_feedback
      WHERE status = 'pending' AND removed_at IS NULL
      ORDER BY created_at ASC
      LIMIT ?`,
  )
    .bind(limit)
    .all<{
      id: string;
      domain: string;
      severity: string;
      what_user_wanted: string;
      what_we_produced: string;
      retry_count: number;
    }>();

  const rows = r.results ?? [];
  let classified = 0;
  let failed_terminal = 0;
  let failed_transient = 0;
  const failures: Array<{ id: string; reason: string }> = [];

  for (const row of rows) {
    try {
      const cls = await classifyFeedback(env, {
        domain: row.domain as "code" | "design",
        severity: row.severity as "blocker" | "major" | "minor" | "nit",
        what_user_wanted: row.what_user_wanted,
        what_we_produced: row.what_we_produced,
      });
      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE user_feedback
            SET category = ?, confidence = ?, reasoning = ?,
                status = 'classified', classified_at = ?,
                last_error = NULL,
                retry_count = retry_count + 1
          WHERE id = ?`,
      )
        .bind(cls.category, cls.confidence, cls.reasoning, now, row.id)
        .run();
      classified++;
    } catch (err) {
      const msg = (err as Error).message.slice(0, 240);
      const newCount = (row.retry_count ?? 0) + 1;
      const terminal = newCount >= MAX_RETRIES_PER_ROW;
      await env.DB.prepare(
        `UPDATE user_feedback
            SET retry_count = ?,
                last_error = ?,
                status = ?
          WHERE id = ?`,
      )
        .bind(newCount, msg, terminal ? "failed" : "pending", row.id)
        .run()
        .catch(() => undefined);
      if (terminal) failed_terminal++;
      else failed_transient++;
      failures.push({ id: row.id, reason: msg });
    }
  }
  return { scanned: rows.length, classified, failed_terminal, failed_transient, failures };
}

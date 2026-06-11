/**
 * Workspace generation routes.
 *
 * POST /workspace/idea-to-spec-draft
 *   Free beta — no auth required.
 *   Rate-limited: WORKSPACE_GENERATION_LIMIT_PER_HOUR (default 20) req/hour per IP.
 *   Calls Anthropic to generate a structured Korean product spec.
 *   Falls back to mock data on LLM failure so the client never breaks.
 *   Rate-limit hit returns HTTP 429 — NO mock fallback in that case.
 *
 * CORS: allowed for dashboard origins and localhost in dev.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { generateIdeaToSpecDraft, type IdeaToSpecDraftRequest } from "../workspace/generate.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT_PER_HOUR = 20;

const ALLOWED_ORIGINS = [
  "http://localhost:3002",
  "http://localhost:3000",
  "https://dashboard.conclave-ai.dev",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed: string =
    origin && (ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".conclave-ai.dev"))
      ? origin
      : (ALLOWED_ORIGINS[0] as string);
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

/** SHA-256 hex of `input` using the Web Crypto API available in Workers. */
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * UTC hour key, e.g. "2026-06-11T15".
 * Used as the rate-limit window bucket — resets every full UTC hour.
 */
function currentHourUtc(): string {
  return new Date().toISOString().slice(0, 13); // "2026-06-11T15"
}

/** Seconds until the next full UTC hour. */
function secondsUntilNextHour(): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return Math.max(60, Math.floor((next.getTime() - now.getTime()) / 1000));
}

// ─── Rate limit D1 helpers ────────────────────────────────────────────────────

async function getRateLimitCount(
  db: D1Database,
  ipHash: string,
  hourUtc: string,
): Promise<number> {
  try {
    const row = await db
      .prepare("SELECT count FROM workspace_rate_limit WHERE ip_hash = ? AND hour_utc = ?")
      .bind(ipHash, hourUtc)
      .first<{ count: number }>();
    return row?.count ?? 0;
  } catch {
    // Table may not exist yet in local dev — treat as 0
    return 0;
  }
}

async function incrementRateLimitCount(
  db: D1Database,
  ipHash: string,
  hourUtc: string,
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO workspace_rate_limit (ip_hash, hour_utc, count, first_at, last_at)
         VALUES (?, ?, 1, ?, ?)
         ON CONFLICT (ip_hash, hour_utc) DO UPDATE SET
           count = count + 1, last_at = excluded.last_at`,
      )
      .bind(ipHash, hourUtc, now, now)
      .run();
  } catch (err) {
    // Non-fatal — don't block the request on a rate-limit write failure
    console.warn("[workspace/rate-limit] upsert failed (non-fatal):", err);
  }
}

// ─── Route factory ────────────────────────────────────────────────────────────

export function createWorkspaceRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // Preflight
  app.options("/workspace/*", (c) => {
    const origin = c.req.header("origin") ?? null;
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  });

  /**
   * POST /workspace/idea-to-spec-draft
   *
   * Body: IdeaToSpecDraftRequest
   *
   * Success (200): IdeaToSpecDraftResponse — source is "llm" or "mock-fallback"
   * Rate limited (429): { ok: false, error: "rate_limited", message, retryAfterSeconds }
   * Bad input (400): { ok: false, error: string }
   * Server error (500): { ok: false, error: "internal_error" }
   */
  app.post("/workspace/idea-to-spec-draft", async (c) => {
    const origin = c.req.header("origin") ?? null;
    const headers = corsHeaders(origin);

    // ── Parse body ──────────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
        status: 400,
        headers: { "content-type": "application/json", ...headers },
      });
    }

    const req = body as Partial<IdeaToSpecDraftRequest>;
    if (!req.idea || typeof req.idea !== "string" || !req.idea.trim()) {
      return new Response(JSON.stringify({ ok: false, error: "idea_required" }), {
        status: 400,
        headers: { "content-type": "application/json", ...headers },
      });
    }

    // ── Rate limit ───────────────────────────────────────────────────────────
    const limitPerHour =
      parseInt(c.env.WORKSPACE_GENERATION_LIMIT_PER_HOUR ?? "", 10) || DEFAULT_LIMIT_PER_HOUR;

    const rawIp =
      c.req.header("cf-connecting-ip") ??
      (c.req.header("x-forwarded-for") ?? "").split(",")[0]?.trim() ??
      "unknown";
    const ipHash = await sha256Hex(`workspace::${rawIp}`);
    const hourUtc = currentHourUtc();

    const currentCount = await getRateLimitCount(c.env.DB, ipHash, hourUtc);
    if (currentCount >= limitPerHour) {
      const retryAfterSeconds = secondsUntilNextHour();
      return new Response(
        JSON.stringify({
          ok: false,
          error: "rate_limited",
          message:
            "잠시 후 다시 시도해주세요. 제품 설명서 만들기 요청이 짧은 시간에 많이 발생했어요.",
          retryAfterSeconds,
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": String(retryAfterSeconds),
            ...headers,
          },
        },
      );
    }

    // ── Generate ─────────────────────────────────────────────────────────────
    const input: IdeaToSpecDraftRequest = {
      idea: req.idea.trim().slice(0, 1000),
      mode: req.mode ?? "standard",
      answers: Array.isArray(req.answers) ? req.answers : [],
      locale: req.locale ?? "ko",
    };

    let result;
    try {
      result = await generateIdeaToSpecDraft(input, c.env.ANTHROPIC_API_KEY);
    } catch (err) {
      console.error("[workspace] unexpected generate error:", err);
      return new Response(JSON.stringify({ ok: false, error: "internal_error" }), {
        status: 500,
        headers: { "content-type": "application/json", ...headers },
      });
    }

    // Increment rate-limit counter after successful generation (non-fatal)
    await incrementRateLimitCount(c.env.DB, ipHash, hourUtc);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json", ...headers },
    });
  });

  return app;
}

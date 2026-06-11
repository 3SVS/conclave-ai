/**
 * Workspace generation routes.
 *
 * POST /workspace/idea-to-spec-draft
 *   Free beta — no auth, no credit charge.
 *   Calls Anthropic to generate a structured Korean product spec.
 *   Falls back to mock data on LLM failure so the client never breaks.
 *
 * CORS: allowed for the dashboard origin (and localhost in dev).
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { generateIdeaToSpecDraft, type IdeaToSpecDraftRequest } from "../workspace/generate.js";

const ALLOWED_ORIGINS = [
  "http://localhost:3002",
  "http://localhost:3000",
  "https://dashboard.conclave-ai.dev",
];

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

export function createWorkspaceRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // Preflight
  app.options("/workspace/*", (c) => {
    const origin = c.req.header("origin") ?? null;
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  });

  /**
   * POST /workspace/idea-to-spec-draft
   * Body: IdeaToSpecDraftRequest
   * Response: IdeaToSpecDraftResponse (always 200; source indicates llm vs fallback)
   */
  app.post("/workspace/idea-to-spec-draft", async (c) => {
    const origin = c.req.header("origin") ?? null;
    const headers = corsHeaders(origin);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "invalid_json" }, 400);
    }

    const req = body as Partial<IdeaToSpecDraftRequest>;
    if (!req.idea || typeof req.idea !== "string") {
      return c.json({ ok: false, error: "idea_required" }, 400);
    }

    const input: IdeaToSpecDraftRequest = {
      idea: req.idea.trim().slice(0, 1000),
      mode: req.mode ?? "standard",
      answers: Array.isArray(req.answers) ? req.answers : [],
      locale: req.locale ?? "ko",
    };

    try {
      const result = await generateIdeaToSpecDraft(input, c.env.ANTHROPIC_API_KEY);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "content-type": "application/json", ...headers },
      });
    } catch (err) {
      console.error("[workspace] unexpected error:", err);
      return new Response(
        JSON.stringify({ ok: false, error: "internal_error" }),
        { status: 500, headers: { "content-type": "application/json", ...headers } },
      );
    }
  });

  return app;
}

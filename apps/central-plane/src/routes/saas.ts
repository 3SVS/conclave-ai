/**
 * v0.16 (Problem 3) — SaaS pipeline endpoints.
 *
 *   POST /saas/review   — body: { repo, pr_number, prd? }
 *   POST /saas/autofix  — body: { repo, pr_number, prd?, max_cycles? }
 *
 * Both require Authorization: Bearer <token> issued via the Device Flow
 * (see /auth/device + /auth/token in saas-auth.ts).
 *
 * v0.16 ships these as accepted-then-deferred. The Worker:
 *   1. Validates the bearer token → resolves saas_users row.
 *   2. Validates the GH App is installed on the target repo + has access.
 *   3. Records a usage_meters precursor row (for Stripe later).
 *   4. Returns 202 with a job_id.
 *   5. **TODO** (Stage 2 follow-up): spawn Cloudflare Container with the
 *      payload; container runs runAutofix from cli/dist/autofix-pipeline.js;
 *      result is delivered back via /webhook/internal/job-done →
 *      Telegram + PR comment.
 *
 * Until Stage 2 lands, the 202 returns immediately but no actual work
 * fires. This unblocks Stage 7 (deploy workflow) + Stage 8 (CLI client)
 * + Stage 9 (Bae registers Worker secrets) so when Container goes live
 * everything else is already validated.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import {
  findInstallationByRepoSlug,
  findUserByToken,
  recordMeter,
} from "../db/saas.js";

const PIPELINE_PENDING_NOTE =
  "Container worker not yet provisioned. The job is recorded; pipeline execution lands in the next deploy.";

export function createSaasRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/saas/review", async (c) => {
    const auth = await requireAuth(c);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    const { user } = auth;

    const body = (await c.req.json().catch(() => null)) as
      | { repo?: string; pr_number?: number; prd?: string }
      | null;
    if (!body || !body.repo || typeof body.pr_number !== "number") {
      return c.json({ error: "invalid_request", error_description: "repo + pr_number required" }, 400);
    }

    // Verify Conclave AI Code Council is installed on the repo's owner.
    const inst = await findInstallationByRepoSlug(c.env, body.repo);
    if (!inst) {
      return c.json(
        {
          error: "app_not_installed",
          error_description: `Install Conclave AI Code Council on ${body.repo.split("/")[0]} first.`,
          install_url: "https://github.com/apps/conclave-ai-code-council",
        },
        403,
      );
    }
    if (inst.suspendedAt) {
      return c.json({ error: "app_suspended" }, 403);
    }

    const jobId = `job_${Math.floor(Date.now()).toString(36)}_${randHex(8)}`;
    await recordMeter(c.env, {
      userId: user.id,
      meterName: "review.requested",
      quantity: 1,
      repoSlug: body.repo,
    });

    // TODO Stage 2: spawn container, kick off pipeline, deliver result.
    return c.json(
      {
        job_id: jobId,
        status: "accepted",
        note: PIPELINE_PENDING_NOTE,
      },
      202,
    );
  });

  app.post("/saas/autofix", async (c) => {
    const auth = await requireAuth(c);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    const { user } = auth;

    const body = (await c.req.json().catch(() => null)) as
      | { repo?: string; pr_number?: number; prd?: string; max_cycles?: number }
      | null;
    if (!body || !body.repo || typeof body.pr_number !== "number") {
      return c.json({ error: "invalid_request", error_description: "repo + pr_number required" }, 400);
    }

    const inst = await findInstallationByRepoSlug(c.env, body.repo);
    if (!inst) {
      return c.json(
        {
          error: "app_not_installed",
          install_url: "https://github.com/apps/conclave-ai-code-council",
        },
        403,
      );
    }
    if (inst.suspendedAt) {
      return c.json({ error: "app_suspended" }, 403);
    }

    const jobId = `job_${Math.floor(Date.now()).toString(36)}_${randHex(8)}`;
    await recordMeter(c.env, {
      userId: user.id,
      meterName: "autofix.requested",
      quantity: 1,
      repoSlug: body.repo,
    });

    // TODO Stage 2: spawn container, run pipeline with autofix flag.
    return c.json(
      {
        job_id: jobId,
        status: "accepted",
        note: PIPELINE_PENDING_NOTE,
      },
      202,
    );
  });

  // Convenience: GET /saas/me — returns the authenticated user. CLI uses
  // this on `conclave login` confirmation + `conclave whoami`.
  app.get("/saas/me", async (c) => {
    const auth = await requireAuth(c);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    const { user } = auth;
    return c.json({
      id: user.id,
      github_login: user.githubLogin,
      email: user.email,
      tier: user.tier,
      byo_anthropic: user.byoAnthropic,
      data_share_opt_in: user.dataShareOptIn,
    });
  });

  return app;
}

async function requireAuth(c: any): Promise<
  | { user: NonNullable<Awaited<ReturnType<typeof findUserByToken>>>["user"]; tokenId: string }
  | { error: string; status: 401 | 403 }
> {
  const header = c.req.header("authorization") ?? c.req.header("Authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return { error: "missing or malformed Authorization: Bearer <token>", status: 401 };
  const found = await findUserByToken(c.env, m[1]!);
  if (!found) return { error: "invalid or revoked token", status: 401 };
  return found;
}

function randHex(n: number): string {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

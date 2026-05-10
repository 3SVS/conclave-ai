import { createApp } from "./router.js";
import type { Env } from "./env.js";
import { assertPreflight } from "./preflight.js";
import { selfHealWebhook } from "./webhook-heal.js";
import { cleanupStuckJobs } from "./stuck-cleanup.js";
import { refreshAllSources } from "./external-references.js";
import { retryPendingFeedback } from "./routes/feedback.js";
import { promoteSeedsPass } from "./seed-promoter.js";
import { runSourceDiscovery } from "./source-discovery.js";

const app = createApp();

// Module-scoped cache: run the preflight once per isolate. The key is
// the KEK value so that a secret rotation restarts the check on the
// next request — cheap and safe. Sentinel distinguishes "never checked"
// from "checked with undefined".
const UNCHECKED = Symbol("unchecked");
let preflightCheckedFor: string | null | typeof UNCHECKED = UNCHECKED;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const kek = env.CONCLAVE_TOKEN_KEK ?? null;
    if (preflightCheckedFor === UNCHECKED || preflightCheckedFor !== kek) {
      assertPreflight(env);
      preflightCheckedFor = kek;
    }
    return app.fetch(request, env, ctx);
  },
  // Scheduled handler for cron triggers.
  //
  // Multiple crons are wired to the same handler; we branch on
  // event.cron to dispatch:
  //   - every 10 min → Telegram webhook self-heal (v0.13.7)
  //   - every 5 min  → SaaS jobs stuck-cleanup (v0.16.4)
  //   - every day 03:00 UTC → external design references refresh (v0.16.8)
  //   - every 6 hours      → retry pending user_feedback classification (v0.16.9)
  //
  // Each branch logs a structured outcome so `wrangler tail` is the
  // audit trail (the scheduled trigger has no caller to return data to).
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === "*/5 * * * *") {
      try {
        const result = await cleanupStuckJobs(env);
        console.log(JSON.stringify({ cron: "stuck-cleanup", cronExpression: event.cron, ...result }));
      } catch (err) {
        console.error("[stuck-cleanup] crashed:", err);
      }
      return;
    }
    if (event.cron === "0 3 * * *") {
      try {
        const results = await refreshAllSources(env);
        const ok = results.filter((r) => r.ok).length;
        const total = results.length;
        const totalEntries = results.reduce((s, r) => s + r.entries, 0);
        console.log(
          JSON.stringify({
            cron: "external-references-refresh",
            cronExpression: event.cron,
            sources_ok: ok,
            sources_total: total,
            entries_total: totalEntries,
            results,
          }),
        );
      } catch (err) {
        console.error("[external-references-refresh] crashed:", err);
      }
      return;
    }
    if (event.cron === "0 */6 * * *") {
      try {
        const result = await retryPendingFeedback(env, 50);
        console.log(
          JSON.stringify({
            cron: "feedback-classify-retry",
            cronExpression: event.cron,
            ...result,
          }),
        );
      } catch (err) {
        console.error("[feedback-classify-retry] crashed:", err);
      }
      return;
    }
    if (event.cron === "0 4 * * *") {
      try {
        const result = await promoteSeedsPass(env);
        console.log(
          JSON.stringify({
            cron: "seed-promoter",
            cronExpression: event.cron,
            ...result,
          }),
        );
      } catch (err) {
        console.error("[seed-promoter] crashed:", err);
      }
      return;
    }
    if (event.cron === "0 5 * * 0") {
      try {
        const result = await runSourceDiscovery(env);
        console.log(
          JSON.stringify({
            cron: "source-discovery",
            cronExpression: event.cron,
            ...result,
          }),
        );
      } catch (err) {
        console.error("[source-discovery] crashed:", err);
      }
      return;
    }
    // Default / "*/10 * * * *" — webhook self-heal.
    const result = await selfHealWebhook(env);
    console.log(JSON.stringify({
      cron: "webhook-self-heal",
      cronExpression: event.cron,
      ...result,
    }));
  },
};

export { createApp } from "./router.js";
// v0.16.2 — wrangler discovers the Durable Object class via the main
// entry's exports. Imported here directly (not via router.ts) so node
// --test consumers of router.ts don't transitively pull in the Workers-
// only `@cloudflare/containers` runtime imports.
export { ConclaveSandbox } from "./container.js";
export type { Env } from "./env.js";

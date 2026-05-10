/**
 * v0.16.11 — Sprint D: /admin/learning-stats endpoint.
 *
 * Aggregates current state of the self-evolve substrate into a single
 * JSON snapshot operators (or an eventual dashboard) can poll. Pure
 * read-only queries on D1; no LLM, no writes. Cheap to call frequently.
 *
 * Auth: INTERNAL_CALLBACK_TOKEN (mirrors /admin/refresh-references etc).
 *
 * Returns:
 *   - feedback: by status, top categories, recent activity (last 7d)
 *   - promoted_seeds: by domain, total source feedback rows that
 *     contributed, recent activity
 *   - external_references: by domain, source breakdown
 *
 * Pairs with the CLI's metrics.rag in `conclave review --json`. Together
 * they answer "is the substrate working" — counts on the worker side
 * + per-review injection counts on the CLI side.
 */
import { Hono } from "hono";
import type { Env } from "../env.js";

interface CountByKey {
  key: string;
  count: number;
}

interface LearningStats {
  generated_at: string;
  feedback: {
    total: number;
    by_status: CountByKey[];
    by_category: CountByKey[];
    recent_7d: number;
  };
  promoted_seeds: {
    total: number;
    by_domain: CountByKey[];
    by_category: CountByKey[];
    total_source_rows: number;
    recent_7d: number;
  };
  external_references: {
    total: number;
    by_domain: CountByKey[];
    by_source: CountByKey[];
  };
}

export function createLearningStatsRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/admin/learning-stats", async (c) => {
    const expected = c.env.INTERNAL_CALLBACK_TOKEN;
    if (!expected) return c.json({ error: "admin_disabled" }, 503);
    const auth = c.req.header("authorization") ?? c.req.header("Authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m || m[1] !== expected) return c.json({ error: "unauthorized" }, 401);

    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      fbTotal,
      fbByStatus,
      fbByCategory,
      fbRecent,
      psTotal,
      psByDomain,
      psByCategory,
      psSourceSum,
      psRecent,
      erTotal,
      erByDomain,
      erBySource,
    ] = await Promise.all([
      c.env.DB.prepare(`SELECT COUNT(*) as n FROM user_feedback WHERE removed_at IS NULL`)
        .first<{ n: number }>(),
      c.env.DB.prepare(
        `SELECT status as key, COUNT(*) as count FROM user_feedback WHERE removed_at IS NULL GROUP BY status ORDER BY count DESC`,
      ).all<CountByKey>(),
      c.env.DB.prepare(
        `SELECT category as key, COUNT(*) as count FROM user_feedback
          WHERE removed_at IS NULL AND status = 'classified' AND category IS NOT NULL
          GROUP BY category ORDER BY count DESC LIMIT 20`,
      ).all<CountByKey>(),
      c.env.DB.prepare(
        `SELECT COUNT(*) as n FROM user_feedback
          WHERE removed_at IS NULL AND created_at >= ?`,
      )
        .bind(cutoff7d)
        .first<{ n: number }>(),
      c.env.DB.prepare(`SELECT COUNT(*) as n FROM promoted_seeds WHERE removed_at IS NULL`)
        .first<{ n: number }>(),
      c.env.DB.prepare(
        `SELECT domain as key, COUNT(*) as count FROM promoted_seeds WHERE removed_at IS NULL GROUP BY domain ORDER BY count DESC`,
      ).all<CountByKey>(),
      c.env.DB.prepare(
        `SELECT category as key, COUNT(*) as count FROM promoted_seeds WHERE removed_at IS NULL GROUP BY category ORDER BY count DESC`,
      ).all<CountByKey>(),
      c.env.DB.prepare(
        `SELECT COALESCE(SUM(source_count), 0) as n FROM promoted_seeds WHERE removed_at IS NULL`,
      ).first<{ n: number }>(),
      c.env.DB.prepare(
        `SELECT COUNT(*) as n FROM promoted_seeds WHERE removed_at IS NULL AND promoted_at >= ?`,
      )
        .bind(cutoff7d)
        .first<{ n: number }>(),
      c.env.DB.prepare(
        `SELECT COUNT(*) as n FROM external_references WHERE removed_at IS NULL AND expires_at > ?`,
      )
        .bind(new Date().toISOString())
        .first<{ n: number }>(),
      c.env.DB.prepare(
        `SELECT domain as key, COUNT(*) as count FROM external_references
          WHERE removed_at IS NULL AND expires_at > ?
          GROUP BY domain ORDER BY count DESC`,
      )
        .bind(new Date().toISOString())
        .all<CountByKey>(),
      c.env.DB.prepare(
        `SELECT source_id as key, COUNT(*) as count FROM external_references
          WHERE removed_at IS NULL AND expires_at > ?
          GROUP BY source_id ORDER BY count DESC`,
      )
        .bind(new Date().toISOString())
        .all<CountByKey>(),
    ]);

    const stats: LearningStats = {
      generated_at: new Date().toISOString(),
      feedback: {
        total: fbTotal?.n ?? 0,
        by_status: fbByStatus.results ?? [],
        by_category: fbByCategory.results ?? [],
        recent_7d: fbRecent?.n ?? 0,
      },
      promoted_seeds: {
        total: psTotal?.n ?? 0,
        by_domain: psByDomain.results ?? [],
        by_category: psByCategory.results ?? [],
        total_source_rows: psSourceSum?.n ?? 0,
        recent_7d: psRecent?.n ?? 0,
      },
      external_references: {
        total: erTotal?.n ?? 0,
        by_domain: erByDomain.results ?? [],
        by_source: erBySource.results ?? [],
      },
    };

    return c.json(stats);
  });

  return app;
}

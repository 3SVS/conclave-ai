/**
 * workspace-experiment.ts — Stage 72
 *
 * Persisted Manual Multi-Agent Experiments. Saves an experiment plan and tracks
 * each candidate's manually-linked PR number / review run / benchmark. No agent
 * execution. Ownership enforced server-side; linked review runs and benchmarks
 * must belong to the same project AND userKey.
 *
 * POST   /workspace/projects/:id/agent-experiments
 * GET    /workspace/projects/:id/agent-experiments
 * GET    /workspace/projects/:id/agent-experiments/:experimentId
 * PATCH  /workspace/projects/:id/agent-experiments/:experimentId/candidates/:candidateId
 */
import { Hono } from "hono";
import type { Env } from "../env.js";
import { getReviewRunById } from "../workspace/pr-review-db.js";
import { getAgentBenchmarkById, insertAgentBenchmark } from "../workspace/agent-benchmark-db.js";
import {
  buildBenchmarkResult,
  computeAcceptanceSetAlignment,
} from "../workspace/agent-benchmark.js";
import type {
  AgentCandidate,
  CandidateMode,
  CandidateSource,
  ReviewSummaryCounts,
  ReviewItemInput,
} from "../workspace/agent-benchmark.js";
import {
  insertExperiment,
  listExperiments,
  getExperimentById,
  listExperimentCandidates,
  getCandidateById,
  updateCandidateLink,
  updateExperimentStatus,
} from "../workspace/agent-experiment-db.js";

/** Parse a review run's stored summary counts. */
function parseSummaryCounts(resultJson: string | undefined): ReviewSummaryCounts {
  if (!resultJson) return {};
  try {
    return (JSON.parse(resultJson) as { summary?: ReviewSummaryCounts }).summary ?? {};
  } catch {
    return {};
  }
}

/** Parse a review run's stored per-item results. */
function parseResultItems(resultJson: string | undefined): ReviewItemInput[] {
  if (!resultJson) return [];
  try {
    const parsed = JSON.parse(resultJson) as { results?: unknown };
    return Array.isArray(parsed.results) ? (parsed.results as ReviewItemInput[]) : [];
  } catch {
    return [];
  }
}

const TEMPLATE_IDS = ["single_agent_baseline", "multi_agent_split", "builder_reviewer"];
const MODES = ["single_agent", "multi_agent", "reviewer_agent", "hybrid"];
const ROLES = ["builder", "reviewer", "fixer", "integrator"];
const AGENTS = ["claude_code", "codex", "cursor", "manual", "other"];

type CandidateInput = {
  id?: unknown;
  label?: unknown;
  mode?: unknown;
  role?: unknown;
  suggestedAgent?: unknown;
};

/** Candidate status from its current links (no separate automation). */
function candidateStatus(links: { pullRequestNumber?: number; reviewRunId?: string; benchmarkId?: string }): string {
  if (links.benchmarkId) return "benchmarked";
  if (links.reviewRunId) return "reviewed";
  if (typeof links.pullRequestNumber === "number") return "pr_linked";
  return "planned";
}

export function createWorkspaceExperimentRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // ── POST create ────────────────────────────────────────────────────────────
  app.post("/workspace/projects/:id/agent-experiments", async (c) => {
    const projectId = c.req.param("id");

    let body: { userKey?: string; title?: string; templateId?: string; candidates?: CandidateInput[]; plan?: { candidates?: CandidateInput[] } };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "invalid_json" }, 400);
    }

    const userKey = typeof body.userKey === "string" ? body.userKey : "";
    if (!userKey) return c.json({ ok: false, error: "userKey_required" }, 400);

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return c.json({ ok: false, error: "title_required" }, 400);

    const templateId = typeof body.templateId === "string" ? body.templateId : "";
    if (!TEMPLATE_IDS.includes(templateId)) return c.json({ ok: false, error: "invalid_template" }, 400);

    const rawCandidates = Array.isArray(body.candidates)
      ? body.candidates
      : Array.isArray(body.plan?.candidates)
        ? body.plan.candidates
        : [];
    if (rawCandidates.length < 1 || rawCandidates.length > 8) {
      return c.json({ ok: false, error: "candidate_count_invalid" }, 400);
    }

    const candidates: Array<{ candidateId: string; label: string; mode: string; role: string; suggestedAgent: string }> = [];
    const seen = new Set<string>();
    for (const rc of rawCandidates) {
      const candidateId = typeof rc.id === "string" ? rc.id : "";
      const label = typeof rc.label === "string" ? rc.label.trim() : "";
      const mode = typeof rc.mode === "string" ? rc.mode : "";
      const role = typeof rc.role === "string" ? rc.role : "";
      const suggestedAgent = typeof rc.suggestedAgent === "string" ? rc.suggestedAgent : "";
      if (!candidateId || !label) return c.json({ ok: false, error: "invalid_candidate" }, 400);
      if (!MODES.includes(mode) || !ROLES.includes(role) || !AGENTS.includes(suggestedAgent)) {
        return c.json({ ok: false, error: "invalid_candidate" }, 400);
      }
      if (seen.has(candidateId)) return c.json({ ok: false, error: "duplicate_candidate_ids" }, 400);
      seen.add(candidateId);
      candidates.push({ candidateId, label, mode, role, suggestedAgent });
    }

    try {
      const planJson = JSON.stringify({ templateId, candidates });
      const saved = await insertExperiment(c.env, { projectId, userKey, title, templateId, planJson, candidates });
      return c.json(
        {
          ok: true,
          experiment: {
            id: saved.experiment.id,
            projectId,
            title: saved.experiment.title,
            templateId: saved.experiment.templateId,
            status: saved.experiment.status,
            createdAt: saved.experiment.createdAt,
            candidates: saved.candidates,
          },
        },
        201,
      );
    } catch (err) {
      console.error("[workspace/agent-experiments POST] save failed:", err);
      return c.json({ ok: false, error: "save_failed" }, 500);
    }
  });

  // ── GET list ───────────────────────────────────────────────────────────────
  app.get("/workspace/projects/:id/agent-experiments", async (c) => {
    const projectId = c.req.param("id");
    const userKey = c.req.query("userKey") ?? "";
    if (!userKey) return c.json({ ok: false, error: "userKey_required" }, 400);
    try {
      const experiments = await listExperiments(c.env, projectId, { limit: 50 });
      return c.json({ ok: true, experiments });
    } catch (err) {
      console.error("[workspace/agent-experiments GET] failed:", err);
      return c.json({ ok: false, error: "query_failed" }, 500);
    }
  });

  // ── GET detail ─────────────────────────────────────────────────────────────
  app.get("/workspace/projects/:id/agent-experiments/:experimentId", async (c) => {
    const projectId = c.req.param("id");
    const experimentId = c.req.param("experimentId");
    const userKey = c.req.query("userKey") ?? "";
    if (!userKey) return c.json({ ok: false, error: "userKey_required" }, 400);
    try {
      const exp = await getExperimentById(c.env, experimentId);
      if (!exp || exp.projectId !== projectId) return c.json({ ok: false, error: "not_found" }, 404);
      if (exp.userKey !== userKey) return c.json({ ok: false, error: "forbidden" }, 403);
      const candidates = await listExperimentCandidates(c.env, experimentId);
      return c.json({
        ok: true,
        experiment: {
          id: exp.id,
          projectId: exp.projectId,
          title: exp.title,
          templateId: exp.templateId,
          status: exp.status,
          createdAt: exp.createdAt,
          candidates,
        },
      });
    } catch (err) {
      console.error("[workspace/agent-experiments detail GET] failed:", err);
      return c.json({ ok: false, error: "query_failed" }, 500);
    }
  });

  // ── PATCH candidate link ─────────────────────────────────────────────────────
  app.patch("/workspace/projects/:id/agent-experiments/:experimentId/candidates/:candidateId", async (c) => {
    const projectId = c.req.param("id");
    const experimentId = c.req.param("experimentId");
    const candidateRowId = c.req.param("candidateId");

    let b: { userKey?: string; pullRequestNumber?: unknown; reviewRunId?: unknown; benchmarkId?: unknown };
    try {
      b = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "invalid_json" }, 400);
    }
    const userKey = typeof b.userKey === "string" ? b.userKey : "";
    if (!userKey) return c.json({ ok: false, error: "userKey_required" }, 400);

    try {
      const exp = await getExperimentById(c.env, experimentId);
      if (!exp || exp.projectId !== projectId) return c.json({ ok: false, error: "not_found" }, 404);
      if (exp.userKey !== userKey) return c.json({ ok: false, error: "forbidden" }, 403);

      const cand = await getCandidateById(c.env, candidateRowId);
      if (!cand || cand.experimentId !== experimentId) return c.json({ ok: false, error: "candidate_not_found" }, 404);

      // Merge: a provided value overrides; absent keeps existing.
      let pullRequestNumber = cand.pullRequestNumber;
      if (b.pullRequestNumber !== undefined && b.pullRequestNumber !== null) {
        if (typeof b.pullRequestNumber !== "number" || !Number.isInteger(b.pullRequestNumber) || b.pullRequestNumber < 1) {
          return c.json({ ok: false, error: "invalid_pr_number" }, 400);
        }
        pullRequestNumber = b.pullRequestNumber;
      }

      let reviewRunId = cand.reviewRunId;
      if (typeof b.reviewRunId === "string" && b.reviewRunId) {
        const run = await getReviewRunById(c.env, b.reviewRunId).catch(() => null);
        if (!run) return c.json({ ok: false, error: "review_run_not_found" }, 400);
        if (run.projectId !== projectId || run.userKey !== userKey) {
          return c.json({ ok: false, error: "review_run_mismatch" }, 400);
        }
        reviewRunId = b.reviewRunId;
      }

      let benchmarkId = cand.benchmarkId;
      if (typeof b.benchmarkId === "string" && b.benchmarkId) {
        const bench = await getAgentBenchmarkById(c.env, b.benchmarkId).catch(() => null);
        if (!bench) return c.json({ ok: false, error: "benchmark_not_found" }, 400);
        if (bench.projectId !== projectId || bench.userKey !== userKey) {
          return c.json({ ok: false, error: "benchmark_mismatch" }, 400);
        }
        benchmarkId = b.benchmarkId;
      }

      const status = candidateStatus({ pullRequestNumber, reviewRunId, benchmarkId });
      await updateCandidateLink(c.env, candidateRowId, { pullRequestNumber, reviewRunId, benchmarkId, status });

      return c.json({
        ok: true,
        candidate: { ...cand, pullRequestNumber, reviewRunId, benchmarkId, status },
      });
    } catch (err) {
      console.error("[workspace/agent-experiments PATCH candidate] failed:", err);
      return c.json({ ok: false, error: "update_failed" }, 500);
    }
  });

  // ── POST create benchmark from experiment (Stage 73 handoff) ─────────────────
  // Reuses the Stage 65 benchmark calculation; does not duplicate it.
  app.post("/workspace/projects/:id/agent-experiments/:experimentId/benchmark", async (c) => {
    const projectId = c.req.param("id");
    const experimentId = c.req.param("experimentId");

    let b: { userKey?: string };
    try {
      b = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "invalid_json" }, 400);
    }
    const userKey = typeof b.userKey === "string" ? b.userKey : "";
    if (!userKey) return c.json({ ok: false, error: "userKey_required" }, 400);

    try {
      const exp = await getExperimentById(c.env, experimentId);
      if (!exp || exp.projectId !== projectId) return c.json({ ok: false, error: "not_found" }, 404);
      if (exp.userKey !== userKey) return c.json({ ok: false, error: "forbidden" }, 403);

      const allCandidates = await listExperimentCandidates(c.env, experimentId);
      const linked = allCandidates.filter((cc) => cc.reviewRunId);
      if (linked.length < 2) return c.json({ ok: false, error: "not_enough_linked_runs" }, 400);

      const candidates: AgentCandidate[] = [];
      const countsByCandidate: Record<string, ReviewSummaryCounts> = {};
      const itemResultsByCandidate: Record<string, ReviewItemInput[]> = {};
      const selectedItemIdsByCandidate: Record<string, string[]> = {};

      for (const cc of linked) {
        const run = await getReviewRunById(c.env, cc.reviewRunId!).catch(() => null);
        if (!run) return c.json({ ok: false, error: "review_run_not_found" }, 400);
        if (run.projectId !== projectId || run.userKey !== userKey) {
          return c.json({ ok: false, error: "review_run_mismatch" }, 400);
        }
        candidates.push({
          id: cc.candidateId,
          label: cc.label,
          mode: cc.mode as CandidateMode,
          source: cc.suggestedAgent as CandidateSource,
          reviewRunId: cc.reviewRunId,
          pullRequestNumber: cc.pullRequestNumber ?? run.prNumber,
        });
        countsByCandidate[cc.candidateId] = parseSummaryCounts(run.resultJson);
        selectedItemIdsByCandidate[cc.candidateId] = run.selectedItemIds;
        itemResultsByCandidate[cc.candidateId] = parseResultItems(run.resultJson);
      }

      const result = buildBenchmarkResult({ projectId, candidates, countsByCandidate, itemResultsByCandidate });
      result.acceptanceSetAlignment = computeAcceptanceSetAlignment(candidates, selectedItemIdsByCandidate);
      const winnerCandidateId = result.recommendation?.winnerCandidateId;
      const noClearWinner = result.recommendation !== undefined && result.recommendation.winnerCandidateId === undefined;

      const saved = await insertAgentBenchmark(c.env, {
        projectId,
        userKey,
        title: `${exp.title} — benchmark`,
        candidateCount: candidates.length,
        winnerCandidateId,
        noClearWinner,
        resultJson: JSON.stringify(result),
        sourceExperimentId: experimentId,
      });

      for (const cc of linked) {
        await updateCandidateLink(c.env, cc.id, {
          pullRequestNumber: cc.pullRequestNumber,
          reviewRunId: cc.reviewRunId,
          benchmarkId: saved.id,
          status: "benchmarked",
        });
      }
      await updateExperimentStatus(c.env, experimentId, "benchmarked");

      const candidatesAfter = await listExperimentCandidates(c.env, experimentId);
      return c.json(
        {
          ok: true,
          benchmark: {
            id: saved.id,
            projectId,
            title: saved.title,
            candidateCount: saved.candidateCount,
            winnerCandidateId,
            noClearWinner,
            sourceExperimentId: experimentId,
            result,
          },
          experiment: {
            id: exp.id,
            projectId,
            title: exp.title,
            templateId: exp.templateId,
            status: "benchmarked",
            createdAt: exp.createdAt,
            candidates: candidatesAfter,
          },
        },
        201,
      );
    } catch (err) {
      console.error("[workspace/agent-experiments benchmark POST] failed:", err);
      return c.json({ ok: false, error: "benchmark_from_experiment_failed" }, 500);
    }
  });

  return app;
}

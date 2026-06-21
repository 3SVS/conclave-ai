/**
 * workspace-evolution-action-pack.test.mjs — Stage 77
 *
 * Persisted Evolution Action Pack endpoints: server-side canonical pack build,
 * ownership validation, list, detail, and no-token-leakage in pack_json/text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { createApp } = await import("../dist/router.js");

const USER = "uk_owner";
const PROJECT = "proj_exp";

function makeRun(id, { projectId = PROJECT, userKey = USER, summary = {}, results = [] } = {}) {
  return {
    id,
    project_id: projectId,
    user_key: userKey,
    repo_full_name: "owner/repo",
    pr_number: 1,
    linked_pr_id: null,
    selected_item_ids_json: '["i1"]',
    status: "failed",
    result_json: JSON.stringify({ results, summary }),
    error_message: null,
    rerun_of_review_run_id: null,
    created_at: "2026-06-20T00:00:00Z",
    updated_at: "2026-06-20T00:00:00Z",
  };
}

function makeDb({
  runs = new Map(),
  benchmarks = [],
  experiments = [],
  candidates = [],
  actionPacks = [],
} = {}) {
  return {
    _actionPacks: actionPacks,
    prepare(sql) {
      function handler(args) {
        return {
          async run() {
            if (sql.includes("INSERT INTO workspace_agent_experiments")) {
              const [id, project_id, user_key, title, template_id, plan_json, created_at, updated_at] = args;
              experiments.push({ id, project_id, user_key, title, template_id, status: "draft", plan_json, created_at, updated_at });
              return { meta: { changes: 1 } };
            }
            if (sql.includes("INSERT INTO workspace_agent_experiment_candidates")) {
              const [id, experiment_id, candidate_id, label, mode, role, suggested_agent, created_at, updated_at] = args;
              candidates.push({ id, experiment_id, candidate_id, label, mode, role, suggested_agent, status: "planned",
                pull_request_number: null, review_run_id: null, benchmark_id: null, created_at, updated_at });
              return { meta: { changes: 1 } };
            }
            if (sql.includes("INSERT INTO workspace_agent_benchmarks")) {
              const [id, project_id, user_key, title, , , candidate_count, winner_candidate_id, no_clear_winner, result_json, source_experiment_id] = args;
              benchmarks.push({ id, project_id, user_key, title, candidate_count, winner_candidate_id, no_clear_winner, result_json, source_experiment_id });
              return { meta: { changes: 1 } };
            }
            if (sql.includes("INSERT INTO workspace_evolution_action_packs")) {
              const [id, project_id, user_key, experiment_id, benchmark_id, selected_candidate_id, recommended_action, title, pack_json, created_at, updated_at] = args;
              actionPacks.push({ id, project_id, user_key, experiment_id, benchmark_id, selected_candidate_id, recommended_action, title, pack_json, created_at, updated_at });
              return { meta: { changes: 1 } };
            }
            if (sql.includes("UPDATE workspace_agent_experiments") && sql.includes("SET decision_status")) {
              const [decision_status, selected_candidate_id, decision_note, status, decided_at, , id] = args;
              const exp = experiments.find((e) => e.id === id);
              if (exp) { exp.decision_status = decision_status; exp.selected_candidate_id = selected_candidate_id; exp.decision_note = decision_note; exp.status = status; exp.decided_at = decided_at; }
              return { meta: { changes: 1 } };
            }
            if (sql.includes("UPDATE workspace_agent_experiments")) {
              const [status, now, id] = args;
              const exp = experiments.find((e) => e.id === id);
              if (exp) { exp.status = status; exp.updated_at = now; }
              return { meta: { changes: 1 } };
            }
            if (sql.includes("UPDATE workspace_agent_experiment_candidates")) {
              const [pr, runId, benchId, status, now, id] = args;
              const cand = candidates.find((c) => c.id === id);
              if (cand) { cand.pull_request_number = pr; cand.review_run_id = runId; cand.benchmark_id = benchId; cand.status = status; cand.updated_at = now; }
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          },
          async first() {
            if (sql.includes("FROM workspace_agent_experiments") && sql.includes("WHERE id = ?")) {
              return experiments.find((e) => e.id === args[0]) ?? null;
            }
            if (sql.includes("FROM workspace_agent_experiment_candidates") && sql.includes("WHERE id = ?")) {
              return candidates.find((c) => c.id === args[0]) ?? null;
            }
            if (sql.includes("FROM workspace_pr_review_runs") && sql.includes("WHERE id = ?")) {
              return runs.get(args[0]) ?? null;
            }
            if (sql.includes("FROM workspace_agent_benchmarks") && sql.includes("WHERE id = ?")) {
              return benchmarks.find((b) => b.id === args[0]) ?? null;
            }
            if (sql.includes("FROM workspace_evolution_action_packs") && sql.includes("WHERE id = ?")) {
              return actionPacks.find((p) => p.id === args[0]) ?? null;
            }
            return null;
          },
          async all() {
            if (sql.includes("FROM workspace_agent_experiment_candidates") && sql.includes("WHERE experiment_id = ?")) {
              return { results: candidates.filter((c) => c.experiment_id === args[0]) };
            }
            if (sql.includes("FROM workspace_evolution_action_packs") && sql.includes("WHERE project_id = ?") && sql.includes("AND experiment_id = ?")) {
              const results = actionPacks
                .filter((p) => p.project_id === args[0] && p.experiment_id === args[1])
                .map((p) => ({
                  id: p.id,
                  experiment_id: p.experiment_id,
                  recommended_action: p.recommended_action,
                  title: p.title,
                  created_at: p.created_at,
                }));
              return { results };
            }
            return { results: [] };
          },
        };
      }
      return {
        bind: (...a) => handler(a),
        run: () => handler([]).run(),
        first: () => handler([]).first(),
        all: () => handler([]).all(),
      };
    },
  };
}

function makeEnv(opts = {}) {
  const db = makeDb(opts);
  return { ENVIRONMENT: "test", DB: db, _db: db };
}

async function req(env, method, path, body) {
  const app = createApp();
  const init = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init), env);
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

async function createExp(env) {
  const created = await req(env, "POST", `/workspace/projects/${PROJECT}/agent-experiments`, {
    userKey: USER,
    title: "Exp",
    templateId: "multi_agent_split",
    candidates: [
      { id: "a", label: "Builder A", mode: "multi_agent", role: "builder", suggestedAgent: "claude_code" },
      { id: "b", label: "Builder B", mode: "multi_agent", role: "builder", suggestedAgent: "codex" },
    ],
  });
  return { eid: created.json.experiment.id, cands: created.json.experiment.candidates };
}

async function link(env, eid, candRowId, runId) {
  return req(env, "PATCH", `/workspace/projects/${PROJECT}/agent-experiments/${eid}/candidates/${candRowId}`, {
    userKey: USER, reviewRunId: runId,
  });
}

const path = (eid, suffix = "") =>
  `/workspace/projects/${PROJECT}/agent-experiments/${eid}/evolution-action-packs${suffix}`;

// ─── POST create ──────────────────────────────────────────────────────────────

test("POST action-pack: no benchmark → create_benchmark pack saved", async () => {
  const env = makeEnv();
  const { eid } = await createExp(env);
  const res = await req(env, "POST", path(eid), { userKey: USER });
  assert.equal(res.status, 201);
  assert.equal(res.json.ok, true);
  assert.equal(res.json.actionPack.recommendedAction, "create_benchmark");
  assert.equal(res.json.actionPack.pack.experimentId, eid);
  assert.equal(res.json.actionPack.pack.focusItemIds.length, 0);
  assert.equal(res.json.actionPack.pack.sections.length, 4);
  // copy text deterministic
  assert.match(res.json.actionPack.text, /^# Conclave Evolution Action Pack/);
});

test("POST action-pack: with benchmark + selected → fix_selected/accept pack saved", async () => {
  const runs = new Map([
    ["wprr_1", makeRun("wprr_1", { summary: { passed: 5, failed: 2 }, results: [{ itemId: "i1", title: "X", status: "failed" }] })],
    ["wprr_2", makeRun("wprr_2", { summary: { passed: 8 }, results: [{ itemId: "i1", title: "X", status: "passed" }] })],
  ]);
  const env = makeEnv({ runs });
  const { eid, cands } = await createExp(env);
  await link(env, eid, cands[0].id, "wprr_1");
  await link(env, eid, cands[1].id, "wprr_2");
  await req(env, "POST", `/workspace/projects/${PROJECT}/agent-experiments/${eid}/benchmark`, { userKey: USER });
  await req(env, "POST", `/workspace/projects/${PROJECT}/agent-experiments/${eid}/decision`, {
    userKey: USER, selectedCandidateId: "b", decisionStatus: "selected",
    candidateOutcomes: [{ candidateId: "b", outcome: "selected" }],
  });

  const res = await req(env, "POST", path(eid), { userKey: USER });
  assert.equal(res.status, 201);
  // Strong outcome (8/8 pass, no critical) → accept.
  assert.equal(res.json.actionPack.recommendedAction, "accept");
  assert.equal(res.json.actionPack.pack.targetCandidateId, "b");
});

test("POST action-pack: missing userKey → 400", async () => {
  const env = makeEnv();
  const { eid } = await createExp(env);
  const res = await req(env, "POST", path(eid), {});
  assert.equal(res.status, 400);
  assert.equal(res.json.error, "userKey_required");
});

test("POST action-pack: unknown experiment → 404", async () => {
  const env = makeEnv();
  const res = await req(env, "POST", path("nope_xyz"), { userKey: USER });
  assert.equal(res.status, 404);
});

test("POST action-pack: other user → 403", async () => {
  const env = makeEnv();
  const { eid } = await createExp(env);
  const res = await req(env, "POST", path(eid), { userKey: "uk_intruder" });
  assert.equal(res.status, 403);
});

test("POST action-pack: no token/userKey leakage in pack_json/text", async () => {
  const env = makeEnv();
  const { eid } = await createExp(env);
  await req(env, "POST", path(eid), { userKey: USER });
  const saved = env._db._actionPacks[0];
  assert.ok(saved, "expected one saved action pack");
  assert.ok(!saved.pack_json.includes(USER), "pack_json must not contain userKey");
  assert.ok(!saved.pack_json.toLowerCase().includes("userkey"), "pack_json must not mention userKey");
  assert.ok(!saved.pack_json.toLowerCase().includes("token"), "pack_json must not mention token");
});

// ─── GET list ────────────────────────────────────────────────────────────────

test("GET action-pack list: empty initially → 200 with []", async () => {
  const env = makeEnv();
  const { eid } = await createExp(env);
  const res = await req(env, "GET", `${path(eid)}?userKey=${USER}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.actionPacks, []);
});

test("GET action-pack list: returns lightweight items", async () => {
  const env = makeEnv();
  const { eid } = await createExp(env);
  await req(env, "POST", path(eid), { userKey: USER });
  await req(env, "POST", path(eid), { userKey: USER });
  const res = await req(env, "GET", `${path(eid)}?userKey=${USER}`);
  assert.equal(res.status, 200);
  assert.equal(res.json.actionPacks.length, 2);
  for (const item of res.json.actionPacks) {
    assert.ok(item.id && item.recommendedAction && item.title && item.createdAt);
    assert.equal(item.experimentId, eid);
    // List view must not include pack body.
    assert.equal(item.pack, undefined);
  }
});

test("GET action-pack list: missing userKey → 400, other user → 403", async () => {
  const env = makeEnv();
  const { eid } = await createExp(env);
  const a = await req(env, "GET", path(eid));
  assert.equal(a.status, 400);
  const b = await req(env, "GET", `${path(eid)}?userKey=uk_other`);
  assert.equal(b.status, 403);
});

// ─── GET detail ──────────────────────────────────────────────────────────────

test("GET action-pack detail: returns full pack + text", async () => {
  const env = makeEnv();
  const { eid } = await createExp(env);
  const created = await req(env, "POST", path(eid), { userKey: USER });
  const apId = created.json.actionPack.id;

  const res = await req(env, "GET", `${path(eid)}/${apId}?userKey=${USER}`);
  assert.equal(res.status, 200);
  assert.equal(res.json.actionPack.id, apId);
  assert.ok(res.json.actionPack.pack);
  assert.equal(res.json.actionPack.pack.recommendedAction, "create_benchmark");
  assert.match(res.json.actionPack.text, /^# Conclave Evolution Action Pack/);
});

test("GET action-pack detail: pack id from another experiment → 404", async () => {
  const env = makeEnv();
  const { eid: eidA } = await createExp(env);
  const { eid: eidB } = await createExp(env);
  const created = await req(env, "POST", path(eidA), { userKey: USER });
  const apId = created.json.actionPack.id;
  // Trying to fetch eidA's pack under eidB's path → not_found.
  const res = await req(env, "GET", `${path(eidB)}/${apId}?userKey=${USER}`);
  assert.equal(res.status, 404);
});

test("GET action-pack detail: other user → 403", async () => {
  const env = makeEnv();
  const { eid } = await createExp(env);
  const created = await req(env, "POST", path(eid), { userKey: USER });
  const apId = created.json.actionPack.id;
  const res = await req(env, "GET", `${path(eid)}/${apId}?userKey=uk_intruder`);
  assert.equal(res.status, 403);
});

test("GET action-pack detail: missing userKey → 400", async () => {
  const env = makeEnv();
  const { eid } = await createExp(env);
  const created = await req(env, "POST", path(eid), { userKey: USER });
  const apId = created.json.actionPack.id;
  const res = await req(env, "GET", `${path(eid)}/${apId}`);
  assert.equal(res.status, 400);
});

test("GET action-pack detail: unknown pack id → 404", async () => {
  const env = makeEnv();
  const { eid } = await createExp(env);
  const res = await req(env, "GET", `${path(eid)}/weap_missing?userKey=${USER}`);
  assert.equal(res.status, 404);
});

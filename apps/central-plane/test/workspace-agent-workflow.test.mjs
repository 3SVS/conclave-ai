/**
 * workspace-agent-workflow.test.mjs — Stage 112
 *
 * Persisted Agent Workflow Record endpoints: create + validation, list summary,
 * detail with full JSON snapshots, missing-field 400s, invalid status 400, and
 * rawInputExcerpt length limiting. Mock D1 — no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { createApp } = await import("../dist/router.js");

function makeDb({ records = [] } = {}) {
  return {
    _records: records,
    prepare(sql) {
      function handler(args) {
        return {
          async run() {
            if (sql.includes("INSERT INTO workspace_agent_workflow_records")) {
              const [
                id, project_id, intake_type, title, source_summary, raw_input_excerpt,
                acceptance_map_json, stage_plan_json, agent_run_plan_json, evidence_plan_json,
                status, created_at, updated_at,
              ] = args;
              records.push({
                id, project_id, intake_type, title, source_summary, raw_input_excerpt,
                acceptance_map_json, stage_plan_json, agent_run_plan_json, evidence_plan_json,
                status, created_at, updated_at,
              });
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          },
          async first() {
            if (sql.includes("FROM workspace_agent_workflow_records") && sql.includes("WHERE id = ?")) {
              return records.find((r) => r.id === args[0]) ?? null;
            }
            return null;
          },
          async all() {
            if (sql.includes("FROM workspace_agent_workflow_records")) {
              let rows = records;
              if (sql.includes("WHERE project_id = ?")) {
                rows = records.filter((r) => r.project_id === args[0]);
              }
              const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
              return { results: sorted };
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
  return { ENVIRONMENT: "test", DB: makeDb(opts) };
}

async function req(env, method, path, body) {
  const app = createApp();
  const init = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init), env);
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, json };
}

const validBody = (over = {}) => ({
  projectId: "proj_1",
  intakeType: "github_repo",
  title: "acme/web-app workflow",
  sourceSummary: "GitHub repo acme/web-app — review readiness.",
  rawInputExcerpt: "acme/web-app",
  acceptanceMap: { intakeType: "github_repo", items: [{ id: "a1", title: "x" }] },
  stagePlan: { stages: [{ number: 1, title: "Clarify" }] },
  agentRunPlan: { tasks: [{ id: "task-1", role: "reviewer" }] },
  evidencePlan: { expectations: [{ id: "ev-1" }], overallEvidenceStatus: "not_verified" },
  ...over,
});

// ─── Tests ──────────────────────────────────────────────────────────────────

test("POST create: success returns 201 with full record", async () => {
  const env = makeEnv();
  const { status, json } = await req(env, "POST", "/workspace/agent-workflows", validBody());
  assert.equal(status, 201);
  assert.equal(json.ok, true);
  assert.match(json.record.id, /^wawr_/);
  assert.equal(json.record.projectId, "proj_1");
  assert.equal(json.record.intakeType, "github_repo");
  assert.equal(json.record.status, "planned");
  // JSON snapshots round-trip back into objects.
  assert.deepEqual(json.record.acceptanceMap.items[0], { id: "a1", title: "x" });
  assert.equal(json.record.evidencePlan.overallEvidenceStatus, "not_verified");
  assert.ok(json.record.createdAt);
});

test("POST create: status defaults to planned when omitted", async () => {
  const env = makeEnv();
  const body = validBody();
  delete body.status;
  const { json } = await req(env, "POST", "/workspace/agent-workflows", body);
  assert.equal(json.record.status, "planned");
});

test("POST create: accepts allowed status values", async () => {
  for (const status of ["draft", "planned", "needs_evidence", "archived"]) {
    const env = makeEnv();
    const { status: code, json } = await req(env, "POST", "/workspace/agent-workflows", validBody({ status }));
    assert.equal(code, 201, `status ${status}`);
    assert.equal(json.record.status, status);
  }
});

test("POST create: invalid status returns 400", async () => {
  const env = makeEnv();
  const { status, json } = await req(env, "POST", "/workspace/agent-workflows", validBody({ status: "verified" }));
  assert.equal(status, 400);
  assert.equal(json.error, "invalid_status");
});

test("POST create: invalid intake type returns 400", async () => {
  const env = makeEnv();
  const { status, json } = await req(env, "POST", "/workspace/agent-workflows", validBody({ intakeType: "bogus" }));
  assert.equal(status, 400);
  assert.equal(json.error, "invalid_intake_type");
});

test("POST create: missing required fields return 400", async () => {
  const cases = [
    ["title", "title_required"],
    ["sourceSummary", "sourceSummary_required"],
    ["acceptanceMap", "acceptanceMap_required"],
    ["stagePlan", "stagePlan_required"],
    ["agentRunPlan", "agentRunPlan_required"],
    ["evidencePlan", "evidencePlan_required"],
  ];
  for (const [field, err] of cases) {
    const env = makeEnv();
    const body = validBody();
    delete body[field];
    const { status, json } = await req(env, "POST", "/workspace/agent-workflows", body);
    assert.equal(status, 400, `missing ${field}`);
    assert.equal(json.error, err, `missing ${field}`);
  }
});

test("POST create: projectId is optional (null when absent)", async () => {
  const env = makeEnv();
  const body = validBody();
  delete body.projectId;
  const { status, json } = await req(env, "POST", "/workspace/agent-workflows", body);
  assert.equal(status, 201);
  assert.equal(json.record.projectId, null);
});

test("POST create: rawInputExcerpt is trimmed to the limit", async () => {
  const env = makeEnv();
  const huge = "x".repeat(5000);
  const { json } = await req(env, "POST", "/workspace/agent-workflows", validBody({ rawInputExcerpt: huge }));
  assert.ok(json.record.rawInputExcerpt.length <= 2000);
});

test("POST create: oversized snapshot is rejected", async () => {
  const env = makeEnv();
  const big = { blob: "y".repeat(300_000) };
  const { status, json } = await req(env, "POST", "/workspace/agent-workflows", validBody({ acceptanceMap: big }));
  assert.equal(status, 400);
  assert.equal(json.error, "acceptanceMap_required");
});

test("GET list: returns record summaries (no JSON snapshots)", async () => {
  const env = makeEnv();
  await req(env, "POST", "/workspace/agent-workflows", validBody({ title: "First" }));
  await req(env, "POST", "/workspace/agent-workflows", validBody({ title: "Second" }));
  const { status, json } = await req(env, "GET", "/workspace/agent-workflows");
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.records.length, 2);
  assert.ok(json.records[0].id);
  assert.ok(json.records[0].title);
  assert.ok(json.records[0].status);
  assert.equal(json.records[0].acceptanceMap, undefined, "list must not include snapshots");
});

test("GET list: filters by projectId", async () => {
  const env = makeEnv();
  await req(env, "POST", "/workspace/agent-workflows", validBody({ projectId: "proj_a" }));
  await req(env, "POST", "/workspace/agent-workflows", validBody({ projectId: "proj_b" }));
  const { json } = await req(env, "GET", "/workspace/agent-workflows?projectId=proj_a");
  assert.equal(json.records.length, 1);
  assert.equal(json.records[0].projectId, "proj_a");
});

test("GET detail: returns full JSON snapshots", async () => {
  const env = makeEnv();
  const created = await req(env, "POST", "/workspace/agent-workflows", validBody());
  const id = created.json.record.id;
  const { status, json } = await req(env, "GET", `/workspace/agent-workflows/${id}`);
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.record.id, id);
  assert.deepEqual(json.record.stagePlan.stages[0], { number: 1, title: "Clarify" });
  assert.deepEqual(json.record.agentRunPlan.tasks[0], { id: "task-1", role: "reviewer" });
});

test("GET detail: unknown id returns 404", async () => {
  const env = makeEnv();
  const { status, json } = await req(env, "GET", "/workspace/agent-workflows/wawr_missing");
  assert.equal(status, 404);
  assert.equal(json.error, "not_found");
});

test("POST create: invalid JSON body returns 400", async () => {
  const env = makeEnv();
  const app = createApp();
  const res = await app.fetch(
    new Request("http://localhost/workspace/agent-workflows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    }),
    env,
  );
  assert.equal(res.status, 400);
});

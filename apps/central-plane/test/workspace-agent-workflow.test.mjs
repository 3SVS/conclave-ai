/**
 * workspace-agent-workflow.test.mjs — Stage 112 (+ Stage 112B tenant scoping)
 *
 * Persisted Agent Workflow Record endpoints: create + validation, list summary,
 * detail with full JSON snapshots, missing-field 400s, invalid status 400,
 * rawInputExcerpt length limiting — AND user_key tenant isolation (a record made
 * by one userKey is invisible to another). Mock D1 — no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { createApp } = await import("../dist/router.js");

const USER = "uk_owner";
const OTHER = "uk_intruder";

function makeDb({ records = [] } = {}) {
  return {
    _records: records,
    prepare(sql) {
      function handler(args) {
        return {
          async run() {
            if (sql.includes("INSERT INTO workspace_agent_workflow_records")) {
              const [
                id, user_key, project_id, intake_type, title, source_summary, raw_input_excerpt,
                acceptance_map_json, stage_plan_json, agent_run_plan_json, evidence_plan_json,
                status, created_at, updated_at,
              ] = args;
              records.push({
                id, user_key, project_id, intake_type, title, source_summary, raw_input_excerpt,
                acceptance_map_json, stage_plan_json, agent_run_plan_json, evidence_plan_json,
                status, created_at, updated_at,
              });
              return { meta: { changes: 1 } };
            }
            if (sql.includes("UPDATE workspace_agent_workflow_records SET status")) {
              const [status, updated_at, id] = args;
              const rec = records.find((r) => r.id === id);
              if (rec) {
                rec.status = status;
                rec.updated_at = updated_at;
              }
              return { meta: { changes: rec ? 1 : 0 } };
            }
            if (sql.includes("DELETE FROM workspace_agent_workflow_records")) {
              const idx = records.findIndex((r) => r.id === args[0]);
              if (idx >= 0) records.splice(idx, 1);
              return { meta: { changes: idx >= 0 ? 1 : 0 } };
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
              // Positional binds: user_key, [project_id], limit. Archived filter
              // ("status != 'archived'") is a SQL literal, not a bound param.
              let i = 0;
              let rows = records.filter((r) => r.user_key === args[i]);
              i += 1;
              if (sql.includes("project_id = ?")) {
                const pid = args[i];
                i += 1;
                rows = rows.filter((r) => r.project_id === pid);
              }
              if (sql.includes("status != 'archived'")) {
                rows = rows.filter((r) => r.status !== "archived");
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
  userKey: USER,
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

// ─── Create + validation (Stage 112) ──────────────────────────────────────────

test("POST create: success returns 201 with full record (no user_key exposed)", async () => {
  const env = makeEnv();
  const { status, json } = await req(env, "POST", "/workspace/agent-workflows", validBody());
  assert.equal(status, 201);
  assert.equal(json.ok, true);
  assert.match(json.record.id, /^wawr_/);
  assert.equal(json.record.projectId, "proj_1");
  assert.equal(json.record.intakeType, "github_repo");
  assert.equal(json.record.status, "planned");
  assert.equal(json.record.userKey, undefined, "user_key must not be exposed");
  assert.deepEqual(json.record.acceptanceMap.items[0], { id: "a1", title: "x" });
  assert.equal(json.record.evidencePlan.overallEvidenceStatus, "not_verified");
  assert.ok(json.record.createdAt);
  // Persisted under the request's user_key.
  assert.equal(env.DB._records[0].user_key, USER);
});

test("POST create: missing userKey returns 400", async () => {
  const env = makeEnv();
  const body = validBody();
  delete body.userKey;
  const { status, json } = await req(env, "POST", "/workspace/agent-workflows", body);
  assert.equal(status, 400);
  assert.equal(json.error, "userKey_required");
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

// ─── List (scoped) ─────────────────────────────────────────────────────────────

test("GET list: requires userKey", async () => {
  const env = makeEnv();
  const { status, json } = await req(env, "GET", "/workspace/agent-workflows");
  assert.equal(status, 400);
  assert.equal(json.error, "userKey_required");
});

test("GET list: returns record summaries (no JSON snapshots)", async () => {
  const env = makeEnv();
  await req(env, "POST", "/workspace/agent-workflows", validBody({ title: "First" }));
  await req(env, "POST", "/workspace/agent-workflows", validBody({ title: "Second" }));
  const { status, json } = await req(env, "GET", `/workspace/agent-workflows?userKey=${USER}`);
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.records.length, 2);
  assert.ok(json.records[0].id);
  assert.ok(json.records[0].title);
  assert.ok(json.records[0].status);
  assert.equal(json.records[0].acceptanceMap, undefined, "list must not include snapshots");
});

test("GET list: returns ONLY the current user's records", async () => {
  const env = makeEnv();
  await req(env, "POST", "/workspace/agent-workflows", validBody({ userKey: USER, title: "Mine" }));
  await req(env, "POST", "/workspace/agent-workflows", validBody({ userKey: OTHER, title: "Theirs" }));
  const mine = await req(env, "GET", `/workspace/agent-workflows?userKey=${USER}`);
  assert.equal(mine.json.records.length, 1);
  assert.equal(mine.json.records[0].title, "Mine");
  const theirs = await req(env, "GET", `/workspace/agent-workflows?userKey=${OTHER}`);
  assert.equal(theirs.json.records.length, 1);
  assert.equal(theirs.json.records[0].title, "Theirs");
});

test("GET list: projectId filter applies WITHIN the current user only", async () => {
  const env = makeEnv();
  await req(env, "POST", "/workspace/agent-workflows", validBody({ userKey: USER, projectId: "proj_a" }));
  await req(env, "POST", "/workspace/agent-workflows", validBody({ userKey: USER, projectId: "proj_b" }));
  // Another user with the same projectId must not leak in.
  await req(env, "POST", "/workspace/agent-workflows", validBody({ userKey: OTHER, projectId: "proj_a" }));
  const { json } = await req(env, "GET", `/workspace/agent-workflows?userKey=${USER}&projectId=proj_a`);
  assert.equal(json.records.length, 1);
  assert.equal(json.records[0].projectId, "proj_a");
});

// ─── Detail (own record only) ──────────────────────────────────────────────────

test("GET detail: requires userKey", async () => {
  const env = makeEnv();
  const { status, json } = await req(env, "GET", "/workspace/agent-workflows/wawr_x");
  assert.equal(status, 400);
  assert.equal(json.error, "userKey_required");
});

test("GET detail: returns own record with full JSON snapshots", async () => {
  const env = makeEnv();
  const created = await req(env, "POST", "/workspace/agent-workflows", validBody());
  const id = created.json.record.id;
  const { status, json } = await req(env, "GET", `/workspace/agent-workflows/${id}?userKey=${USER}`);
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.record.id, id);
  assert.equal(json.record.userKey, undefined, "user_key must not be exposed");
  assert.deepEqual(json.record.stagePlan.stages[0], { number: 1, title: "Clarify" });
  assert.deepEqual(json.record.agentRunPlan.tasks[0], { id: "task-1", role: "reviewer" });
});

test("GET detail: another user's record returns 404 (not 403)", async () => {
  const env = makeEnv();
  const created = await req(env, "POST", "/workspace/agent-workflows", validBody({ userKey: USER }));
  const id = created.json.record.id;
  const { status, json } = await req(env, "GET", `/workspace/agent-workflows/${id}?userKey=${OTHER}`);
  assert.equal(status, 404);
  assert.equal(json.error, "not_found");
});

test("GET detail: unknown id returns 404", async () => {
  const env = makeEnv();
  const { status, json } = await req(env, "GET", `/workspace/agent-workflows/wawr_missing?userKey=${USER}`);
  assert.equal(status, 404);
  assert.equal(json.error, "not_found");
});

// ─── Cross-tenant isolation (end to end) ───────────────────────────────────────

test("isolation: a record created by one user is invisible to another by id", async () => {
  const env = makeEnv();
  const created = await req(env, "POST", "/workspace/agent-workflows", validBody({ userKey: USER }));
  const id = created.json.record.id;
  // Intruder knows the id but cannot read it, and it never appears in their list.
  const detail = await req(env, "GET", `/workspace/agent-workflows/${id}?userKey=${OTHER}`);
  assert.equal(detail.status, 404);
  const list = await req(env, "GET", `/workspace/agent-workflows?userKey=${OTHER}`);
  assert.equal(list.json.records.length, 0);
});

// ─── Stage 118 — archive / restore / delete + includeArchived ──────────────────

async function createRecord(env, over) {
  const r = await req(env, "POST", "/workspace/agent-workflows", validBody(over));
  return r.json.record.id;
}

test("PATCH archive: own record → status archived, user_key not exposed", async () => {
  const env = makeEnv();
  const id = await createRecord(env);
  const { status, json } = await req(env, "PATCH", `/workspace/agent-workflows/${id}`, {
    userKey: USER,
    status: "archived",
  });
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.record.status, "archived");
  assert.equal(json.record.userKey, undefined);
});

test("PATCH restore: archived → planned", async () => {
  const env = makeEnv();
  const id = await createRecord(env);
  await req(env, "PATCH", `/workspace/agent-workflows/${id}`, { userKey: USER, status: "archived" });
  const { json } = await req(env, "PATCH", `/workspace/agent-workflows/${id}`, {
    userKey: USER,
    status: "planned",
  });
  assert.equal(json.record.status, "planned");
});

test("PATCH: invalid status returns 400", async () => {
  const env = makeEnv();
  const id = await createRecord(env);
  for (const bad of ["draft", "verified", "deleted", ""]) {
    const { status, json } = await req(env, "PATCH", `/workspace/agent-workflows/${id}`, {
      userKey: USER,
      status: bad,
    });
    assert.equal(status, 400, `status ${bad}`);
    assert.equal(json.error, "invalid_status");
  }
});

test("PATCH: missing userKey returns 400", async () => {
  const env = makeEnv();
  const id = await createRecord(env);
  const { status, json } = await req(env, "PATCH", `/workspace/agent-workflows/${id}`, {
    status: "archived",
  });
  assert.equal(status, 400);
  assert.equal(json.error, "userKey_required");
});

test("PATCH: cross-tenant record returns 404", async () => {
  const env = makeEnv();
  const id = await createRecord(env, { userKey: USER });
  const { status, json } = await req(env, "PATCH", `/workspace/agent-workflows/${id}`, {
    userKey: OTHER,
    status: "archived",
  });
  assert.equal(status, 404);
  assert.equal(json.error, "not_found");
});

test("DELETE: own record succeeds, repeated delete returns 404", async () => {
  const env = makeEnv();
  const id = await createRecord(env);
  const first = await req(env, "DELETE", `/workspace/agent-workflows/${id}?userKey=${USER}`);
  assert.equal(first.status, 200);
  assert.equal(first.json.deleted, true);
  const second = await req(env, "DELETE", `/workspace/agent-workflows/${id}?userKey=${USER}`);
  assert.equal(second.status, 404);
});

test("DELETE: cross-tenant record returns 404 and does not delete", async () => {
  const env = makeEnv();
  const id = await createRecord(env, { userKey: USER });
  const cross = await req(env, "DELETE", `/workspace/agent-workflows/${id}?userKey=${OTHER}`);
  assert.equal(cross.status, 404);
  // Owner can still read it.
  const detail = await req(env, "GET", `/workspace/agent-workflows/${id}?userKey=${USER}`);
  assert.equal(detail.status, 200);
});

test("DELETE: missing userKey returns 400", async () => {
  const env = makeEnv();
  const id = await createRecord(env);
  const { status, json } = await req(env, "DELETE", `/workspace/agent-workflows/${id}`);
  assert.equal(status, 400);
  assert.equal(json.error, "userKey_required");
});

test("GET list: excludes archived by default, includeArchived=true includes them", async () => {
  const env = makeEnv();
  const keep = await createRecord(env, { title: "Active" });
  const arch = await createRecord(env, { title: "ToArchive" });
  await req(env, "PATCH", `/workspace/agent-workflows/${arch}`, { userKey: USER, status: "archived" });

  const def = await req(env, "GET", `/workspace/agent-workflows?userKey=${USER}`);
  assert.equal(def.json.records.length, 1);
  assert.equal(def.json.records[0].id, keep);

  const all = await req(env, "GET", `/workspace/agent-workflows?userKey=${USER}&includeArchived=true`);
  assert.equal(all.json.records.length, 2);
});

test("GET detail: still returns an own archived record", async () => {
  const env = makeEnv();
  const id = await createRecord(env);
  await req(env, "PATCH", `/workspace/agent-workflows/${id}`, { userKey: USER, status: "archived" });
  const { status, json } = await req(env, "GET", `/workspace/agent-workflows/${id}?userKey=${USER}`);
  assert.equal(status, 200);
  assert.equal(json.record.status, "archived");
});

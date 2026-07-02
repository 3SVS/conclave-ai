/**
 * workspace-visual-checks.test.mjs — Stage 261
 *
 * Visual completion-check runs: create (report snapshot), evidence upload to
 * R2 (allowlisted names), list/detail, evidence serving. Ownership + limits.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { createApp } = await import("../dist/router.js");

const USER = "uk_owner";
const OTHER = "uk_intruder";
const PROJECT = "proj_vc";

function makeDb({ projects = new Map(), checks = [] } = {}) {
  return {
    _checks: checks,
    prepare(sql) {
      function handler(args) {
        return {
          async run() {
            if (sql.includes("INSERT INTO workspace_visual_checks")) {
              const [id, project_id, user_key, target_url, intent, decision, works, executor, report_json, agent_prompt, created_at, updated_at] = args;
              checks.push({
                id, project_id, user_key, target_url, intent, decision, works,
                status: "uploaded", executor, report_json, agent_prompt,
                evidence_keys_json: "[]", created_at, updated_at,
              });
              return { meta: { changes: 1 } };
            }
            if (sql.includes("UPDATE workspace_visual_checks SET evidence_keys_json")) {
              const [keysJson, updatedAt, id] = args;
              const row = checks.find((r) => r.id === id);
              if (row) { row.evidence_keys_json = keysJson; row.updated_at = updatedAt; }
              return { meta: { changes: row ? 1 : 0 } };
            }
            return { meta: { changes: 0 } };
          },
          async first() {
            if (sql.includes("FROM workspace_projects WHERE id = ?")) {
              return projects.get(args[0]) ?? null;
            }
            if (sql.includes("FROM workspace_visual_checks") && sql.includes("WHERE id = ?")) {
              return checks.find((r) => r.id === args[0]) ?? null;
            }
            return null;
          },
          async all() {
            if (sql.includes("FROM workspace_visual_checks") && sql.includes("WHERE project_id = ?")) {
              return { results: checks.filter((r) => r.project_id === args[0]) };
            }
            return { results: [] };
          },
        };
      }
      return {
        bind(...args) { return handler(args); },
        run() { return handler([]).run(); },
        first() { return handler([]).first(); },
        all() { return handler([]).all(); },
      };
    },
  };
}

function makeProjectRow(id, userKey) {
  return {
    id, user_key: userKey, title: "t", idea: "i",
    understood_json: "{}", product_spec_json: "{}", items_json: "[]",
    created_at: "2026-07-02T00:00:00.000Z", updated_at: "2026-07-02T00:00:00.000Z",
  };
}

function makeR2() {
  const store = new Map();
  return {
    _store: store,
    async put(key, value, opts) { store.set(key, { value, opts }); },
    async get(key) {
      const hit = store.get(key);
      return hit ? { body: hit.value } : null;
    },
    async delete(key) { store.delete(key); },
  };
}

function makeEnv({ withR2 = true } = {}) {
  const env = {
    ENVIRONMENT: "test",
    DB: makeDb({ projects: new Map([[PROJECT, makeProjectRow(PROJECT, USER)]]) }),
  };
  if (withR2) env.EVIDENCE = makeR2();
  return env;
}

const REPORT = {
  title: "Simsa 검수 리포트",
  verdict: "작동 안 해요 — 고쳐야 해요",
  works: false,
  findings: [{ severity: "high", what: "서버 주소를 찾지 못했어요", why: "w", how: "h", evidence: "net::ERR_NAME_NOT_RESOLVED" }],
  nextSteps: [], notes: [],
};

function createBody(over = {}) {
  return {
    userKey: USER,
    targetUrl: "https://golf-now.example.app/",
    intent: "골퍼가 코스 상태를 확인할 수 있어야 한다",
    decision: "Needs Fix",
    works: false,
    report: REPORT,
    agentPrompt: "당신은 이 프로젝트의 코드를 수정하는 개발 에이전트입니다...",
    ...over,
  };
}

async function req(env, method, path, body, raw) {
  const app = createApp();
  const init = { method };
  if (raw !== undefined) {
    init.body = raw;
  } else if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await app.fetch(new Request(`http://localhost${path}`, init), env);
  let json = null;
  try { json = await res.clone().json(); } catch { /* binary */ }
  return { status: res.status, json, res };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("POST create: 201 with tri-state works; report required", async () => {
  const env = makeEnv();
  const { status, json } = await req(env, "POST", `/workspace/projects/${PROJECT}/visual-checks`, createBody());
  assert.equal(status, 201);
  assert.equal(json.check.decision, "Needs Fix");
  assert.equal(json.check.works, false);
  assert.equal(json.check.status, "uploaded");
  assert.equal(json.check.executor, "local");

  const missing = await req(env, "POST", `/workspace/projects/${PROJECT}/visual-checks`, createBody({ report: undefined }));
  assert.equal(missing.status, 400);
  assert.equal(missing.json.error, "report_required");
});

test("ownership: wrong user 403; unknown project 404", async () => {
  const env = makeEnv();
  const forbidden = await req(env, "POST", `/workspace/projects/${PROJECT}/visual-checks`, createBody({ userKey: OTHER }));
  assert.equal(forbidden.status, 403);
  const missing = await req(env, "POST", `/workspace/projects/proj_nope/visual-checks`, createBody());
  assert.equal(missing.status, 404);
});

test("evidence upload: allowlisted name → R2 key + manifest; bad name rejected", async () => {
  const env = makeEnv();
  const created = await req(env, "POST", `/workspace/projects/${PROJECT}/visual-checks`, createBody());
  const runId = created.json.check.id;

  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const up = await req(env, "POST",
    `/workspace/projects/${PROJECT}/visual-checks/${runId}/evidence?userKey=${USER}&name=${encodeURIComponent("screenshots/step-00-initial.png")}`,
    undefined, png);
  assert.equal(up.status, 201);
  assert.equal(up.json.evidenceCount, 1);
  assert.ok(env.EVIDENCE._store.has(`checks/${USER}/${PROJECT}/${runId}/screenshots/step-00-initial.png`));

  const bad = await req(env, "POST",
    `/workspace/projects/${PROJECT}/visual-checks/${runId}/evidence?userKey=${USER}&name=${encodeURIComponent("../../etc/passwd")}`,
    undefined, png);
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, "invalid_evidence_name");
});

test("list + detail: report round-trip, agent prompt, evidence keys", async () => {
  const env = makeEnv();
  const created = await req(env, "POST", `/workspace/projects/${PROJECT}/visual-checks`, createBody());
  const runId = created.json.check.id;
  await req(env, "POST",
    `/workspace/projects/${PROJECT}/visual-checks/${runId}/evidence?userKey=${USER}&name=${encodeURIComponent("video/flow.webm")}`,
    undefined, new Uint8Array([1, 2, 3]));

  const list = await req(env, "GET", `/workspace/projects/${PROJECT}/visual-checks?userKey=${USER}`);
  assert.equal(list.status, 200);
  assert.equal(list.json.checks.length, 1);
  assert.equal(list.json.checks[0].evidenceCount, 1);

  const detail = await req(env, "GET", `/workspace/projects/${PROJECT}/visual-checks/${runId}?userKey=${USER}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.json.check.report, REPORT);
  assert.ok(detail.json.check.agentPrompt.includes("개발 에이전트"));
  assert.deepEqual(detail.json.check.evidenceKeys, ["video/flow.webm"]);

  // detail is owner-only
  const forbidden = await req(env, "GET", `/workspace/projects/${PROJECT}/visual-checks/${runId}?userKey=${OTHER}`);
  assert.equal(forbidden.status, 403);
});

test("evidence serving: uploaded name streams with content-type; unknown name 404", async () => {
  const env = makeEnv();
  const created = await req(env, "POST", `/workspace/projects/${PROJECT}/visual-checks`, createBody());
  const runId = created.json.check.id;
  await req(env, "POST",
    `/workspace/projects/${PROJECT}/visual-checks/${runId}/evidence?userKey=${USER}&name=${encodeURIComponent("screenshots/step-01.png")}`,
    undefined, new Uint8Array([0x89]));

  const ok = await req(env, "GET",
    `/workspace/projects/${PROJECT}/visual-checks/${runId}/evidence/screenshots/step-01.png?userKey=${USER}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.res.headers.get("content-type"), "image/png");

  const missing = await req(env, "GET",
    `/workspace/projects/${PROJECT}/visual-checks/${runId}/evidence/screenshots/step-99.png?userKey=${USER}`);
  assert.equal(missing.status, 404);
});

test("no R2 binding: evidence routes 503, create/list/detail still work", async () => {
  const env = makeEnv({ withR2: false });
  const created = await req(env, "POST", `/workspace/projects/${PROJECT}/visual-checks`, createBody());
  assert.equal(created.status, 201);
  const runId = created.json.check.id;

  const up = await req(env, "POST",
    `/workspace/projects/${PROJECT}/visual-checks/${runId}/evidence?userKey=${USER}&name=${encodeURIComponent("screenshots/a.png")}`,
    undefined, new Uint8Array([1]));
  assert.equal(up.status, 503);

  const detail = await req(env, "GET", `/workspace/projects/${PROJECT}/visual-checks/${runId}?userKey=${USER}`);
  assert.equal(detail.status, 200);
});

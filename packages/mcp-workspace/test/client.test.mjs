import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { WorkspaceClient } = await import("../dist/client.js");

function makeFetch(response) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body ?? {},
      text: async () => JSON.stringify(response.body ?? {}),
    };
  };
  return { fetchImpl, calls };
}

function makeClient(response, audit) {
  const { fetchImpl, calls } = makeFetch(response);
  const client = new WorkspaceClient({
    baseUrl: "https://api.example.com/",
    userKey: "uk_secret_123",
    fetchImpl,
    audit: audit ?? (() => {}),
  });
  return { client, calls };
}

describe("WorkspaceClient", () => {
  it("list_projects → GET /workspace/projects with userKey in query", async () => {
    const { client, calls } = makeClient({ status: 200, body: { ok: true, projects: [] } });
    const r = await client.listProjects();
    assert.equal(r.ok, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/workspace\/projects\?userKey=uk_secret_123$/);
    assert.equal(calls[0].init.method, "GET");
  });

  it("get_project returns a project owned by the configured user", async () => {
    const { client } = makeClient({ status: 200, body: { ok: true, project: { id: "p1", userKey: "uk_secret_123" } } });
    const r = await client.getProject("p1");
    assert.equal(r.ok, true);
    assert.equal(r.project.id, "p1");
  });

  it("get_project refuses a project owned by a different user (authz)", async () => {
    const { client } = makeClient({ status: 200, body: { ok: true, project: { id: "p2", userKey: "uk_someone_else" } } });
    const r = await client.getProject("p2");
    assert.equal(r.ok, false);
    assert.equal(r.error, "forbidden");
    assert.equal(r.status, 403);
  });

  it("run_pr_review POSTs userKey in the body and sets the Idempotency-Key header", async () => {
    const { client, calls } = makeClient({ status: 200, body: { ok: true, run: { id: "wprr_1" } } });
    await client.runPrReview("p1", 1, { selectedItemIds: ["a"], idempotencyKey: "idem-1" });
    const call = calls[0];
    assert.equal(call.init.method, "POST");
    assert.match(call.url, /\/workspace\/projects\/p1\/github\/pulls\/1\/review$/);
    const body = JSON.parse(call.init.body);
    assert.equal(body.userKey, "uk_secret_123");
    assert.deepEqual(body.selectedItemIds, ["a"]);
    assert.equal(body.idempotencyKey, undefined, "idempotencyKey goes to the header, not the body");
    assert.equal(call.init.headers["Idempotency-Key"], "idem-1");
  });

  it("preview_pr_comment is a POST (write tools always preview first)", async () => {
    const { client, calls } = makeClient({ status: 200, body: { ok: true, comment: { body: "..." } } });
    await client.previewPrComment("p1", 1, { includeRerunComparison: true });
    assert.match(calls[0].url, /\/comment\/preview$/);
    assert.equal(calls[0].init.method, "POST");
  });

  it("audit records metadata but never the userKey or request body", async () => {
    const entries = [];
    const { client } = makeClient({ status: 200, body: { ok: true, projects: [] } }, (e) => entries.push(e));
    await client.listProjects();
    assert.equal(entries.length, 1);
    const serialized = JSON.stringify(entries[0]);
    assert.equal(entries[0].tool, "list_projects");
    assert.equal(entries[0].ok, true);
    assert.ok(!serialized.includes("uk_secret_123"), "audit entry must not leak the userKey");
  });

  it("non-ok API responses surface ok:false with status", async () => {
    const { client } = makeClient({ status: 401, body: { ok: false, error: "not_connected" } });
    const r = await client.listPullRequests("p1");
    assert.equal(r.ok, false);
    assert.equal(r.status, 401);
    assert.equal(r.error, "not_connected");
  });
});

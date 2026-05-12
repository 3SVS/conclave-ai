/**
 * v0.14.3 — Sprint E5 council wire-in: spawned-agents resolver tests.
 *
 * The CLI fetches active (promoted + trial) spawned agents matching the
 * resolved review domain. These tests pin the fetch logic + trial-weight
 * synthesis + outcome reporting; the council wire-in itself is exercised
 * end-to-end by the integration suite.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTrialAgentWeights,
  fetchActiveSpawnedAgents,
  reportSpawnedAgentOutcomes,
  reportSpawnedAgentSmokeOutcomes,
  TRIAL_AGENT_WEIGHT,
} from "../dist/lib/spawned-agents-resolver.js";

function makeFetchStub(responses) {
  // responses keyed by `${method} ${pathAndQuery}` returning either a
  // Response or a function that builds one. Captures every call.
  const calls = [];
  return {
    calls,
    fn: async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method ?? "GET";
      const key = `${method} ${url.replace(/^https?:\/\/[^/]+/, "")}`;
      calls.push({ key, init });
      const r = responses[key] ?? responses["*"];
      if (!r) {
        return new Response(JSON.stringify({ error: "no_stub" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return typeof r === "function" ? r(init) : r;
    },
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const API_BASE = "https://example.test";

// --- fetchActiveSpawnedAgents -------------------------------------------

test("fetchActiveSpawnedAgents: no bearer token → returns [] without making any HTTP call", async () => {
  const stub = makeFetchStub({});
  const out = await fetchActiveSpawnedAgents({
    apiBase: API_BASE,
    domain: "code",
    fetchImpl: stub.fn,
  });
  assert.deepEqual(out, []);
  assert.equal(stub.calls.length, 0);
});

test("fetchActiveSpawnedAgents: domain='code' makes 2 calls (promoted + trial), 'design' agents are not included", async () => {
  const stub = makeFetchStub({
    "GET /admin/spawned-agents?status=promoted&domain=code": jsonResponse({
      count: 1,
      agents: [
        {
          id: "sa_1", agent_id: "k8s-manifest", display_name: "K8s Manifest",
          domain: "code", status: "promoted", system_prompt: "you are k8s",
        },
      ],
    }),
    "GET /admin/spawned-agents?status=trial&domain=code": jsonResponse({
      count: 1,
      agents: [
        {
          id: "sa_2", agent_id: "graphql-schema", display_name: "GraphQL Schema",
          domain: "code", status: "trial", system_prompt: "you are graphql",
        },
      ],
    }),
  });
  const out = await fetchActiveSpawnedAgents({
    bearerToken: "tok",
    apiBase: API_BASE,
    domain: "code",
    fetchImpl: stub.fn,
  });
  assert.equal(out.length, 2);
  assert.equal(out[0].agentId, "k8s-manifest");
  assert.equal(out[0].status, "promoted");
  assert.equal(out[1].agentId, "graphql-schema");
  assert.equal(out[1].status, "trial");
});

test("fetchActiveSpawnedAgents: domain='mixed' fetches both code AND design", async () => {
  const stub = makeFetchStub({
    "GET /admin/spawned-agents?status=promoted&domain=code": jsonResponse({
      count: 1,
      agents: [{ id: "sa_c", agent_id: "k8s", display_name: "K8s", domain: "code", status: "promoted", system_prompt: "x" }],
    }),
    "GET /admin/spawned-agents?status=trial&domain=code": jsonResponse({ count: 0, agents: [] }),
    "GET /admin/spawned-agents?status=promoted&domain=design": jsonResponse({ count: 0, agents: [] }),
    "GET /admin/spawned-agents?status=trial&domain=design": jsonResponse({
      count: 1,
      agents: [{ id: "sa_d", agent_id: "wcag-3", display_name: "WCAG 3.0", domain: "design", status: "trial", system_prompt: "y" }],
    }),
  });
  const out = await fetchActiveSpawnedAgents({
    bearerToken: "tok",
    apiBase: API_BASE,
    domain: "mixed",
    fetchImpl: stub.fn,
  });
  assert.equal(out.length, 2);
  assert.equal(out.find((a) => a.agentId === "k8s")?.domain, "code");
  assert.equal(out.find((a) => a.agentId === "wcag-3")?.domain, "design");
});

test("fetchActiveSpawnedAgents: 404/error response → silently skipped, returns partial result", async () => {
  const stub = makeFetchStub({
    "GET /admin/spawned-agents?status=promoted&domain=code": jsonResponse({ error: "boom" }, 500),
    "GET /admin/spawned-agents?status=trial&domain=code": jsonResponse({
      count: 1,
      agents: [{ id: "sa_t", agent_id: "trial-only", display_name: "Trial Only", domain: "code", status: "trial", system_prompt: "x" }],
    }),
  });
  const out = await fetchActiveSpawnedAgents({
    bearerToken: "tok",
    apiBase: API_BASE,
    domain: "code",
    fetchImpl: stub.fn,
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].agentId, "trial-only");
});

test("fetchActiveSpawnedAgents: malformed JSON → silently skipped (no throw)", async () => {
  const stub = makeFetchStub({
    "*": new Response("not json", { status: 200, headers: { "content-type": "text/plain" } }),
  });
  const out = await fetchActiveSpawnedAgents({
    bearerToken: "tok",
    apiBase: API_BASE,
    domain: "code",
    fetchImpl: stub.fn,
  });
  assert.deepEqual(out, []);
});

test("fetchActiveSpawnedAgents: cross-domain leakage in worker response is filtered out client-side", async () => {
  // Defensive: the worker only returns rows matching the domain query
  // arg, but if a future indexing change leaked a stale row, the client
  // must drop it.
  const stub = makeFetchStub({
    "GET /admin/spawned-agents?status=promoted&domain=code": jsonResponse({
      count: 2,
      agents: [
        { id: "sa_c", agent_id: "ok-code",   display_name: "OK",   domain: "code",   status: "promoted", system_prompt: "x" },
        { id: "sa_d", agent_id: "leaky-des", display_name: "Leak", domain: "design", status: "promoted", system_prompt: "x" },
      ],
    }),
    "GET /admin/spawned-agents?status=trial&domain=code": jsonResponse({ count: 0, agents: [] }),
  });
  const out = await fetchActiveSpawnedAgents({
    bearerToken: "tok",
    apiBase: API_BASE,
    domain: "code",
    fetchImpl: stub.fn,
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].agentId, "ok-code");
});

// --- buildTrialAgentWeights ---------------------------------------------

test("buildTrialAgentWeights: only trial agents get a weight (promoted = default 1.0)", () => {
  const weights = buildTrialAgentWeights([
    { id: "sa_1", agentId: "trial-1", displayName: "T1", domain: "code", status: "trial",    systemPrompt: "x" },
    { id: "sa_2", agentId: "promo-2", displayName: "P2", domain: "code", status: "promoted", systemPrompt: "x" },
    { id: "sa_3", agentId: "trial-3", displayName: "T3", domain: "code", status: "trial",    systemPrompt: "x" },
  ]);
  assert.equal(weights.size, 2);
  assert.equal(weights.get("trial-1"), TRIAL_AGENT_WEIGHT);
  assert.equal(weights.get("trial-3"), TRIAL_AGENT_WEIGHT);
  assert.equal(weights.has("promo-2"), false);
});

test("buildTrialAgentWeights: empty input → empty map", () => {
  assert.equal(buildTrialAgentWeights([]).size, 0);
});

test("TRIAL_AGENT_WEIGHT is below H2 #10 0.5 demote threshold", () => {
  // Documented in spawned-agents-resolver.ts. Pin the contract so a
  // future tweak (e.g. raising to 0.6) doesn't silently break the
  // advisory-rework downgrade for trial agents.
  assert.ok(
    TRIAL_AGENT_WEIGHT < 0.5,
    "Trial agent weight must be < 0.5 for H2 #10 to demote rejects to advisory-rework",
  );
});

// --- reportSpawnedAgentOutcomes -----------------------------------------

test("reportSpawnedAgentOutcomes: posts one row per outcome with the right body shape", async () => {
  const stub = makeFetchStub({
    "POST /admin/spawned-agent-outcomes": jsonResponse({ ok: true }),
  });
  const r = await reportSpawnedAgentOutcomes(
    [
      {
        agentId: "k8s", reviewId: "r1", verdict: "approve", blockerCount: 0,
        costUsd: 0.01, latencyMs: 1200, smokePassed: true,
      },
      {
        agentId: "graphql", reviewId: "r1", verdict: "rework", blockerCount: 2,
        costUsd: 0.02, latencyMs: 1500, smokePassed: null,
      },
    ],
    { bearerToken: "tok", apiBase: API_BASE, fetchImpl: stub.fn },
  );
  assert.deepEqual(r, { recorded: 2, failed: 0 });
  assert.equal(stub.calls.length, 2);
  const body = JSON.parse(stub.calls[0].init.body);
  assert.equal(body.agent_id, "k8s");
  assert.equal(body.review_id, "r1");
  assert.equal(body.verdict, "approve");
  assert.equal(body.blocker_count, 0);
  assert.equal(body.cost_usd, 0.01);
  assert.equal(body.latency_ms, 1200);
  assert.equal(body.smoke_passed, true);
});

test("reportSpawnedAgentOutcomes: failures counted but not thrown", async () => {
  const stub = makeFetchStub({
    "POST /admin/spawned-agent-outcomes": jsonResponse({ error: "x" }, 500),
  });
  const r = await reportSpawnedAgentOutcomes(
    [
      { agentId: "k8s", reviewId: "r1", verdict: "approve", blockerCount: 0, costUsd: 0, latencyMs: 0, smokePassed: null },
    ],
    { bearerToken: "tok", apiBase: API_BASE, fetchImpl: stub.fn },
  );
  assert.deepEqual(r, { recorded: 0, failed: 1 });
});

test("reportSpawnedAgentOutcomes: empty list → no calls", async () => {
  const stub = makeFetchStub({});
  const r = await reportSpawnedAgentOutcomes([], {
    bearerToken: "tok", apiBase: API_BASE, fetchImpl: stub.fn,
  });
  assert.deepEqual(r, { recorded: 0, failed: 0 });
  assert.equal(stub.calls.length, 0);
});

// --- reportSpawnedAgentSmokeOutcomes ------------------------------------

test("reportSpawnedAgentSmokeOutcomes: PATCH per outcome with right body", async () => {
  const stub = makeFetchStub({
    "PATCH /admin/spawned-agent-outcomes": jsonResponse({ ok: true }),
  });
  const r = await reportSpawnedAgentSmokeOutcomes(
    [
      { agentId: "k8s", reviewId: "r1", smokePassed: true },
      { agentId: "graphql", reviewId: "r1", smokePassed: false },
      { agentId: "design-token", reviewId: "r1", smokePassed: null },
    ],
    { bearerToken: "tok", apiBase: API_BASE, fetchImpl: stub.fn },
  );
  assert.deepEqual(r, { patched: 3, failed: 0 });
  assert.equal(stub.calls.length, 3);
  for (const c of stub.calls) {
    assert.equal(c.init.method, "PATCH");
  }
  const body = JSON.parse(stub.calls[1].init.body);
  assert.equal(body.agent_id, "graphql");
  assert.equal(body.review_id, "r1");
  assert.equal(body.smoke_passed, false);
});

test("reportSpawnedAgentSmokeOutcomes: 409 outcome_not_found counted as failed but not thrown", async () => {
  const stub = makeFetchStub({
    "PATCH /admin/spawned-agent-outcomes": jsonResponse({ error: "outcome_not_found" }, 409),
  });
  const r = await reportSpawnedAgentSmokeOutcomes(
    [{ agentId: "k8s", reviewId: "r-stale", smokePassed: true }],
    { bearerToken: "tok", apiBase: API_BASE, fetchImpl: stub.fn },
  );
  assert.deepEqual(r, { patched: 0, failed: 1 });
});

test("reportSpawnedAgentSmokeOutcomes: empty list → no calls", async () => {
  const stub = makeFetchStub({});
  const r = await reportSpawnedAgentSmokeOutcomes([], {
    bearerToken: "tok", apiBase: API_BASE, fetchImpl: stub.fn,
  });
  assert.deepEqual(r, { patched: 0, failed: 0 });
  assert.equal(stub.calls.length, 0);
});

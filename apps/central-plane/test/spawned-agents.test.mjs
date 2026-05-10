/**
 * Sprint E5 (shadow scaffold) — agent-spawner + spawned-agents route tests.
 * v0.14.3 — extended for council wire-in: 'trial' state, outcome ingest,
 * auto-graduation.
 *
 * Verifies the threshold gate, idempotent UNIQUE on agent_id, status
 * flow, route auth, plus the new wire-in surface.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../dist/router.js";
import {
  decideAutoGrad,
  isTrialPass,
  parseSpawnSpec,
  recordSpawnedAgentOutcome,
  runAgentSpawner,
  runAutoGraduation,
  setSpawnedAgentStatus,
  TRIAL_MIN_DURATION_MS,
  TRIAL_MIN_OUTCOMES,
} from "../dist/agent-spawner.js";

function makeMockDb({ feedback = [], spawned = [], outcomes = [] } = {}) {
  const state = {
    feedback: [...feedback],
    spawned: new Map(spawned.map((s) => [s.id, { ...s }])),
    outcomes: [...outcomes],
  };
  return {
    state,
    prepare(sql) {
      let bound = [];
      const handlers = {
        async first() {
          if (/SELECT 1 as n FROM spawned_agents WHERE agent_id/.test(sql)) {
            for (const v of state.spawned.values()) {
              if (v.agent_id === bound[0] && v.removed_at === null) return { n: 1 };
            }
            return null;
          }
          if (/SELECT id FROM spawned_agents WHERE agent_id/.test(sql)) {
            for (const v of state.spawned.values()) {
              if (v.agent_id === bound[0] && v.removed_at === null) return { id: v.id };
            }
            return null;
          }
          if (/SELECT 1 FROM spawned_agent_outcomes WHERE spawned_agent_pk/.test(sql)) {
            const [pk, rid] = bound;
            const found = state.outcomes.find((o) => o.spawned_agent_pk === pk && o.review_id === rid);
            return found ? { 1: 1 } : null;
          }
          return null;
        },
        async run() {
          if (/INSERT INTO spawned_agents/.test(sql)) {
            const [
              id, agent_id, display_name, domain, domain_hint, emergence_signal,
              trigger_feedback_ids, system_prompt, base_agent_id, _statusLiteral, spawned_at,
            ] = bound;
            state.spawned.set(id, {
              id, agent_id, display_name, domain, domain_hint, emergence_signal,
              trigger_feedback_ids, system_prompt, base_agent_id,
              status: "shadow", spawned_at,
              trial_promoted_at: null, promoted_at: null, archived_at: null, removed_at: null,
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (/INSERT INTO spawned_agent_outcomes/.test(sql)) {
            const [
              id, spawned_agent_pk, review_id, verdict, blocker_count,
              cost_usd, latency_ms, smoke_passed, recorded_at,
            ] = bound;
            state.outcomes.push({
              id, spawned_agent_pk, review_id, verdict, blocker_count,
              cost_usd, latency_ms, smoke_passed, recorded_at,
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (/UPDATE spawned_agents SET status = \?, trial_promoted_at/.test(sql)) {
            const [status, trial_promoted_at, id] = bound;
            const row = state.spawned.get(id);
            if (!row || row.removed_at !== null) return { success: true, meta: { changes: 0 } };
            row.status = status;
            row.trial_promoted_at = trial_promoted_at;
            return { success: true, meta: { changes: 1 } };
          }
          if (/UPDATE spawned_agents SET status = \?, promoted_at/.test(sql)) {
            const [status, promoted_at, id] = bound;
            const row = state.spawned.get(id);
            if (!row || row.removed_at !== null) return { success: true, meta: { changes: 0 } };
            row.status = status;
            row.promoted_at = promoted_at;
            return { success: true, meta: { changes: 1 } };
          }
          if (/UPDATE spawned_agents SET status = \?, archived_at/.test(sql)) {
            const [status, archived_at, id] = bound;
            const row = state.spawned.get(id);
            if (!row || row.removed_at !== null) return { success: true, meta: { changes: 0 } };
            row.status = status;
            row.archived_at = archived_at;
            return { success: true, meta: { changes: 1 } };
          }
          if (/UPDATE spawned_agents SET status = \? WHERE id/.test(sql)) {
            const [status, id] = bound;
            const row = state.spawned.get(id);
            if (!row || row.removed_at !== null) return { success: true, meta: { changes: 0 } };
            row.status = status;
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
        async all() {
          if (/FROM user_feedback/.test(sql)) {
            const cutoff = bound[0];
            const rows = state.feedback.filter(
              (r) =>
                r.removed_at === null &&
                r.status === "classified" &&
                r.category === "other" &&
                r.created_at >= cutoff,
            );
            return { results: rows };
          }
          // Auto-graduation aggregate join.
          if (/LEFT JOIN spawned_agent_outcomes/.test(sql)) {
            const rows = [];
            for (const sa of state.spawned.values()) {
              if (sa.removed_at !== null) continue;
              if (sa.status !== "trial") continue;
              const mine = state.outcomes.filter((o) => o.spawned_agent_pk === sa.id);
              let passes = 0;
              for (const o of mine) {
                if (o.verdict === "reject") continue;
                if (o.smoke_passed === 0) continue;
                passes += 1;
              }
              rows.push({
                spawned_agent_pk: sa.id,
                agent_id: sa.agent_id,
                trial_promoted_at: sa.trial_promoted_at,
                total: mine.length,
                passes,
              });
            }
            return { results: rows };
          }
          if (/FROM spawned_agents/.test(sql)) {
            let rows = [...state.spawned.values()].filter((s) => s.removed_at === null);
            // Status + domain filters can be combined; the route builds
            // the WHERE clause dynamically. Walk the bound args in order.
            const wheres = sql.match(/AND (status|domain) = \?/g) ?? [];
            let i = 0;
            for (const w of wheres) {
              const col = w.includes("status") ? "status" : "domain";
              const val = bound[i++];
              rows = rows.filter((s) => s[col] === val);
            }
            rows.sort((a, b) => (a.spawned_at < b.spawned_at ? 1 : -1));
            return { results: rows };
          }
          return { results: [] };
        },
      };
      return {
        bind: (...args) => {
          bound = args;
          return handlers;
        },
        first: handlers.first,
        all: handlers.all,
        run: handlers.run,
      };
    },
  };
}

function makeEnv(overrides = {}) {
  return {
    DB: makeMockDb(),
    ENVIRONMENT: "test",
    ANTHROPIC_API_KEY: "test-key",
    INTERNAL_CALLBACK_TOKEN: "e5-token",
    ...overrides,
  };
}

function withFetchStub(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original;
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function haikuOk(spec) {
  return jsonResponse({
    content: [{ type: "text", text: JSON.stringify(spec) }],
  });
}

function makeFeedback(overrides) {
  return {
    id: "fb_x",
    domain: "code",
    status: "classified",
    category: "other",
    what_user_wanted: "want",
    what_we_produced: "produced",
    reasoning: null,
    created_at: new Date().toISOString(),
    removed_at: null,
    ...overrides,
  };
}

function makeSpawned(overrides) {
  return {
    id: "sa_x",
    agent_id: "x",
    display_name: "X",
    domain: "code",
    domain_hint: "x",
    emergence_signal: null,
    trigger_feedback_ids: "[]",
    system_prompt: "you are X",
    base_agent_id: null,
    status: "shadow",
    spawned_at: "2026-05-09T00:00:00Z",
    trial_promoted_at: null,
    promoted_at: null,
    archived_at: null,
    removed_at: null,
    ...overrides,
  };
}

// --- spawner tests --------------------------------------------------------

test("spawner: <3 'other' rows → no spawn, reason=below_threshold", async () => {
  const env = makeEnv({
    DB: makeMockDb({ feedback: [makeFeedback({ id: "fb1" })] }),
  });
  const result = await withFetchStub(
    () => {
      throw new Error("haiku must NOT be called below threshold");
    },
    () => runAgentSpawner(env),
  );
  assert.equal(result.spawn_attempted, false);
  assert.equal(result.reason, "below_threshold");
});

test("spawner: ≥3 'other' rows + Haiku spawn=true → row inserted with status='shadow' + domain='code'", async () => {
  const env = makeEnv({
    DB: makeMockDb({
      feedback: [
        makeFeedback({ id: "fb1", what_user_wanted: "review my K8s deployment.yaml" }),
        makeFeedback({ id: "fb2", what_user_wanted: "k8s manifest validation" }),
        makeFeedback({ id: "fb3", what_user_wanted: "kubernetes resource limits check" }),
      ],
    }),
  });
  const result = await withFetchStub(
    () => haikuOk({
      spawn: true,
      agent_id: "k8s-manifest",
      display_name: "K8s Manifest",
      domain: "code",
      domain_hint: "Kubernetes manifest reviews",
      base_agent_id: "claude",
      emergence_signal: "3 feedback rows about K8s manifest reviews",
      system_prompt: "You are a senior K8s reviewer...",
    }),
    () => runAgentSpawner(env),
  );
  assert.equal(result.spawn_succeeded, true);
  assert.equal(result.spawned_agent_id, "k8s-manifest");
  assert.equal(env.DB.state.spawned.size, 1);
  const row = [...env.DB.state.spawned.values()][0];
  assert.equal(row.status, "shadow");
  assert.equal(row.agent_id, "k8s-manifest");
  assert.equal(row.domain, "code");
});

test("spawner: Haiku says spawn=false → no row inserted", async () => {
  const env = makeEnv({
    DB: makeMockDb({
      feedback: [
        makeFeedback({ id: "fb1" }),
        makeFeedback({ id: "fb2" }),
        makeFeedback({ id: "fb3" }),
      ],
    }),
  });
  const result = await withFetchStub(
    () => haikuOk({ spawn: false }),
    () => runAgentSpawner(env),
  );
  assert.equal(result.spawn_succeeded, false);
  assert.equal(result.reason, "spawn_declined_by_haiku");
  assert.equal(env.DB.state.spawned.size, 0);
});

test("spawner: agent_id already exists → skip insertion, reason=agent_id_already_exists", async () => {
  const env = makeEnv({
    DB: makeMockDb({
      feedback: [
        makeFeedback({ id: "fb1" }),
        makeFeedback({ id: "fb2" }),
        makeFeedback({ id: "fb3" }),
      ],
      spawned: [makeSpawned({ id: "sa_existing", agent_id: "k8s-manifest" })],
    }),
  });
  const result = await withFetchStub(
    () => haikuOk({
      spawn: true,
      agent_id: "k8s-manifest",
      display_name: "K8s",
      domain: "code",
      domain_hint: "k8s",
      system_prompt: "x",
    }),
    () => runAgentSpawner(env),
  );
  assert.equal(result.reason, "agent_id_already_exists");
  assert.equal(env.DB.state.spawned.size, 1, "no new row created");
});

// --- parseSpawnSpec ---

test("parseSpawnSpec: domain defaults to 'code' when Haiku omits it", () => {
  const spec = parseSpawnSpec(JSON.stringify({
    spawn: true,
    agent_id: "x",
    display_name: "X",
    domain_hint: "x",
    system_prompt: "x",
  }));
  assert.equal(spec.domain, "code");
});

test("parseSpawnSpec: domain='design' is preserved", () => {
  const spec = parseSpawnSpec(JSON.stringify({
    spawn: true,
    agent_id: "x",
    display_name: "X",
    domain: "design",
    domain_hint: "x",
    system_prompt: "x",
  }));
  assert.equal(spec.domain, "design");
});

test("parseSpawnSpec: bogus domain values fall back to 'code'", () => {
  const spec = parseSpawnSpec(JSON.stringify({
    spawn: true,
    agent_id: "x",
    display_name: "X",
    domain: "infra",
    domain_hint: "x",
    system_prompt: "x",
  }));
  assert.equal(spec.domain, "code");
});

// --- setSpawnedAgentStatus: trial transition ---

test("setSpawnedAgentStatus: shadow → trial sets trial_promoted_at", async () => {
  const env = makeEnv({
    DB: makeMockDb({
      spawned: [makeSpawned({ id: "sa_1", agent_id: "x", status: "shadow" })],
    }),
  });
  const ok = await setSpawnedAgentStatus(env, "sa_1", "trial");
  assert.equal(ok, true);
  const row = env.DB.state.spawned.get("sa_1");
  assert.equal(row.status, "trial");
  assert.ok(row.trial_promoted_at, "trial_promoted_at must be set");
});

test("setSpawnedAgentStatus: trial → promoted preserves trial_promoted_at and sets promoted_at", async () => {
  const env = makeEnv({
    DB: makeMockDb({
      spawned: [makeSpawned({
        id: "sa_1",
        agent_id: "x",
        status: "trial",
        trial_promoted_at: "2026-04-01T00:00:00Z",
      })],
    }),
  });
  const ok = await setSpawnedAgentStatus(env, "sa_1", "promoted");
  assert.equal(ok, true);
  const row = env.DB.state.spawned.get("sa_1");
  assert.equal(row.status, "promoted");
  assert.equal(row.trial_promoted_at, "2026-04-01T00:00:00Z");
  assert.ok(row.promoted_at);
});

// --- recordSpawnedAgentOutcome ---

test("recordSpawnedAgentOutcome: agent not found → ok:false", async () => {
  const env = makeEnv();
  const r = await recordSpawnedAgentOutcome(env, {
    agent_id: "nope",
    review_id: "r1",
    verdict: "approve",
    blocker_count: 0,
    cost_usd: 0.01,
    latency_ms: 1200,
    smoke_passed: null,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "agent_not_found");
});

test("recordSpawnedAgentOutcome: happy path inserts a row", async () => {
  const env = makeEnv({
    DB: makeMockDb({ spawned: [makeSpawned({ id: "sa_1", agent_id: "k8s" })] }),
  });
  const r = await recordSpawnedAgentOutcome(env, {
    agent_id: "k8s",
    review_id: "r1",
    verdict: "approve",
    blocker_count: 0,
    cost_usd: 0.01,
    latency_ms: 1200,
    smoke_passed: true,
  });
  assert.equal(r.ok, true);
  assert.equal(env.DB.state.outcomes.length, 1);
  assert.equal(env.DB.state.outcomes[0].verdict, "approve");
  assert.equal(env.DB.state.outcomes[0].smoke_passed, 1);
});

test("recordSpawnedAgentOutcome: duplicate (agent_pk, review_id) → ok:false", async () => {
  const env = makeEnv({
    DB: makeMockDb({ spawned: [makeSpawned({ id: "sa_1", agent_id: "k8s" })] }),
  });
  await recordSpawnedAgentOutcome(env, {
    agent_id: "k8s", review_id: "r1", verdict: "approve",
    blocker_count: 0, cost_usd: 0.01, latency_ms: 1200, smoke_passed: null,
  });
  const r = await recordSpawnedAgentOutcome(env, {
    agent_id: "k8s", review_id: "r1", verdict: "rework",
    blocker_count: 1, cost_usd: 0.02, latency_ms: 1500, smoke_passed: null,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "duplicate");
  assert.equal(env.DB.state.outcomes.length, 1);
});

// --- isTrialPass ---

test("isTrialPass: reject is always a fail", () => {
  assert.equal(isTrialPass("reject", null), false);
  assert.equal(isTrialPass("reject", 1), false);
});

test("isTrialPass: smoke_passed=0 is a fail regardless of verdict", () => {
  assert.equal(isTrialPass("approve", 0), false);
  assert.equal(isTrialPass("rework", 0), false);
});

test("isTrialPass: approve+rework with smoke=null or smoke=1 → pass", () => {
  assert.equal(isTrialPass("approve", null), true);
  assert.equal(isTrialPass("approve", 1), true);
  assert.equal(isTrialPass("rework", null), true);
  assert.equal(isTrialPass("rework", 1), true);
});

// --- decideAutoGrad ---

const NOW = new Date("2026-06-01T00:00:00Z").getTime();

test("decideAutoGrad: no trial_promoted_at → wait", () => {
  assert.equal(decideAutoGrad({ trialPromotedAt: null, total: 100, passes: 90, now: NOW }), "wait");
});

test("decideAutoGrad: ≤TRIAL_ARCHIVE_PASS_RATE with ≥5 outcomes → archive (fast-fail)", () => {
  // 1/5 = 20% pass rate, exactly at the archive threshold.
  assert.equal(
    decideAutoGrad({
      trialPromotedAt: new Date(NOW - 1000).toISOString(),
      total: 5,
      passes: 1,
      now: NOW,
    }),
    "archive",
  );
});

test("decideAutoGrad: <14 days in trial with good pass-rate → wait", () => {
  // Inside the duration window even at high pass-rate.
  assert.equal(
    decideAutoGrad({
      trialPromotedAt: new Date(NOW - 1000).toISOString(),
      total: 100,
      passes: 95,
      now: NOW,
    }),
    "wait",
  );
});

test("decideAutoGrad: ≥14 days + ≥10 outcomes + ≥80% pass → promote", () => {
  assert.equal(
    decideAutoGrad({
      trialPromotedAt: new Date(NOW - TRIAL_MIN_DURATION_MS - 1000).toISOString(),
      total: TRIAL_MIN_OUTCOMES,
      passes: 8,
      now: NOW,
    }),
    "promote",
  );
});

test("decideAutoGrad: ≥14 days + ≥10 outcomes but <80% pass and >20% pass → wait", () => {
  assert.equal(
    decideAutoGrad({
      trialPromotedAt: new Date(NOW - TRIAL_MIN_DURATION_MS - 1000).toISOString(),
      total: 10,
      passes: 5, // 50%
      now: NOW,
    }),
    "wait",
  );
});

// --- runAutoGraduation (end-to-end with mock DB) ---

test("runAutoGraduation: trial agent meeting promote criteria → flips to promoted", async () => {
  const trialPromotedAt = new Date(NOW - TRIAL_MIN_DURATION_MS - 1000).toISOString();
  const env = makeEnv({
    DB: makeMockDb({
      spawned: [
        makeSpawned({ id: "sa_t", agent_id: "trial-agent", status: "trial", trial_promoted_at: trialPromotedAt }),
      ],
      outcomes: [
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `sao_${i}`,
          spawned_agent_pk: "sa_t",
          review_id: `r${i}`,
          verdict: i < 9 ? "approve" : "reject",
          blocker_count: 0,
          cost_usd: 0.01,
          latency_ms: 1000,
          smoke_passed: null,
          recorded_at: new Date(NOW - i * 1000).toISOString(),
        })),
      ],
    }),
  });
  const r = await runAutoGraduation(env, NOW);
  assert.equal(r.evaluated, 1);
  assert.deepEqual(r.promoted, ["trial-agent"]);
  assert.deepEqual(r.archived, []);
  assert.equal(env.DB.state.spawned.get("sa_t").status, "promoted");
});

test("runAutoGraduation: trial agent with low pass-rate → archived", async () => {
  const trialPromotedAt = new Date(NOW - 1000).toISOString();
  const env = makeEnv({
    DB: makeMockDb({
      spawned: [
        makeSpawned({ id: "sa_b", agent_id: "bad-agent", status: "trial", trial_promoted_at: trialPromotedAt }),
      ],
      outcomes: Array.from({ length: 5 }, (_, i) => ({
        id: `sao_${i}`,
        spawned_agent_pk: "sa_b",
        review_id: `r${i}`,
        verdict: "reject",
        blocker_count: 3,
        cost_usd: 0.02,
        latency_ms: 1500,
        smoke_passed: null,
        recorded_at: new Date(NOW - i * 1000).toISOString(),
      })),
    }),
  });
  const r = await runAutoGraduation(env, NOW);
  assert.deepEqual(r.archived, ["bad-agent"]);
  assert.equal(env.DB.state.spawned.get("sa_b").status, "archived");
});

test("runAutoGraduation: shadow / promoted / archived agents are skipped", async () => {
  const env = makeEnv({
    DB: makeMockDb({
      spawned: [
        makeSpawned({ id: "sa_s", agent_id: "shadow-a", status: "shadow" }),
        makeSpawned({ id: "sa_p", agent_id: "promo-a", status: "promoted" }),
        makeSpawned({ id: "sa_a", agent_id: "archive-a", status: "archived" }),
      ],
    }),
  });
  const r = await runAutoGraduation(env, NOW);
  assert.equal(r.evaluated, 0);
  assert.deepEqual(r.promoted, []);
  assert.deepEqual(r.archived, []);
});

// --- route tests ----------------------------------------------------------

test("GET /admin/spawned-agents: 401 with bad token", async () => {
  const app = createApp();
  const env = makeEnv();
  const res = await app.fetch(
    new Request("http://localhost/admin/spawned-agents", {
      headers: { authorization: "Bearer wrong" },
    }),
    env,
  );
  assert.equal(res.status, 401);
});

test("GET /admin/spawned-agents?status=shadow: returns shadow rows", async () => {
  const app = createApp();
  const env = makeEnv({
    DB: makeMockDb({
      spawned: [
        makeSpawned({ id: "sa_1", agent_id: "k8s", status: "shadow", spawned_at: "2026-05-09T00:00:00Z" }),
        makeSpawned({ id: "sa_2", agent_id: "rust", status: "promoted", spawned_at: "2026-04-09T00:00:00Z", promoted_at: "2026-05-01T00:00:00Z" }),
      ],
    }),
  });
  const res = await app.fetch(
    new Request("http://localhost/admin/spawned-agents?status=shadow", {
      headers: { authorization: "Bearer e5-token" },
    }),
    env,
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.count, 1);
  assert.equal(body.agents[0].agent_id, "k8s");
});

test("GET /admin/spawned-agents?status=trial&domain=code: filters on both", async () => {
  const app = createApp();
  const env = makeEnv({
    DB: makeMockDb({
      spawned: [
        makeSpawned({ id: "sa_1", agent_id: "k8s",  status: "trial", domain: "code"   }),
        makeSpawned({ id: "sa_2", agent_id: "rust", status: "trial", domain: "design" }),
        makeSpawned({ id: "sa_3", agent_id: "go",   status: "shadow", domain: "code"  }),
      ],
    }),
  });
  const res = await app.fetch(
    new Request("http://localhost/admin/spawned-agents?status=trial&domain=code", {
      headers: { authorization: "Bearer e5-token" },
    }),
    env,
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.count, 1);
  assert.equal(body.agents[0].agent_id, "k8s");
});

test("POST /admin/spawned-agents/:id/status: shadow → trial sets trial_promoted_at", async () => {
  const app = createApp();
  const env = makeEnv({
    DB: makeMockDb({ spawned: [makeSpawned({ id: "sa_1", agent_id: "k8s", status: "shadow" })] }),
  });
  const res = await app.fetch(
    new Request("http://localhost/admin/spawned-agents/sa_1/status", {
      method: "POST",
      headers: { authorization: "Bearer e5-token", "content-type": "application/json" },
      body: JSON.stringify({ status: "trial" }),
    }),
    env,
  );
  assert.equal(res.status, 200);
  assert.equal(env.DB.state.spawned.get("sa_1").status, "trial");
  assert.ok(env.DB.state.spawned.get("sa_1").trial_promoted_at);
});

test("POST /admin/spawned-agents/:id/status: rejects unknown status", async () => {
  const app = createApp();
  const env = makeEnv({
    DB: makeMockDb({ spawned: [makeSpawned({ id: "sa_1", agent_id: "k8s" })] }),
  });
  const res = await app.fetch(
    new Request("http://localhost/admin/spawned-agents/sa_1/status", {
      method: "POST",
      headers: { authorization: "Bearer e5-token", "content-type": "application/json" },
      body: JSON.stringify({ status: "deleted" }),
    }),
    env,
  );
  assert.equal(res.status, 400);
});

test("POST /admin/spawned-agent-outcomes: happy path → 200 and row inserted", async () => {
  const app = createApp();
  const env = makeEnv({
    DB: makeMockDb({ spawned: [makeSpawned({ id: "sa_1", agent_id: "k8s", status: "trial" })] }),
  });
  const res = await app.fetch(
    new Request("http://localhost/admin/spawned-agent-outcomes", {
      method: "POST",
      headers: { authorization: "Bearer e5-token", "content-type": "application/json" },
      body: JSON.stringify({
        agent_id: "k8s",
        review_id: "r1",
        verdict: "approve",
        blocker_count: 0,
        cost_usd: 0.012,
        latency_ms: 1500,
        smoke_passed: true,
      }),
    }),
    env,
  );
  assert.equal(res.status, 200);
  assert.equal(env.DB.state.outcomes.length, 1);
});

test("POST /admin/spawned-agent-outcomes: missing fields → 400", async () => {
  const app = createApp();
  const env = makeEnv();
  const res = await app.fetch(
    new Request("http://localhost/admin/spawned-agent-outcomes", {
      method: "POST",
      headers: { authorization: "Bearer e5-token", "content-type": "application/json" },
      body: JSON.stringify({ agent_id: "k8s" }),
    }),
    env,
  );
  assert.equal(res.status, 400);
});

test("POST /admin/spawned-agent-outcomes: unknown agent → 404", async () => {
  const app = createApp();
  const env = makeEnv();
  const res = await app.fetch(
    new Request("http://localhost/admin/spawned-agent-outcomes", {
      method: "POST",
      headers: { authorization: "Bearer e5-token", "content-type": "application/json" },
      body: JSON.stringify({
        agent_id: "ghost",
        review_id: "r1",
        verdict: "approve",
        blocker_count: 0,
        cost_usd: 0.01,
        latency_ms: 1000,
        smoke_passed: null,
      }),
    }),
    env,
  );
  assert.equal(res.status, 404);
});

test("POST /admin/run-agent-spawner: returns auto_graduation block", async () => {
  const app = createApp();
  const env = makeEnv({
    DB: makeMockDb({ feedback: [] }),
  });
  const res = await app.fetch(
    new Request("http://localhost/admin/run-agent-spawner", {
      method: "POST",
      headers: { authorization: "Bearer e5-token" },
    }),
    env,
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.auto_graduation, "auto_graduation block must be present");
  assert.equal(body.auto_graduation.evaluated, 0);
});

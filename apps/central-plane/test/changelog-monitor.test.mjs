/**
 * Sprint E3 — changelog-monitor + spec-updates route tests.
 *
 * Stubs global fetch (GitHub releases API + Anthropic) and D1 to verify
 * the high-water-mark logic skips already-processed releases, and that
 * the route surface auths + filters correctly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../dist/router.js";
import { runChangelogMonitor } from "../dist/changelog-monitor.js";

function makeMockDb({ updates = [], state = {} } = {}) {
  const stateObj = {
    updates: new Map(updates.map((u) => [u.id, { ...u }])),
    monitor: new Map(Object.entries(state).map(([k, v]) => [k, { ...v }])),
  };
  return {
    state: stateObj,
    prepare(sql) {
      let bound = [];
      const handlers = {
        async first() {
          if (/FROM spec_monitor_state WHERE source_id = \?/.test(sql)) {
            const row = stateObj.monitor.get(bound[0]);
            return row ? {
              last_release_tag: row.last_release_tag,
              last_release_published_at: row.last_release_published_at,
            } : null;
          }
          return null;
        },
        async run() {
          if (/INSERT INTO spec_updates/.test(sql)) {
            const [
              id, source_id, source_repo, release_tag, release_url, release_published_at,
              domain, kind, category, severity, title, body, tags, prompt_text, extracted_at,
            ] = bound;
            stateObj.updates.set(id, {
              id, source_id, source_repo, release_tag, release_url, release_published_at,
              domain, kind, category, severity, title, body, tags, prompt_text, extracted_at,
              removed_at: null,
            });
            return { success: true };
          }
          if (/INSERT INTO spec_monitor_state/.test(sql)) {
            const [source_id, last_release_tag, last_release_published_at, last_run_at] = bound;
            stateObj.monitor.set(source_id, { last_release_tag, last_release_published_at, last_run_at });
            return { success: true };
          }
          return { success: true };
        },
        async all() {
          if (/FROM spec_updates\s+WHERE domain = \?/.test(sql)) {
            const domain = bound[0];
            const rows = [...stateObj.updates.values()]
              .filter((u) => u.removed_at === null && u.domain === domain)
              .sort((a, b) => (b.release_published_at ?? "").localeCompare(a.release_published_at ?? ""));
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
    INTERNAL_CALLBACK_TOKEN: "e3-test-token",
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

function makeFetchStub({ releases = {}, haikuJsonl = '{"kind":"failure","title":"x","body":"y","tags":["a"],"category":"correctness","severity":"major"}' }) {
  return async (url) => {
    const u = String(url);
    if (u.includes("api.github.com/repos/") && u.includes("/releases")) {
      // url like https://api.github.com/repos/<owner>/<repo>/releases?...
      const m = u.match(/repos\/([^/]+\/[^/]+)\/releases/);
      const repo = m ? m[1] : "";
      return jsonResponse(releases[repo] ?? []);
    }
    if (u.includes("api.anthropic.com")) {
      return jsonResponse({ content: [{ type: "text", text: haikuJsonl }] });
    }
    return new Response("nope", { status: 404 });
  };
}

test("changelog-monitor: processes new releases past high-water mark", async () => {
  const env = makeEnv({
    DB: makeMockDb({
      state: {
        react: { last_release_tag: "v18.2.0", last_release_published_at: "2026-04-01T00:00:00Z", last_run_at: "2026-04-01T00:00:00Z" },
      },
    }),
  });
  const releases = {
    "facebook/react": [
      { tag_name: "v18.3.0", name: "React 18.3", html_url: "https://github.com/facebook/react/releases/tag/v18.3.0", body: "# React 18.3\n\n- New `use` API for resources.\n- Deprecates manual useMemo deps.", published_at: "2026-05-01T00:00:00Z", draft: false, prerelease: false },
      { tag_name: "v18.2.0", name: "React 18.2", html_url: "https://github.com/facebook/react/releases/tag/v18.2.0", body: "old", published_at: "2026-04-01T00:00:00Z", draft: false, prerelease: false },
    ],
    "vercel/next.js": [],
    "tailwindlabs/tailwindcss": [],
    "microsoft/TypeScript": [],
    "shadcn-ui/ui": [],
    "storybookjs/storybook": [],
  };
  const result = await withFetchStub(makeFetchStub({ releases }), () => runChangelogMonitor(env));
  // React advanced past v18.2.0 → v18.3.0 should be processed once, others 0
  const reactResult = result.per_source.find((p) => p.source_id === "react");
  assert.equal(reactResult.releases_processed, 1);
  assert.equal(reactResult.entries_saved, 1);
  // High-water mark advanced
  assert.equal(env.DB.state.monitor.get("react").last_release_tag, "v18.3.0");
});

test("changelog-monitor: drafts and prereleases skipped", async () => {
  const env = makeEnv();
  const releases = {
    "facebook/react": [
      { tag_name: "v19.0.0-rc.1", body: "rc", published_at: "2026-06-01T00:00:00Z", draft: false, prerelease: true, html_url: "x", name: "rc" },
      { tag_name: "v18.5.0", body: "draft", published_at: "2026-06-02T00:00:00Z", draft: true, prerelease: false, html_url: "x", name: "draft" },
    ],
    "vercel/next.js": [], "tailwindlabs/tailwindcss": [], "microsoft/TypeScript": [],
    "shadcn-ui/ui": [], "storybookjs/storybook": [],
  };
  const result = await withFetchStub(makeFetchStub({ releases }), () => runChangelogMonitor(env));
  const reactResult = result.per_source.find((p) => p.source_id === "react");
  assert.equal(reactResult.releases_processed, 0, "drafts/prereleases must be skipped");
});

test("GET /seeds/spec-updates/:domain: returns count + entries", async () => {
  const app = createApp();
  const env = makeEnv({
    DB: makeMockDb({
      updates: [
        {
          id: "su_1",
          domain: "code",
          kind: "answer_key",
          source_id: "react",
          release_tag: "v18.3.0",
          prompt_text: "[react@v18.3.0/use-api] Prefer use() — new API.",
          release_published_at: "2026-05-01T00:00:00Z",
          removed_at: null,
        },
      ],
    }),
  });
  const res = await app.fetch(new Request("http://localhost/seeds/spec-updates/code"), env);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.count, 1);
  assert.equal(body.updates[0].release_tag, "v18.3.0");
});

test("GET /seeds/spec-updates/banana: 400 invalid_domain", async () => {
  const app = createApp();
  const env = makeEnv();
  const res = await app.fetch(new Request("http://localhost/seeds/spec-updates/banana"), env);
  assert.equal(res.status, 400);
});

test("POST /admin/run-changelog-monitor: 401 with bad token", async () => {
  const app = createApp();
  const env = makeEnv();
  const res = await app.fetch(
    new Request("http://localhost/admin/run-changelog-monitor", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    }),
    env,
  );
  assert.equal(res.status, 401);
});

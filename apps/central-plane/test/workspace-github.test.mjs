/**
 * Stage 9: workspace GitHub OAuth helpers + DB + routes.
 * Uses in-memory DB mocks and stubbed fetch — no real GitHub calls.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { generateState, buildAuthUrl, isAllowedReturnTo, appendGitHubConnected } =
  await import("../dist/workspace/github-oauth.js");
const { saveOAuthState, getOAuthState, markStateUsed,
        upsertGitHubConnection, getGitHubConnectionByUserKey,
        deleteGitHubConnectionsByUserKey,
        upsertProjectRepo, getProjectRepo } =
  await import("../dist/workspace/github-db.js");
const { createApp } = await import("../dist/router.js");

// ─── Minimal D1 mock ─────────────────────────────────────────────────────────

function makeMockDb() {
  const state = { oauth_states: new Map(), github_connections: new Map(), project_repos: new Map() };
  return {
    state,
    prepare(sql) {
      let bound = [];
      return {
        bind(...args) { bound = args; return this; },
        async first() {
          if (/FROM workspace_oauth_states WHERE state/.test(sql)) {
            const row = state.oauth_states.get(bound[0]);
            return row ?? null;
          }
          if (/workspace_github_connections/.test(sql) && /github_user_id = \?/.test(sql) && /SELECT id/.test(sql)) {
            const entries = [...state.github_connections.values()].filter(r => r.github_user_id === bound[0]);
            return entries[0] ?? null;
          }
          if (/workspace_github_connections/.test(sql) && /user_key = \?/.test(sql)) {
            const entries = [...state.github_connections.values()].filter(r => r.user_key === bound[0]);
            return entries.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))[0] ?? null;
          }
          if (/workspace_project_repos/.test(sql) && /SELECT id/.test(sql)) {
            const entries = [...state.project_repos.values()].filter(r => r.project_id === bound[0]);
            return entries[0] ?? null;
          }
          if (/workspace_project_repos/.test(sql) && /project_id = \?/.test(sql)) {
            const entries = [...state.project_repos.values()].filter(r => r.project_id === bound[0]);
            return entries.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))[0] ?? null;
          }
          return null;
        },
        async run() {
          const now = new Date().toISOString();
          if (/INSERT OR REPLACE INTO workspace_oauth_states/.test(sql)) {
            const [s, user_key, return_to, created_at] = bound;
            state.oauth_states.set(s, { state: s, user_key, return_to, created_at, used: 0 });
          }
          if (/UPDATE workspace_oauth_states SET used/.test(sql)) {
            const row = state.oauth_states.get(bound[0]);
            if (row) row.used = 1;
          }
          if (/INSERT INTO workspace_github_connections/.test(sql)) {
            const [id, user_key, github_user_id, github_login, github_name, avatar_url, access_token_enc, scopes, created_at, updated_at] = bound;
            state.github_connections.set(id, { id, user_key, github_user_id, github_login, github_name, avatar_url, access_token_enc, scopes, created_at, updated_at });
          }
          if (/DELETE FROM workspace_github_connections WHERE user_key/.test(sql)) {
            for (const [id, row] of [...state.github_connections.entries()]) {
              if (row.user_key === bound[0]) state.github_connections.delete(id);
            }
          }
          if (/INSERT INTO workspace_project_repos/.test(sql)) {
            const [id, project_id, user_key, github_connection_id, repo_id, repo_full_name, repo_owner, repo_name, default_branch, priv, html_url, created_at, updated_at] = bound;
            state.project_repos.set(id, { id, project_id, user_key, github_connection_id, repo_id, repo_full_name, repo_owner, repo_name, default_branch, private: priv, html_url, created_at, updated_at });
          }
          return { success: true };
        },
        async all() { return { results: [] }; },
      };
    },
  };
}

function makeEnv(overrides = {}) {
  return { DB: makeMockDb(), ENVIRONMENT: "test", ANTHROPIC_API_KEY: "test", ...overrides };
}

// ─── github-oauth helpers ─────────────────────────────────────────────────────

describe("github-oauth helpers", () => {
  it("generateState produces 64-char hex string", () => {
    const s = generateState();
    assert.equal(s.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(s), "should be hex");
  });

  it("generateState produces different values each call", () => {
    assert.notEqual(generateState(), generateState());
  });

  it("buildAuthUrl includes all required params", () => {
    const url = buildAuthUrl({ clientId: "abc", redirectUri: "https://example.com/cb", scopes: "read:user", state: "xyz" });
    assert.ok(url.includes("client_id=abc"));
    assert.ok(url.includes("state=xyz"));
    assert.ok(url.includes("scope=read%3Auser"));
    assert.ok(url.startsWith("https://github.com/login/oauth/authorize"));
  });

  it("isAllowedReturnTo accepts localhost paths", () => {
    assert.ok(isAllowedReturnTo("/projects/proj_abc/settings"));
    assert.ok(isAllowedReturnTo("http://localhost:3002/projects/x"));
  });

  it("isAllowedReturnTo rejects untrusted origins", () => {
    assert.ok(!isAllowedReturnTo("https://evil.com/steal"));
    assert.ok(!isAllowedReturnTo(""));
  });

  it("isAllowedReturnTo accepts the Vercel production dashboard origin (exact, no wildcard)", () => {
    assert.ok(isAllowedReturnTo("https://conclave-dashboard.vercel.app/projects/x/github"));
    // exact-match only — a different vercel.app subdomain must still be rejected
    assert.ok(!isAllowedReturnTo("https://evil-dashboard.vercel.app/projects/x"));
  });

  it("isAllowedReturnTo accepts the Simsa launch origins (exact, no wildcard) — Stage 89", () => {
    assert.ok(isAllowedReturnTo("https://app.trysimsa.com/projects/x/github"));
    assert.ok(isAllowedReturnTo("https://trysimsa.com/projects/x"));
    // exact-match only — a look-alike subdomain must still be rejected
    assert.ok(!isAllowedReturnTo("https://evil.trysimsa.com/projects/x"));
    assert.ok(!isAllowedReturnTo("https://app.trysimsa.com.evil.com/projects/x"));
  });

  it("appendGitHubConnected adds query param", () => {
    assert.equal(
      appendGitHubConnected("/projects/abc", "https://dashboard.conclave-ai.dev"),
      "https://dashboard.conclave-ai.dev/projects/abc?github=connected",
    );
    assert.ok(appendGitHubConnected("/x?foo=bar", "https://d.example").includes("github=connected"));
  });
});

// ─── github-db: OAuth state ───────────────────────────────────────────────────

describe("github-db: OAuth state", () => {
  it("saveOAuthState + getOAuthState round-trip", async () => {
    const env = makeEnv();
    await saveOAuthState(env, { state: "test_state_1", userKey: "uk_abc", returnTo: "/projects/x" });
    const s = await getOAuthState(env, "test_state_1");
    assert.ok(s, "state should exist");
    assert.equal(s.userKey, "uk_abc");
    assert.equal(s.returnTo, "/projects/x");
    assert.equal(s.used, false);
  });

  it("getOAuthState returns null for unknown state", async () => {
    const env = makeEnv();
    const s = await getOAuthState(env, "nonexistent");
    assert.equal(s, null);
  });

  it("markStateUsed marks state as used", async () => {
    const env = makeEnv();
    await saveOAuthState(env, { state: "st2", userKey: "uk1", returnTo: "/" });
    await markStateUsed(env, "st2");
    const s = await getOAuthState(env, "st2");
    assert.ok(s?.used, "state should be marked used");
  });
});

// ─── github-db: connections ───────────────────────────────────────────────────

describe("github-db: GitHub connections", () => {
  it("upsertGitHubConnection saves and retrieves connection", async () => {
    const env = makeEnv();
    await upsertGitHubConnection(env, {
      userKey: "uk_test", githubUserId: "12345", githubLogin: "testuser",
      githubName: "Test User", avatarUrl: "https://github.com/avatar.png",
      accessTokenEnc: "enc_token_abc", scopes: "read:user public_repo",
    });
    const conn = await getGitHubConnectionByUserKey(env, "uk_test");
    assert.ok(conn, "connection should exist");
    assert.equal(conn.githubLogin, "testuser");
    assert.equal(conn.githubUserId, "12345");
    assert.equal(conn.accessTokenEnc, "enc_token_abc");
  });

  it("getGitHubConnectionByUserKey returns null when not connected", async () => {
    const env = makeEnv();
    const conn = await getGitHubConnectionByUserKey(env, "uk_nobody");
    assert.equal(conn, null);
  });
});

// ─── github-db: project repos ─────────────────────────────────────────────────

describe("github-db: project repos", () => {
  it("upsertProjectRepo + getProjectRepo round-trip", async () => {
    const env = makeEnv();
    await upsertProjectRepo(env, {
      projectId: "proj_test", userKey: "uk1", githubConnectionId: "wgc_abc",
      repoId: "789012", repoFullName: "owner/my-repo", repoOwner: "owner",
      repoName: "my-repo", defaultBranch: "main", private: false,
      htmlUrl: "https://github.com/owner/my-repo",
    });
    const repo = await getProjectRepo(env, "proj_test");
    assert.ok(repo, "repo should exist");
    assert.equal(repo.repoFullName, "owner/my-repo");
    assert.equal(repo.repoOwner, "owner");
    assert.equal(repo.private, false);
  });

  it("getProjectRepo returns null for unknown project", async () => {
    const env = makeEnv();
    const repo = await getProjectRepo(env, "proj_nonexistent");
    assert.equal(repo, null);
  });

  it("selectedItemIds serialized correctly in outcomes (spot check)", () => {
    const ids = ["req_001", "req_002", "req_003"];
    const json = JSON.stringify(ids);
    assert.deepEqual(JSON.parse(json), ids);
  });
});

// ─── Stage 273: GitHub disconnect ─────────────────────────────────────────────

async function seedConnection(env, userKey = "uk_disc") {
  await upsertGitHubConnection(env, {
    userKey, githubUserId: "9001", githubLogin: "founder",
    githubName: "Founder", avatarUrl: "https://github.com/a.png",
    accessTokenEnc: "enc_secret_token", scopes: "read:user public_repo",
  });
}

describe("POST /workspace/github/disconnect", () => {
  it("deletes the connection row including the encrypted token", async () => {
    const env = makeEnv();
    await seedConnection(env, "uk_disc");
    // Row (and encrypted token) exists before
    const before = [...env.DB.state.github_connections.values()];
    assert.equal(before.length, 1);
    assert.equal(before[0].access_token_enc, "enc_secret_token");

    const app = createApp();
    const resp = await app.fetch(new Request("http://localhost/workspace/github/disconnect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userKey: "uk_disc" }),
    }), env);
    assert.equal(resp.status, 200);
    const body = await resp.json();
    assert.equal(body.ok, true);
    assert.equal(body.disconnected, true);

    // Row is gone — no encrypted token left behind
    assert.equal(env.DB.state.github_connections.size, 0);
    assert.equal(await getGitHubConnectionByUserKey(env, "uk_disc"), null);
  });

  it("is idempotent — second call returns disconnected:false", async () => {
    const env = makeEnv();
    await seedConnection(env, "uk_disc");
    const app = createApp();
    const mkReq = () => new Request("http://localhost/workspace/github/disconnect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userKey: "uk_disc" }),
    });

    const first = await (await app.fetch(mkReq(), env)).json();
    assert.equal(first.disconnected, true);

    const resp2 = await app.fetch(mkReq(), env);
    assert.equal(resp2.status, 200);
    const second = await resp2.json();
    assert.equal(second.ok, true);
    assert.equal(second.disconnected, false);
  });

  it("returns 400 userKey_required when userKey is missing", async () => {
    const env = makeEnv();
    const app = createApp();
    const resp = await app.fetch(new Request("http://localhost/workspace/github/disconnect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }), env);
    assert.equal(resp.status, 400);
    const body = await resp.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "userKey_required");
  });

  it("status returns connected:false after disconnect", async () => {
    const env = makeEnv();
    await seedConnection(env, "uk_disc");
    const app = createApp();

    // Connected before
    const beforeResp = await app.fetch(new Request("http://localhost/workspace/github/status?userKey=uk_disc"), env);
    const before = await beforeResp.json();
    assert.equal(before.connected, true);
    assert.equal(before.user.login, "founder");

    await app.fetch(new Request("http://localhost/workspace/github/disconnect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userKey: "uk_disc" }),
    }), env);

    const afterResp = await app.fetch(new Request("http://localhost/workspace/github/status?userKey=uk_disc"), env);
    assert.equal(afterResp.status, 200);
    const after = await afterResp.json();
    assert.equal(after.ok, true);
    assert.equal(after.connected, false);
  });

  it("deleteGitHubConnectionsByUserKey removes every row for the userKey", async () => {
    const env = makeEnv();
    // Two different GitHub accounts bound to the same userKey over time
    await upsertGitHubConnection(env, {
      userKey: "uk_multi", githubUserId: "1", githubLogin: "acct-one",
      accessTokenEnc: "enc_one",
    });
    await upsertGitHubConnection(env, {
      userKey: "uk_multi", githubUserId: "2", githubLogin: "acct-two",
      accessTokenEnc: "enc_two",
    });
    assert.equal(env.DB.state.github_connections.size, 2);

    const deleted = await deleteGitHubConnectionsByUserKey(env, "uk_multi");
    assert.equal(deleted, true);
    assert.equal(env.DB.state.github_connections.size, 0);

    // No row → false
    assert.equal(await deleteGitHubConnectionsByUserKey(env, "uk_multi"), false);
  });
});

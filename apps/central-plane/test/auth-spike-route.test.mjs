/**
 * auth-spike-route.test.mjs
 *
 * Stage 209 — Better Auth LOCAL-ONLY route (/api/auth/*). Verifies the route is
 * disabled by default (503 auth_disabled), reports auth_not_configured when the
 * flag is on but no local secret is present, never leaks the secret, and mounts
 * safely inside the real router. Imports the built output (dist), matching the
 * repo test convention. The route is exercised through createApp() so the actual
 * router mount is covered.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../dist/router.js";

function makeEnv(overrides = {}) {
  return { DB: {}, ENVIRONMENT: "test", ...overrides };
}

async function fetchApp(app, path, init = {}, env = makeEnv()) {
  const req = new Request(`http://localhost${path}`, init);
  return app.fetch(req, env);
}

test("/api/auth/* returns 503 auth_disabled when AUTH_ENABLED is unset (production default)", async () => {
  const app = createApp();
  for (const env of [makeEnv(), makeEnv({ AUTH_ENABLED: "false" }), makeEnv({ AUTH_ENABLED: "1" })]) {
    const res = await fetchApp(app, "/api/auth/ok", {}, env);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, "auth_disabled");
  }
});

test("/api/auth/* returns 503 auth_disabled for any method/subpath by default", async () => {
  const app = createApp();
  const res = await fetchApp(app, "/api/auth/sign-in/email", { method: "POST" });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "auth_disabled");
});

test("/api/auth/* returns auth_not_configured when flag on but no local secret", async () => {
  const app = createApp();
  const res = await fetchApp(app, "/api/auth/ok", {}, makeEnv({ AUTH_ENABLED: "true" }));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "auth_not_configured");
});

test("disabled/not-configured responses never echo the secret value", async () => {
  const app = createApp();
  const secret = "super-secret-route-probe-value";
  // flag off, secret present (shouldn't matter — still auth_disabled)
  const off = await fetchApp(app, "/api/auth/ok", {}, makeEnv({ BETTER_AUTH_SECRET: secret }));
  assert.ok(!(await off.text()).includes(secret));
  // flag on, no secret -> not_configured
  const notCfg = await fetchApp(app, "/api/auth/ok", {}, makeEnv({ AUTH_ENABLED: "true" }));
  assert.ok(!(await notCfg.text()).includes(secret));
});

test("flag on + local secret: gate passes (not auth_disabled) and secret never leaks", async () => {
  const app = createApp();
  const secret = "super-secret-route-probe-value";
  const res = await fetchApp(
    app,
    "/api/auth/ok",
    {},
    makeEnv({ AUTH_ENABLED: "true", BETTER_AUTH_SECRET: secret }),
  );
  const text = await res.text();
  // The Better Auth handler (or the onError envelope) responds — what matters is
  // that the gate did NOT short-circuit to disabled/not_configured, and nothing
  // ever echoes the secret.
  assert.ok(!text.includes(secret), "response must never contain the secret");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (parsed && typeof parsed.error === "string") {
    assert.notEqual(parsed.error, "auth_disabled");
    assert.notEqual(parsed.error, "auth_not_configured");
  }
});

test("/api/auth/* does not collide with the existing /auth/github/callback surface", async () => {
  const app = createApp();
  // The saas-auth callback lives at /auth/github/callback (no /api prefix). A
  // bare GET there must NOT be swallowed by the auth-spike disabled gate.
  const res = await fetchApp(app, "/auth/github/callback");
  const body = await res.json().catch(() => ({}));
  assert.notEqual(body.error, "auth_disabled");
});

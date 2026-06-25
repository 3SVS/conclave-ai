/**
 * better-auth-spike.test.mjs
 *
 * Stage 204 — Better Auth LOCAL-ONLY spike. Verifies the flag helper stays OFF by default,
 * never exposes the secret, and the gated runtime stays disabled (null) in the production /
 * test path. Also proves the better-auth package resolves under the central-plane build.
 * Imports the built output (dist), matching the repo test convention.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getAuthSpikeConfig } from "../dist/auth-spike-config.js";
import { betterAuthAvailable, createBetterAuthSpike } from "../dist/better-auth-spike.js";

test("getAuthSpikeConfig defaults OFF and never throws on missing/odd env", () => {
  for (const bad of [undefined, {}, { AUTH_ENABLED: "false" }, { AUTH_ENABLED: "1" }, { AUTH_ENABLED: "" }]) {
    const c = getAuthSpikeConfig(bad);
    assert.equal(c.enabled, false);
    assert.equal(c.runtimeReady, false);
    assert.equal(c.productionSafe, true);
  }
});

test("enabled only when AUTH_ENABLED === 'true' (exact string)", () => {
  assert.equal(getAuthSpikeConfig({ AUTH_ENABLED: "true" }).enabled, true);
  assert.equal(getAuthSpikeConfig({ AUTH_ENABLED: "TRUE" }).enabled, false);
  assert.equal(getAuthSpikeConfig({ AUTH_ENABLED: "yes" }).enabled, false);
});

test("runtimeReady requires BOTH the flag and a present secret", () => {
  assert.equal(getAuthSpikeConfig({ AUTH_ENABLED: "true" }).runtimeReady, false); // no secret
  assert.equal(getAuthSpikeConfig({ BETTER_AUTH_SECRET: "x" }).runtimeReady, false); // flag off
  assert.equal(getAuthSpikeConfig({ AUTH_ENABLED: "true", BETTER_AUTH_SECRET: "x" }).runtimeReady, true);
});

test("provider defaults to better-auth and trims a custom value", () => {
  assert.equal(getAuthSpikeConfig({}).provider, "better-auth");
  assert.equal(getAuthSpikeConfig({ AUTH_PROVIDER: "  custom  " }).provider, "custom");
});

test("config never exposes the secret value or a secret field", () => {
  const c = getAuthSpikeConfig({ AUTH_ENABLED: "true", BETTER_AUTH_SECRET: "super-secret-value" });
  const blob = JSON.stringify(c);
  assert.ok(!blob.includes("super-secret-value"), "config must not echo the secret value");
  assert.equal("BETTER_AUTH_SECRET" in c, false);
});

test("better-auth package resolves + imports under the central-plane build", () => {
  assert.equal(betterAuthAvailable(), true);
});

test("createBetterAuthSpike stays disabled (null) in the production/test path", () => {
  assert.equal(createBetterAuthSpike(undefined), null);
  assert.equal(createBetterAuthSpike({}), null);
  assert.equal(createBetterAuthSpike({ AUTH_ENABLED: "true" }), null); // flag on but no secret -> still null
  assert.equal(createBetterAuthSpike({ BETTER_AUTH_SECRET: "x" }), null); // secret but flag off -> null
});

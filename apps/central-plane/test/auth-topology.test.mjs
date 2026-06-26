/**
 * auth-topology.test.mjs
 *
 * Stage 227 — Better Auth topology config (cookie/CORS readiness). Verifies the optional
 * env parsing is safe, additive, and fail-closed: no topology env → empty config (unchanged
 * behaviour); base URL + comma-separated trusted origins parsed and trimmed; empty/whitespace
 * values ignored. Imports the built output (dist), matching the repo test convention.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAuthTopologyConfig, parseTrustedOrigins } from "../dist/auth-topology.js";

test("no topology env → empty config (unchanged runtime behaviour)", () => {
  for (const env of [undefined, {}, { AUTH_ENABLED: "true", BETTER_AUTH_SECRET: "x", DB: {} }]) {
    assert.deepEqual(resolveAuthTopologyConfig(env), {});
  }
});

test("BETTER_AUTH_BASE_URL is parsed and trimmed; empty/whitespace ignored", () => {
  assert.deepEqual(resolveAuthTopologyConfig({ BETTER_AUTH_BASE_URL: "https://app.trysimsa.com" }), {
    baseURL: "https://app.trysimsa.com",
  });
  assert.deepEqual(resolveAuthTopologyConfig({ BETTER_AUTH_BASE_URL: "  https://app.trysimsa.com  " }), {
    baseURL: "https://app.trysimsa.com",
  });
  assert.deepEqual(resolveAuthTopologyConfig({ BETTER_AUTH_BASE_URL: "" }), {});
  assert.deepEqual(resolveAuthTopologyConfig({ BETTER_AUTH_BASE_URL: "   " }), {});
});

test("parseTrustedOrigins: comma list, trimmed, empties filtered", () => {
  assert.deepEqual(parseTrustedOrigins("https://app.trysimsa.com"), ["https://app.trysimsa.com"]);
  assert.deepEqual(parseTrustedOrigins("https://a.com, https://b.com ,https://c.com"), [
    "https://a.com",
    "https://b.com",
    "https://c.com",
  ]);
  assert.deepEqual(parseTrustedOrigins("https://a.com, ,, https://b.com,"), [
    "https://a.com",
    "https://b.com",
  ]);
  // empty / whitespace-only / non-string → undefined (fail closed to "unset")
  assert.equal(parseTrustedOrigins(""), undefined);
  assert.equal(parseTrustedOrigins("   "), undefined);
  assert.equal(parseTrustedOrigins(","), undefined);
  assert.equal(parseTrustedOrigins(undefined), undefined);
});

test("BETTER_AUTH_TRUSTED_ORIGINS parsed into config.trustedOrigins; empty ignored", () => {
  assert.deepEqual(resolveAuthTopologyConfig({ BETTER_AUTH_TRUSTED_ORIGINS: "https://app.trysimsa.com, https://x.dev" }), {
    trustedOrigins: ["https://app.trysimsa.com", "https://x.dev"],
  });
  assert.deepEqual(resolveAuthTopologyConfig({ BETTER_AUTH_TRUSTED_ORIGINS: "  ,  " }), {});
});

test("both fields together resolve into a combined config", () => {
  assert.deepEqual(
    resolveAuthTopologyConfig({
      BETTER_AUTH_BASE_URL: "https://app.trysimsa.com",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://app.trysimsa.com",
    }),
    { baseURL: "https://app.trysimsa.com", trustedOrigins: ["https://app.trysimsa.com"] },
  );
});

test("resolveAuthTopologyConfig never throws on odd input", () => {
  assert.doesNotThrow(() => resolveAuthTopologyConfig({ BETTER_AUTH_BASE_URL: 123 }));
  assert.doesNotThrow(() => resolveAuthTopologyConfig({ BETTER_AUTH_TRUSTED_ORIGINS: 123 }));
});

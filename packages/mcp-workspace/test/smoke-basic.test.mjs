// Stage 144 — MCP Basic local smoke harness tests.
// Imports runBasicSmoke (which imports the built dist server) and asserts the
// Basic-only registration + dispatch smoke passes with no credentials.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runBasicSmoke } from "../scripts/smoke-basic.mjs";

describe("MCP Basic smoke harness", () => {
  it("passes with no failures", () => {
    const r = runBasicSmoke();
    assert.deepEqual(r.failures, [], `unexpected failures: ${r.failures.join(", ")}`);
    assert.equal(r.ok, true);
  });

  it("reports Basic-only mode with exactly 9 tools", () => {
    const r = runBasicSmoke();
    assert.equal(r.mode, "basic_only");
    assert.equal(r.toolCount, 9);
  });

  it("verifies preview + handoff dispatch and a no-credential/no-network boundary", () => {
    const r = runBasicSmoke();
    assert.equal(r.previewOk, true);
    assert.equal(r.handoffOk, true);
    assert.equal(r.networkRequired, false);
    assert.equal(r.credentialsRequired, false);
  });

  it("does not require env and restores any credential env it cleared", () => {
    const SENTINEL = "uk_sentinel_do_not_use";
    const prev = process.env.CONCLAVE_USER_KEY;
    process.env.CONCLAVE_USER_KEY = SENTINEL;
    try {
      // Even with a userKey set, the smoke runs as Basic-only (it clears env first).
      const r = runBasicSmoke();
      assert.equal(r.ok, true);
      assert.equal(r.mode, "basic_only");
      // The env it cleared during the run is restored afterward.
      assert.equal(process.env.CONCLAVE_USER_KEY, SENTINEL);
    } finally {
      if (prev === undefined) delete process.env.CONCLAVE_USER_KEY;
      else process.env.CONCLAVE_USER_KEY = prev;
    }
  });
});

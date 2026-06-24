// Stage 150 — terminal stdio MCP smoke test.
// Spawns the built server as a real child process and drives the MCP protocol
// (initialize / tools/list / tools/call) via the SDK client. Requires the package
// to be built (CI builds before tests). Generous timeout; stable, not a transport
// race because runStdioSmoke awaits each step and always closes the process.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runStdioSmoke } from "../scripts/smoke-basic-stdio.mjs";

describe("MCP Basic stdio smoke", () => {
  it("initializes, lists 9 Basic tools, and calls preview + handoff over stdio", { timeout: 30000 }, async () => {
    const r = await runStdioSmoke();
    assert.deepEqual(r.failures, [], `unexpected failures: ${r.failures.join(", ")}`);
    assert.equal(r.ok, true);
    assert.equal(r.initialize, true);
    assert.equal(r.listed, true);
    assert.equal(r.mode, "basic_only");
    assert.equal(r.toolCount, 9);
    assert.equal(r.calls.preview_acceptance_map, true);
    assert.equal(r.calls.preview_stage_plan, true);
    assert.equal(r.calls.create_web_app_handoff_link, true);
    assert.equal(r.networkRequired, false);
    assert.equal(r.credentialsRequired, false);
  });
});

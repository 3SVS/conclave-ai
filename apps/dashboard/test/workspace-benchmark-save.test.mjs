// Stage 65: the Save-button gate (need 2–5 candidates to save a benchmark).
import { test } from "node:test";
import assert from "node:assert/strict";
import { canSaveBenchmark, MIN_CANDIDATES, MAX_CANDIDATES } from "../src/lib/agent-benchmark.mjs";

test("canSaveBenchmark requires 2–5 candidates", () => {
  assert.equal(canSaveBenchmark(0), false);
  assert.equal(canSaveBenchmark(1), false);
  assert.equal(canSaveBenchmark(2), true);
  assert.equal(canSaveBenchmark(3), true);
  assert.equal(canSaveBenchmark(5), true);
  assert.equal(canSaveBenchmark(6), false);
});

test("MIN/MAX candidate constants", () => {
  assert.equal(MIN_CANDIDATES, 2);
  assert.equal(MAX_CANDIDATES, 5);
});

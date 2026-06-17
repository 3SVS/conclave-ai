/**
 * Stage 45: source-vs-current run comparison (review-run-comparison).
 * Plain .mjs imports → Node 20 compatible under `node --test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  compareReviewRunResults,
  pickComparisonSourceRunId,
} from "../src/lib/review-run-comparison.mjs";

function item(itemId, status, title = itemId) {
  return { itemId, title, status, reason: "" };
}

// ─── source selection precedence ─────────────────────────────────────────────

test("query fromRunId takes priority over rerunOfReviewRunId", () => {
  assert.equal(
    pickComparisonSourceRunId({ fromRunId: "q", runId: "cur", rerunOfReviewRunId: "lineage" }),
    "q",
  );
});

test("rerunOfReviewRunId is used when fromRunId is absent", () => {
  assert.equal(
    pickComparisonSourceRunId({ fromRunId: null, runId: "cur", rerunOfReviewRunId: "lineage" }),
    "lineage",
  );
});

test("source selection ignores same runId (fromRunId === current)", () => {
  assert.equal(
    pickComparisonSourceRunId({ fromRunId: "cur", runId: "cur", rerunOfReviewRunId: "lineage" }),
    "lineage", // falls through to lineage
  );
});

test("source selection ignores same runId (lineage === current) → null", () => {
  assert.equal(
    pickComparisonSourceRunId({ fromRunId: null, runId: "cur", rerunOfReviewRunId: "cur" }),
    null,
  );
});

test("no source when neither present", () => {
  assert.equal(pickComparisonSourceRunId({ fromRunId: null, runId: "cur" }), null);
});

// ─── classification ──────────────────────────────────────────────────────────

test("classifies improved / stillOpen / newlyProblematic / unchanged", () => {
  const source = [
    item("a", "failed"),    // → passed   = improved
    item("b", "failed"),    // → failed   = stillOpen
    item("c", "passed"),    // → failed   = newlyProblematic
    item("d", "passed"),    // → passed   = unchanged
  ];
  const current = [
    item("a", "passed"),
    item("b", "failed"),
    item("c", "failed"),
    item("d", "passed"),
  ];
  const cmp = compareReviewRunResults({ sourceResults: source, currentResults: current });
  assert.equal(cmp.comparable, true);
  assert.deepEqual(cmp.improved.map((i) => i.itemId), ["a"]);
  assert.deepEqual(cmp.stillOpen.map((i) => i.itemId), ["b"]);
  assert.deepEqual(cmp.newlyProblematic.map((i) => i.itemId), ["c"]);
  assert.deepEqual(cmp.unchanged.map((i) => i.itemId), ["d"]);
});

test("summary counts match the groups", () => {
  const cmp = compareReviewRunResults({
    sourceResults: [item("a", "failed"), item("b", "passed")],
    currentResults: [item("a", "passed"), item("b", "failed")],
  });
  assert.deepEqual(cmp.summary, { improved: 1, stillOpen: 0, newlyProblematic: 1, unchanged: 0 });
});

test("partial-credit improvement (failed → inconclusive) counts as improved", () => {
  const cmp = compareReviewRunResults({
    sourceResults: [item("a", "failed")],
    currentResults: [item("a", "inconclusive")],
  });
  assert.deepEqual(cmp.improved.map((i) => i.itemId), ["a"]);
});

test("current-only item: non-passed → stillOpen, passed → unchanged", () => {
  const cmp = compareReviewRunResults({
    sourceResults: [item("a", "failed")],
    currentResults: [item("a", "failed"), item("new1", "failed"), item("new2", "passed")],
  });
  assert.ok(cmp.stillOpen.some((i) => i.itemId === "new1"));
  assert.ok(cmp.unchanged.some((i) => i.itemId === "new2"));
});

// ─── not comparable ──────────────────────────────────────────────────────────

test("missing source results → comparable false, reason missing_source_results", () => {
  const cmp = compareReviewRunResults({ sourceResults: [], currentResults: [item("a", "failed")] });
  assert.equal(cmp.comparable, false);
  assert.equal(cmp.reason, "missing_source_results");
  assert.deepEqual(cmp.summary, { improved: 0, stillOpen: 0, newlyProblematic: 0, unchanged: 0 });
});

test("missing current results → comparable false, reason missing_current_results", () => {
  const cmp = compareReviewRunResults({ sourceResults: [item("a", "failed")], currentResults: [] });
  assert.equal(cmp.comparable, false);
  assert.equal(cmp.reason, "missing_current_results");
});

test("non-array inputs are handled as not comparable", () => {
  const cmp = compareReviewRunResults({ sourceResults: undefined, currentResults: undefined });
  assert.equal(cmp.comparable, false);
  assert.equal(cmp.reason, "missing_source_results");
});

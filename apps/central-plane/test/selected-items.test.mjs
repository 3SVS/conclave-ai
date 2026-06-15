/**
 * Stage 40: normalizeSelectedItemIds — defensive normalization of the
 * user-supplied selectedItemIds re-run payload.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { normalizeSelectedItemIds, MAX_SELECTED_ITEMS, recommendedRerunItemIds } = await import("../dist/workspace/selected-items.js");

test("returns undefined when input is not an array", () => {
  assert.equal(normalizeSelectedItemIds(undefined), undefined);
  assert.equal(normalizeSelectedItemIds(null), undefined);
  assert.equal(normalizeSelectedItemIds("a,b"), undefined);
  assert.equal(normalizeSelectedItemIds({ 0: "a" }), undefined);
});

test("returns [] for an empty array (provided but nothing usable)", () => {
  assert.deepEqual(normalizeSelectedItemIds([]), []);
});

test("drops non-string entries", () => {
  assert.deepEqual(normalizeSelectedItemIds(["a", 1, null, true, "b"]), ["a", "b"]);
});

test("trims whitespace and drops empty / whitespace-only strings", () => {
  assert.deepEqual(normalizeSelectedItemIds(["  a  ", "", "   ", "b"]), ["a", "b"]);
});

test("de-duplicates, preserving first-seen order", () => {
  assert.deepEqual(normalizeSelectedItemIds(["b", "a", "b", "a", "c"]), ["b", "a", "c"]);
});

test("de-dupes after trimming (same id with padding collapses)", () => {
  assert.deepEqual(normalizeSelectedItemIds(["a", " a ", "a"]), ["a"]);
});

test("caps the count at MAX_SELECTED_ITEMS", () => {
  const many = Array.from({ length: MAX_SELECTED_ITEMS + 50 }, (_, i) => `item_${i}`);
  const out = normalizeSelectedItemIds(many);
  assert.equal(out.length, MAX_SELECTED_ITEMS);
  assert.equal(out[0], "item_0");
});

test("realistic re-run payload passes through unchanged", () => {
  assert.deepEqual(
    normalizeSelectedItemIds(["req_002", "req_005", "req_009"]),
    ["req_002", "req_005", "req_009"],
  );
});

// ─── Stage 41: recommendedRerunItemIds ──────────────────────────────────────

const MIXED = [
  { itemId: "a", status: "passed" },
  { itemId: "b", status: "failed" },
  { itemId: "c", status: "inconclusive" },
  { itemId: "d", status: "needs_decision" },
  { itemId: "e", status: "passed" },
];

test("recommendedRerunItemIds includes failed / inconclusive / needs_decision only", () => {
  assert.deepEqual(recommendedRerunItemIds(MIXED), ["b", "c", "d"]);
});

test("recommendedRerunItemIds excludes passed", () => {
  const ids = recommendedRerunItemIds(MIXED);
  assert.ok(!ids.includes("a"));
  assert.ok(!ids.includes("e"));
});

test("recommendedRerunItemIds is empty when all passed (no remaining issues)", () => {
  assert.deepEqual(
    recommendedRerunItemIds([
      { itemId: "x", status: "passed" },
      { itemId: "y", status: "passed" },
    ]),
    [],
  );
});

test("recommendedRerunItemIds is empty for empty results", () => {
  assert.deepEqual(recommendedRerunItemIds([]), []);
});

/**
 * Stage 44: client-side selection persistence (review-selection-storage).
 * Runs under `node --test` (plain .mjs imports → Node 20 compatible).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildReviewSelectionStorageKey,
  normalizeStoredSelectedItemIds,
  readStoredReviewSelection,
  writeStoredReviewSelection,
  clearStoredReviewSelection,
} from "../src/lib/review-selection-storage.mjs";
import { canRerun } from "../src/lib/rerun-selection.mjs";

// ─── Mock storage ────────────────────────────────────────────────────────────

function makeStorage(initial = {}, opts = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(k) { if (opts.throwOnGet) throw new Error("blocked"); return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { if (opts.throwOnSet) throw new Error("quota exceeded"); data.set(k, v); },
    removeItem(k) { if (opts.throwOnRemove) throw new Error("blocked"); data.delete(k); },
    _data: data,
  };
}

const KEY = "conclave:review-selection:v1:proj1:wprr_1";

// ─── key ─────────────────────────────────────────────────────────────────────

test("buildReviewSelectionStorageKey includes version, projectId, runId", () => {
  const key = buildReviewSelectionStorageKey({ projectId: "proj1", runId: "wprr_1" });
  assert.equal(key, KEY);
  assert.ok(key.includes(":v1:"));
  assert.ok(key.includes("proj1"));
  assert.ok(key.includes("wprr_1"));
});

// ─── normalize ───────────────────────────────────────────────────────────────

test("normalizeStoredSelectedItemIds filters stale + dedups (first-seen order)", () => {
  assert.deepEqual(
    normalizeStoredSelectedItemIds({ stored: ["b", "x", "a", "b"], validItemIds: ["a", "b", "c"] }),
    ["b", "a"],
  );
});

test("normalizeStoredSelectedItemIds returns [] for non-array", () => {
  assert.deepEqual(normalizeStoredSelectedItemIds({ stored: "nope", validItemIds: ["a"] }), []);
  assert.deepEqual(normalizeStoredSelectedItemIds({ stored: null, validItemIds: ["a"] }), []);
});

// ─── read ────────────────────────────────────────────────────────────────────

test("readStoredReviewSelection returns null when no value", () => {
  const out = readStoredReviewSelection({ storage: makeStorage(), key: KEY, validItemIds: ["a"] });
  assert.equal(out, null);
});

test("readStoredReviewSelection preserves [] as intentional empty selection", () => {
  const storage = makeStorage({ [KEY]: "[]" });
  const out = readStoredReviewSelection({ storage, key: KEY, validItemIds: ["a", "b"] });
  assert.notEqual(out, null);
  assert.deepEqual(out, []);
});

test("readStoredReviewSelection filters stale itemIds", () => {
  const storage = makeStorage({ [KEY]: JSON.stringify(["a", "gone", "b"]) });
  const out = readStoredReviewSelection({ storage, key: KEY, validItemIds: ["a", "b"] });
  assert.deepEqual(out, ["a", "b"]);
});

test("readStoredReviewSelection dedups itemIds", () => {
  const storage = makeStorage({ [KEY]: JSON.stringify(["a", "a", "b", "a"]) });
  const out = readStoredReviewSelection({ storage, key: KEY, validItemIds: ["a", "b"] });
  assert.deepEqual(out, ["a", "b"]);
});

test("readStoredReviewSelection handles invalid JSON safely (→ null)", () => {
  const storage = makeStorage({ [KEY]: "{not json" });
  const out = readStoredReviewSelection({ storage, key: KEY, validItemIds: ["a"] });
  assert.equal(out, null);
});

test("readStoredReviewSelection returns null for non-array JSON", () => {
  const storage = makeStorage({ [KEY]: JSON.stringify({ a: 1 }) });
  const out = readStoredReviewSelection({ storage, key: KEY, validItemIds: ["a"] });
  assert.equal(out, null);
});

test("readStoredReviewSelection returns null on storage getItem error", () => {
  const storage = makeStorage({ [KEY]: "[]" }, { throwOnGet: true });
  const out = readStoredReviewSelection({ storage, key: KEY, validItemIds: ["a"] });
  assert.equal(out, null);
});

// ─── write ───────────────────────────────────────────────────────────────────

test("writeStoredReviewSelection serializes selected ids", () => {
  const storage = makeStorage();
  const ok = writeStoredReviewSelection({ storage, key: KEY, selectedItemIds: ["b", "a"] });
  assert.equal(ok, true);
  assert.equal(storage._data.get(KEY), '["b","a"]');
});

test("writeStoredReviewSelection returns false on storage error", () => {
  const storage = makeStorage({}, { throwOnSet: true });
  const ok = writeStoredReviewSelection({ storage, key: KEY, selectedItemIds: ["a"] });
  assert.equal(ok, false);
});

// ─── clear ───────────────────────────────────────────────────────────────────

test("clearStoredReviewSelection removes the key", () => {
  const storage = makeStorage({ [KEY]: "[]" });
  const ok = clearStoredReviewSelection({ storage, key: KEY });
  assert.equal(ok, true);
  assert.equal(storage._data.has(KEY), false);
});

test("clearStoredReviewSelection returns false on storage error", () => {
  const storage = makeStorage({ [KEY]: "[]" }, { throwOnRemove: true });
  assert.equal(clearStoredReviewSelection({ storage, key: KEY }), false);
});

// ─── restore precedence (page logic) ─────────────────────────────────────────

test("run detail restores stored selection before recommended fallback", () => {
  const valid = ["a", "b", "c"];
  const recommended = ["b", "c"];
  const storage = makeStorage({ [KEY]: JSON.stringify(["a"]) });
  const stored = readStoredReviewSelection({ storage, key: KEY, validItemIds: valid });
  const selection = stored !== null ? stored : recommended;
  assert.deepEqual(selection, ["a"]); // stored wins over recommended
});

test("recommended is used when nothing is stored", () => {
  const recommended = ["b", "c"];
  const stored = readStoredReviewSelection({ storage: makeStorage(), key: KEY, validItemIds: ["a", "b", "c"] });
  const selection = stored !== null ? stored : recommended;
  assert.deepEqual(selection, recommended);
});

test("action=fix-pack uses stored selection when present", () => {
  const recommended = ["b", "c"];
  const storage = makeStorage({ [KEY]: JSON.stringify(["a", "b"]) });
  const stored = readStoredReviewSelection({ storage, key: KEY, validItemIds: ["a", "b", "c"] });
  const selection = stored !== null ? stored : recommended;
  assert.deepEqual(selection, ["a", "b"]); // autoGenerate would use this
});

test("stored [] prevents auto generation (intentional empty)", () => {
  const storage = makeStorage({ [KEY]: "[]" });
  const stored = readStoredReviewSelection({ storage, key: KEY, validItemIds: ["a", "b"] });
  assert.deepEqual(stored, []);
  const selection = stored !== null ? stored : ["a"]; // [] wins over recommended
  assert.equal(canRerun(selection.length), false); // FixPackPanel autoOpen guard → no generation
});

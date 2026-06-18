import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  LOCALES,
  DEFAULT_LOCALE,
  DICTIONARIES,
  normalizeLocale,
  getDictionary,
  statusLabel,
  statusDescription,
  readStoredLocale,
  writeStoredLocale,
  LOCALE_STORAGE_KEY,
} from "../src/i18n/dictionary.mjs";

/** Deep set of dotted key paths in an object (leaves only). */
function keyPaths(obj, prefix = "") {
  const out = new Set();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") for (const p of keyPaths(v, path)) out.add(p);
    else out.add(path);
  }
  return out;
}

describe("i18n dictionary", () => {
  it("default locale is English", () => {
    assert.equal(DEFAULT_LOCALE, "en");
    assert.deepEqual(LOCALES, ["en", "ko"]);
  });

  it("en and ko have identical key structures (no missing keys)", () => {
    const en = keyPaths(DICTIONARIES.en);
    const ko = keyPaths(DICTIONARIES.ko);
    const missingInKo = [...en].filter((k) => !ko.has(k));
    const missingInEn = [...ko].filter((k) => !en.has(k));
    assert.deepEqual(missingInKo, [], `keys missing in ko: ${missingInKo.join(", ")}`);
    assert.deepEqual(missingInEn, [], `keys missing in en: ${missingInEn.join(", ")}`);
  });

  it("core status labels map to the product-friendly English copy", () => {
    const en = getDictionary("en");
    assert.equal(statusLabel(en, "passed"), "Passed");
    assert.equal(statusLabel(en, "failed"), "Issue found");
    assert.equal(statusLabel(en, "inconclusive"), "Not verified");
    assert.equal(statusLabel(en, "needs_decision"), "Needs decision");
  });

  it("korean keeps human labels", () => {
    const ko = getDictionary("ko");
    assert.equal(statusLabel(ko, "passed"), "통과");
    assert.equal(statusLabel(ko, "failed"), "안 맞음");
    assert.equal(statusLabel(ko, "inconclusive"), "확인 부족");
  });

  it("every core status has a non-empty description in both locales", () => {
    for (const loc of LOCALES) {
      const d = getDictionary(loc);
      for (const s of ["passed", "failed", "inconclusive", "needs_decision"]) {
        assert.ok(statusDescription(d, s).length > 0, `${loc}.${s} desc empty`);
      }
    }
  });

  it("core GitHub-workflow / review / history keys exist in both locales", () => {
    for (const loc of LOCALES) {
      const d = getDictionary(loc);
      for (const k of [
        "connectGithub", "manualTitle", "manualHint", "runReview",
        "createFixInstructions", "viewHistory", "errorPrivate", "reposLoadError",
      ]) {
        assert.ok(d.github[k] && d.github[k].length > 0, `${loc}.github.${k} missing`);
      }
      assert.ok(d.review.resultsTitle.length > 0, `${loc}.review.resultsTitle missing`);
      for (const k of ["title", "desc", "emptyTitle", "emptyBody"]) {
        assert.ok(d.history[k] && d.history[k].length > 0, `${loc}.history.${k} missing`);
      }
    }
  });

  it("normalizeLocale falls back to en for unknown values", () => {
    assert.equal(normalizeLocale("ko"), "ko");
    assert.equal(normalizeLocale("en"), "en");
    assert.equal(normalizeLocale("fr"), "en");
    assert.equal(normalizeLocale(null), "en");
    assert.equal(normalizeLocale(undefined), "en");
  });

  it("statusLabel returns the raw status when unknown (never crashes)", () => {
    assert.equal(statusLabel(getDictionary("en"), "weird_status"), "weird_status");
  });

  it("readStoredLocale / writeStoredLocale round-trip via a StorageLike", () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    assert.equal(readStoredLocale(storage), "en"); // nothing stored → default
    writeStoredLocale(storage, "ko");
    assert.equal(store.get(LOCALE_STORAGE_KEY), "ko");
    assert.equal(readStoredLocale(storage), "ko");
    writeStoredLocale(storage, "bogus"); // normalized
    assert.equal(readStoredLocale(storage), "en");
  });

  it("storage helpers never throw on null/throwing storage", () => {
    assert.equal(readStoredLocale(null), "en");
    const throwing = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    assert.equal(readStoredLocale(throwing), "en");
    assert.doesNotThrow(() => writeStoredLocale(throwing, "ko"));
  });
});

// Stage 81: pure display helpers for the project-level Evolution Learning
// Signals card. The aggregation itself is computed server-side; tests here
// cover the label mapping + delta/rate formatting.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  topSignalLabelKey,
  formatRatePercent,
  formatAverageDeltaPercent,
  formatAverageDeltaCount,
  learningHasNoData,
} from "../src/lib/project-evolution-learning.mjs";
import { DICTIONARIES } from "../src/i18n/dictionary.mjs";

const s = DICTIONARIES.en.evolution;

test("topSignalLabelKey returns a real dictionary key for every signal type", () => {
  for (const type of ["action_often_improves", "action_often_regresses", "not_enough_data"]) {
    const key = topSignalLabelKey({ type });
    assert.ok(s[key], `expected dictionary entry for signal ${type} (key=${key})`);
  }
  // Fallback for unknown / null / undefined input.
  assert.equal(topSignalLabelKey(null), "signalNotEnoughData");
  assert.equal(topSignalLabelKey(undefined), "signalNotEnoughData");
  assert.equal(topSignalLabelKey({ type: "wat" }), "signalNotEnoughData");
});

test("formatRatePercent rounds and never adds sign", () => {
  assert.equal(formatRatePercent(0.75), "75%");
  assert.equal(formatRatePercent(0), "0%");
  assert.equal(formatRatePercent(1), "100%");
  assert.equal(formatRatePercent(null), "—");
  assert.equal(formatRatePercent(undefined), "—");
});

test("formatAverageDeltaPercent: signed percentage with null fallback", () => {
  assert.equal(formatAverageDeltaPercent(0.123), "+12%");
  assert.equal(formatAverageDeltaPercent(-0.05), "-5%");
  assert.equal(formatAverageDeltaPercent(0), "0%");
  assert.equal(formatAverageDeltaPercent(null), "—");
  assert.equal(formatAverageDeltaPercent(undefined), "—");
});

test("formatAverageDeltaCount: one decimal + signed, null fallback", () => {
  assert.equal(formatAverageDeltaCount(2), "+2");
  assert.equal(formatAverageDeltaCount(1.4567), "+1.5");
  assert.equal(formatAverageDeltaCount(-1.5), "-1.5");
  assert.equal(formatAverageDeltaCount(0), "0");
  assert.equal(formatAverageDeltaCount(null), "—");
});

test("learningHasNoData: true when missing / no packs / no followed / no comparable", () => {
  assert.equal(learningHasNoData(null), true);
  assert.equal(learningHasNoData(undefined), true);
  assert.equal(learningHasNoData({ actionPackCount: 0, followedPackCount: 0, comparablePackCount: 0 }), true);
  assert.equal(learningHasNoData({ actionPackCount: 3, followedPackCount: 0, comparablePackCount: 0 }), true);
  assert.equal(learningHasNoData({ actionPackCount: 3, followedPackCount: 3, comparablePackCount: 0 }), true);
  assert.equal(learningHasNoData({ actionPackCount: 3, followedPackCount: 3, comparablePackCount: 2 }), false);
});

test("disclaimer + empty-state strings live in the dictionary", () => {
  // These are surface-only — assert presence so a future i18n rename does not
  // leave the UI with stringified keys.
  assert.ok(s.learningEmpty);
  assert.ok(s.learningNotEnoughData);
  assert.ok(s.learningDisclaimer);
  assert.ok(s.learningTopSignals);
  assert.ok(s.learningEffectiveness);
});

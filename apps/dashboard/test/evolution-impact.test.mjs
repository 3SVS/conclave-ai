// Stage 79: pure display helpers for the saved-pack Evolution Impact card.
// The impact comparison itself is computed server-side; this module only
// formats the response, so tests here cover the label/format mapping.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMPACT_VERDICTS,
  impactVerdictLabelKey,
  impactReasonLabelKey,
  formatDeltaInt,
  formatDeltaPercent,
  formatRate,
  isImpactEmpty,
} from "../src/lib/evolution-impact.mjs";
import { DICTIONARIES } from "../src/i18n/dictionary.mjs";

const s = DICTIONARIES.en.evolution;

test("IMPACT_VERDICTS lists the four spec verdicts", () => {
  assert.deepEqual([...IMPACT_VERDICTS].sort(), [
    "improved",
    "inconclusive",
    "regressed",
    "unchanged",
  ]);
});

test("impactVerdictLabelKey returns a real dictionary key for every verdict", () => {
  for (const v of IMPACT_VERDICTS) {
    const key = impactVerdictLabelKey(v);
    assert.ok(s[key], `expected dictionary entry for verdict ${v} (key=${key})`);
  }
  // Fallback for unknown input still maps to a real key.
  assert.equal(impactVerdictLabelKey(null), "verdictInconclusive");
  assert.equal(impactVerdictLabelKey("wat"), "verdictInconclusive");
});

test("impactReasonLabelKey covers every reason emitted by the central helper", () => {
  const REASONS = [
    "pass_rate_increased",
    "critical_issues_decreased",
    "blockers_decreased",
    "not_verified_decreased",
    "pass_rate_decreased",
    "critical_issues_increased",
    "blockers_increased",
    "missing_followup",
    "missing_before",
    "missing_after",
    "different_acceptance_set",
    "mixed_signals",
  ];
  for (const r of REASONS) {
    const key = impactReasonLabelKey(r);
    assert.ok(s[key], `expected dictionary entry for reason ${r} (key=${key})`);
  }
});

test("formatDeltaInt: explicit + sign, 0, negative, null fallback", () => {
  assert.equal(formatDeltaInt(3), "+3");
  assert.equal(formatDeltaInt(0), "0");
  assert.equal(formatDeltaInt(-2), "-2");
  assert.equal(formatDeltaInt(null), "—");
  assert.equal(formatDeltaInt(undefined), "—");
});

test("formatDeltaPercent: rounds and adds + sign", () => {
  assert.equal(formatDeltaPercent(0.123), "+12%");
  assert.equal(formatDeltaPercent(-0.05), "-5%");
  assert.equal(formatDeltaPercent(0), "0%");
  assert.equal(formatDeltaPercent(null), "—");
});

test("formatRate: 0..1 → percentage label, null falls back", () => {
  assert.equal(formatRate(0.875), "88%");
  assert.equal(formatRate(0), "0%");
  assert.equal(formatRate(null), "—");
  assert.equal(formatRate(undefined), "—");
});

test("isImpactEmpty: true when missing impact or both snapshots are null", () => {
  assert.equal(isImpactEmpty(null), true);
  assert.equal(isImpactEmpty(undefined), true);
  assert.equal(isImpactEmpty({ before: null, after: null }), true);
  assert.equal(isImpactEmpty({ before: { passedCount: 1 }, after: null }), false);
});

test("impactReasonLabelKey falls back to reasonMissingFollowup on unknown input", () => {
  assert.equal(impactReasonLabelKey("garbage"), "reasonMissingFollowup");
});

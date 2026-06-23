// Stage 120 — onboarding/legend/safety copy tests. Ensures preview-only language
// never claims completion, and safety notes carry the right warnings.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ONBOARDING_HEADING,
  ONBOARDING_INTRO,
  ONBOARDING_STEPS,
  ONBOARDING_SAFETY_LINE,
  PREVIEW_LANGUAGE_ITEMS,
  BETA_SAFETY_NOTES,
  EMPTY_STATES,
} from "../src/lib/beta-onboarding.mjs";

// Positive completion claims that must not appear in onboarding/legend copy.
// (Disclaimers phrase these negatively, e.g. "does not execute agents", so we
// check the legend + step copy, not the negative safety lines.)
const FORBIDDEN = ["passed", "verified", "completed", "production ready", "winner selected"];

test("onboarding heading + intro + 4 steps present", () => {
  assert.ok(ONBOARDING_HEADING.length > 0);
  assert.match(ONBOARDING_INTRO, /Simsa/);
  assert.equal(ONBOARDING_STEPS.length, 4);
  for (const s of ONBOARDING_STEPS) assert.ok(s.length > 0);
});

test("safety line says it does NOT execute agents / collect evidence / run benchmarks / make decisions", () => {
  const s = ONBOARDING_SAFETY_LINE.toLowerCase();
  assert.match(s, /does not execute agents/);
  assert.match(s, /collect evidence/);
  assert.match(s, /run benchmarks/);
  assert.match(s, /final decisions/);
});

test("preview language legend has the 5 terms and no completion claims", () => {
  assert.equal(PREVIEW_LANGUAGE_ITEMS.length, 5);
  const blob = PREVIEW_LANGUAGE_ITEMS.map((i) => `${i.term} ${i.meaning}`).join(" ").toLowerCase();
  // "not verified" is allowed; strip it before scanning for "verified".
  const scan = blob.replace(/not verified/g, "");
  for (const w of FORBIDDEN) {
    assert.ok(!scan.includes(w), `legend must not claim "${w}"`);
  }
  for (const i of PREVIEW_LANGUAGE_ITEMS) {
    assert.ok(i.term.length > 0 && i.meaning.length > 0);
  }
});

test("safety notes: before-input discourages secrets/tokens/sensitive data", () => {
  const s = BETA_SAFETY_NOTES.beforeInput.toLowerCase();
  assert.match(s, /secret|token|sensitive/);
});

test("safety notes: saved scope is honest about tenant-scoping-not-auth", () => {
  const s = BETA_SAFETY_NOTES.savedScope.toLowerCase();
  assert.match(s, /not full team authentication/);
});

test("safety notes: retention note mentions archive/delete", () => {
  const s = BETA_SAFETY_NOTES.savedRetention.toLowerCase();
  assert.match(s, /archive or delete/);
});

test("safety notes: feedback note says safe context only", () => {
  assert.match(BETA_SAFETY_NOTES.feedback.toLowerCase(), /safe context only/);
});

test("empty states present and non-empty", () => {
  assert.ok(EMPTY_STATES.beforeInput.length > 0);
  assert.match(EMPTY_STATES.noSavedRecords.toLowerCase(), /no saved workflow plans yet/);
  assert.match(EMPTY_STATES.noOpenedRecord.toLowerCase(), /open a saved workflow plan/);
});

test("no copy encourages sharing secrets/tokens", () => {
  const all = [
    ONBOARDING_INTRO,
    ONBOARDING_SAFETY_LINE,
    ...ONBOARDING_STEPS,
    ...PREVIEW_LANGUAGE_ITEMS.map((i) => i.meaning),
    ...Object.values(BETA_SAFETY_NOTES),
    ...Object.values(EMPTY_STATES),
  ]
    .join(" ")
    .toLowerCase();
  // Must not invite including secrets/tokens (only the discourage note mentions them).
  assert.ok(!/include (your )?(secret|token)/.test(all));
  assert.ok(!/paste (your )?(secret|token)/.test(all));
});

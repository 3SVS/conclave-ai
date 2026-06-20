import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeLabelKey, actionLabelKey, reasonLabelKey } from "../src/lib/outcome-labels.mjs";
import { DICTIONARIES } from "../src/i18n/dictionary.mjs";
const { en: EN, ko: KO } = DICTIONARIES;

test("gradeLabelKey maps every grade to an existing outcome key", () => {
  for (const g of ["strong", "promising", "needs_work", "inconclusive"]) {
    const key = gradeLabelKey(g);
    assert.ok(key in EN.outcome, `EN.outcome.${key} missing for ${g}`);
    assert.ok(key in KO.outcome, `KO.outcome.${key} missing for ${g}`);
  }
  assert.equal(gradeLabelKey("strong"), "gradeStrong");
  assert.equal(gradeLabelKey("needs_work"), "gradeNeedsWork");
});

test("gradeLabelKey falls back to inconclusive for unknown", () => {
  assert.equal(gradeLabelKey("???"), "gradeInconclusive");
});

test("actionLabelKey maps every action to an existing outcome key", () => {
  for (const a of ["accept", "fix_selected", "rerun_experiment", "clarify_acceptance_items", "create_benchmark"]) {
    const key = actionLabelKey(a);
    assert.ok(key in EN.outcome, `EN.outcome.${key} missing for ${a}`);
    assert.ok(key in KO.outcome, `KO.outcome.${key} missing for ${a}`);
  }
  assert.equal(actionLabelKey("create_benchmark"), "actionCreateBenchmark");
});

test("actionLabelKey falls back to accept for unknown", () => {
  assert.equal(actionLabelKey("???"), "actionAccept");
});

test("reasonLabelKey maps every reason code to an existing outcome key", () => {
  for (const r of [
    "selected_candidate_has_remaining_blockers",
    "acceptance_set_misaligned",
    "high_not_verified_count",
    "strong_acceptance_result",
    "missing_benchmark",
    "missing_selected_candidate",
  ]) {
    const key = reasonLabelKey(r);
    assert.ok(key in EN.outcome, `EN.outcome.${key} missing for ${r}`);
    assert.ok(key in KO.outcome, `KO.outcome.${key} missing for ${r}`);
  }
});

test("reasonLabelKey returns the code itself for unknown (defensive)", () => {
  assert.equal(reasonLabelKey("brand_new_reason"), "brand_new_reason");
});

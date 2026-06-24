// Stage 174 — SimsaStampThinking render-config tests (pure, node --test).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveStampThinking,
  getDefaultStampThinkingSteps,
  STAMP_THINKING_VARIANTS,
  DEFAULT_STAMP_LABEL,
} from "../src/lib/stamp-thinking.mjs";
import { getDictionary } from "../src/i18n/dictionary.mjs";

describe("resolveStampThinking", () => {
  it("defaults to the compact variant with 3 dots and the default label", () => {
    const c = resolveStampThinking();
    assert.equal(c.variant, "compact");
    assert.equal(c.dotCount, 3);
    assert.equal(c.dots.length, 3);
    assert.equal(c.label, DEFAULT_STAMP_LABEL);
    assert.equal(c.showVisibleLabel, false);
  });

  it("panel variant has 5 dots and shows the visible label", () => {
    const c = resolveStampThinking({ variant: "panel" });
    assert.equal(c.variant, "panel");
    assert.equal(c.dotCount, 5);
    assert.equal(c.dots.length, 5);
    assert.equal(c.showVisibleLabel, true);
  });

  it("uses a custom label when provided", () => {
    const c = resolveStampThinking({ variant: "panel", label: "Preparing acceptance context…" });
    assert.equal(c.label, "Preparing acceptance context…");
  });

  it("uses the first stepLabel as the current label (cycling deferred)", () => {
    const c = resolveStampThinking({ stepLabels: ["Stamping review trace…", "Finalizing review…"] });
    assert.equal(c.label, "Stamping review trace…");
  });

  it("falls back to the default label for empty/whitespace input", () => {
    assert.equal(resolveStampThinking({ label: "   " }).label, DEFAULT_STAMP_LABEL);
    assert.equal(resolveStampThinking({ stepLabels: ["  ", ""] }).label, DEFAULT_STAMP_LABEL);
  });

  it("coerces an unknown variant to compact", () => {
    assert.equal(resolveStampThinking({ variant: "bogus" }).variant, "compact");
    assert.deepEqual(STAMP_THINKING_VARIANTS, ["compact", "panel"]);
  });

  it("always exposes accessible status semantics", () => {
    const c = resolveStampThinking({ variant: "panel" });
    assert.deepEqual(c.a11y, { role: "status", ariaLive: "polite", ariaBusy: true });
  });

  it("assigns sequential checkpoint animation delays", () => {
    const delays = resolveStampThinking({ variant: "panel" }).dots.map((d) => d.delayMs);
    assert.deepEqual(delays, [0, 200, 400, 600, 800]);
  });

  it("explicit label overrides stepLabels", () => {
    const c = resolveStampThinking({ label: "Custom…", stepLabels: ["Reviewing evidence…"] });
    assert.equal(c.label, "Custom…");
  });

  it("never throws on malformed input", () => {
    for (const bad of [null, undefined, 7, "x", [], { variant: 1, label: 2, stepLabels: 3 }]) {
      assert.doesNotThrow(() => resolveStampThinking(bad));
    }
  });
});

describe("getDefaultStampThinkingSteps", () => {
  it("returns the ordered EN review-step labels from the loading dictionary", () => {
    const steps = getDefaultStampThinkingSteps(getDictionary("en").loading);
    assert.deepEqual(steps, [
      "Reviewing evidence…",
      "Preparing acceptance context…",
      "Checking acceptance signals…",
      "Marking evidence checkpoints…",
      "Stamping review trace…",
      "Finalizing review…",
    ]);
  });

  it("returns the ordered KO review-step labels from the loading dictionary", () => {
    const steps = getDefaultStampThinkingSteps(getDictionary("ko").loading);
    assert.equal(steps.length, 6);
    assert.equal(steps[0], "증거를 검토하는 중…");
    assert.equal(steps[5], "리뷰를 마무리하는 중…");
  });

  it("uses no approval/certification language in the EN step labels", () => {
    const steps = getDefaultStampThinkingSteps(getDictionary("en").loading).join(" ").toLowerCase();
    for (const banned of ["approved", "certified", "production-ready", "secure", "bug-free", "final approval"]) {
      assert.ok(!steps.includes(banned), `loading copy must not imply "${banned}"`);
    }
  });

  it("filters missing/blank labels and never throws on malformed input", () => {
    assert.deepEqual(getDefaultStampThinkingSteps({ reviewingEvidence: "A", preparingAcceptance: "  " }), ["A"]);
    for (const bad of [null, undefined, 7, "x", []]) {
      assert.doesNotThrow(() => getDefaultStampThinkingSteps(bad));
      assert.deepEqual(getDefaultStampThinkingSteps(bad), []);
    }
  });

  it("feeds cleanly into resolveStampThinking as stepLabels (first label shown)", () => {
    const steps = getDefaultStampThinkingSteps(getDictionary("en").loading);
    const c = resolveStampThinking({ variant: "panel", stepLabels: steps });
    assert.equal(c.label, "Reviewing evidence…");
  });
});

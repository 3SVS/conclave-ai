// Stage 161 — SimsaSealThinking render-config tests (pure, node --test).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveSealThinking,
  SEAL_THINKING_VARIANTS,
  DEFAULT_SEAL_LABEL,
} from "../src/lib/seal-thinking.mjs";

describe("resolveSealThinking", () => {
  it("defaults to the compact variant with 3 dots and the default label", () => {
    const c = resolveSealThinking();
    assert.equal(c.variant, "compact");
    assert.equal(c.dotCount, 3);
    assert.equal(c.dots.length, 3);
    assert.equal(c.label, DEFAULT_SEAL_LABEL);
    assert.equal(c.showVisibleLabel, false);
  });

  it("panel variant has 5 dots and shows the visible label", () => {
    const c = resolveSealThinking({ variant: "panel" });
    assert.equal(c.variant, "panel");
    assert.equal(c.dotCount, 5);
    assert.equal(c.dots.length, 5);
    assert.equal(c.showVisibleLabel, true);
  });

  it("uses a custom label when provided", () => {
    const c = resolveSealThinking({ variant: "panel", label: "Mapping acceptance criteria…" });
    assert.equal(c.label, "Mapping acceptance criteria…");
  });

  it("uses the first stepLabel as the current label (cycling deferred)", () => {
    const c = resolveSealThinking({ stepLabels: ["Building stage plan…", "Planning evidence…"] });
    assert.equal(c.label, "Building stage plan…");
  });

  it("falls back to the default label for empty/whitespace input", () => {
    assert.equal(resolveSealThinking({ label: "   " }).label, DEFAULT_SEAL_LABEL);
    assert.equal(resolveSealThinking({ stepLabels: ["  ", ""] }).label, DEFAULT_SEAL_LABEL);
  });

  it("coerces an unknown variant to compact", () => {
    assert.equal(resolveSealThinking({ variant: "bogus" }).variant, "compact");
    assert.deepEqual(SEAL_THINKING_VARIANTS, ["compact", "panel"]);
  });

  it("always exposes accessible status semantics", () => {
    const c = resolveSealThinking({ variant: "panel" });
    assert.deepEqual(c.a11y, { role: "status", ariaLive: "polite", ariaBusy: true });
  });

  it("assigns sequential dot animation delays", () => {
    const delays = resolveSealThinking({ variant: "panel" }).dots.map((d) => d.delayMs);
    assert.deepEqual(delays, [0, 200, 400, 600, 800]);
  });

  it("never throws on malformed input", () => {
    for (const bad of [null, undefined, 7, "x", [], { variant: 1, label: 2, stepLabels: 3 }]) {
      assert.doesNotThrow(() => resolveSealThinking(bad));
    }
  });
});

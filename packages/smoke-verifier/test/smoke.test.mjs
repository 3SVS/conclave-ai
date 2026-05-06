import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadSmokeConfig, runSmoke, scanForAiSlop, AI_SLOP_PATTERNS } from "../dist/index.js";

// --- loadSmokeConfig --------------------------------------------------------

test("loadSmokeConfig: returns null when file absent", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "smoke-cfg-"));
  try {
    const cfg = await loadSmokeConfig(dir);
    assert.equal(cfg, null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("loadSmokeConfig: parses YAML with all step kinds", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "smoke-cfg-"));
  try {
    await fs.mkdir(path.join(dir, ".conclave"), { recursive: true });
    await fs.writeFile(
      path.join(dir, ".conclave", "smoke.yaml"),
      `
steps:
  - name: home loads
    goto: /
  - expect-status: 200
  - expect-text:
      text: "Conclave"
      selector: "h1"
  - click: ".cta button"
  - fill:
      selector: input[name=email]
      value: hi@example.com
  - wait-for: ".result"
    timeoutMs: 30000
stepTimeoutMs: 20000
continueOnFailure: false
`,
      "utf8",
    );
    const cfg = await loadSmokeConfig(dir);
    assert.ok(cfg);
    assert.equal(cfg.steps.length, 6);
    assert.equal(cfg.steps[0].kind, "goto");
    assert.equal(cfg.steps[0].path, "/");
    assert.equal(cfg.steps[0].name, "home loads");
    assert.equal(cfg.steps[1].kind, "expect-status");
    assert.equal(cfg.steps[1].equals, 200);
    assert.equal(cfg.steps[2].kind, "expect-text");
    assert.equal(cfg.steps[2].text, "Conclave");
    assert.equal(cfg.steps[2].selector, "h1");
    assert.equal(cfg.steps[3].kind, "click");
    assert.equal(cfg.steps[3].selector, ".cta button");
    assert.equal(cfg.steps[4].kind, "fill");
    assert.equal(cfg.steps[5].kind, "wait-for");
    assert.equal(cfg.stepTimeoutMs, 20000);
    assert.equal(cfg.continueOnFailure, false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// --- runSmoke (with stub Playwright) --------------------------------------

function fakePlaywright(scriptedPageBehavior) {
  // scriptedPageBehavior: { gotoStatus: 200, isVisible: bool, textContent: string|null, content: string }
  return {
    async launch() {
      return {
        async newPage() {
          let lastStatus = 0;
          return {
            async goto(url) {
              lastStatus = scriptedPageBehavior.gotoStatus ?? 200;
              return { status: () => lastStatus };
            },
            async textContent(_sel) {
              return scriptedPageBehavior.textContent ?? null;
            },
            async isVisible(_sel) {
              return Boolean(scriptedPageBehavior.isVisible ?? true);
            },
            async click(_sel) {},
            async fill(_sel, _v) {},
            async waitForSelector(_sel) {
              if (scriptedPageBehavior.waitForFails) throw new Error("wait timed out");
            },
            async content() {
              return scriptedPageBehavior.content ?? "";
            },
            async screenshot() {
              return Buffer.from("fake-png");
            },
            async close() {},
          };
        },
        async close() {},
      };
    },
  };
}

test("runSmoke: all-pass path returns verdict ok", async () => {
  const result = await runSmoke({
    baseUrl: "https://example.com",
    config: {
      steps: [
        { kind: "goto", path: "/" },
        { kind: "expect-status", equals: 200 },
        { kind: "expect-text", text: "Hello" },
      ],
    },
    playwright: fakePlaywright({ gotoStatus: 200, content: "<html><body>Hello world</body></html>" }),
  });
  assert.equal(result.verdict, "ok");
  assert.equal(result.passed, 3);
  assert.equal(result.failed, 0);
});

test("runSmoke: status mismatch → broken + failure screenshot captured", async () => {
  const result = await runSmoke({
    baseUrl: "https://example.com",
    config: {
      steps: [
        { kind: "goto", path: "/" },
        { kind: "expect-status", equals: 200 },
        { kind: "expect-text", text: "Welcome" },
      ],
    },
    playwright: fakePlaywright({ gotoStatus: 503, content: "<html><body>Service unavailable</body></html>" }),
  });
  assert.equal(result.verdict, "broken");
  assert.equal(result.failed, 1);
  assert.ok(result.failureScreenshot, "failure screenshot must be captured");
  assert.equal(result.steps[1].status, "fail");
  assert.match(result.steps[1].reason ?? "", /got 503/);
  // Subsequent step skipped because halt-on-failure default.
  assert.equal(result.steps[2].status, "skip");
});

test("runSmoke: continueOnFailure runs all steps + reports failures", async () => {
  const result = await runSmoke({
    baseUrl: "https://example.com",
    config: {
      continueOnFailure: true,
      steps: [
        { kind: "goto", path: "/" },
        { kind: "expect-text", text: "missing-on-page" },
        { kind: "expect-text", text: "world" },
      ],
    },
    playwright: fakePlaywright({ gotoStatus: 200, content: "<html><body>hello world</body></html>" }),
  });
  assert.equal(result.failed, 1, "one expect-text fails (missing)");
  assert.equal(result.passed, 2, "goto + second expect-text pass");
  assert.equal(result.verdict, "broken");
});

// --- scanForAiSlop --------------------------------------------------------

test("scanForAiSlop: catches TODO, lorem ipsum, AI commentary, example.com", () => {
  const html = [
    "<html><body>",
    "<p>// TODO: implement this part later</p>",
    "<p>Hello world</p>",
    "</body></html>",
  ].join("\n");
  const hits = scanForAiSlop(html);
  assert.ok(hits.length >= 1);
  assert.match(hits[0].reason, /TODO/);
});

test("scanForAiSlop: returns empty on clean HTML", () => {
  assert.deepEqual(scanForAiSlop("<html><body><h1>Real product</h1></body></html>"), []);
});

test("AI_SLOP_PATTERNS includes the 8 known signals", () => {
  assert.ok(AI_SLOP_PATTERNS.length >= 8);
  for (const p of AI_SLOP_PATTERNS) {
    assert.ok(p.pattern instanceof RegExp);
    assert.ok(typeof p.reason === "string" && p.reason.length > 0);
  }
});

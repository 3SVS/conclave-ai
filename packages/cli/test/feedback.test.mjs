/**
 * Sprint B — `conclave feedback` CLI tests.
 *
 * End-to-end style: writes a temporary auth.json to a fake HOME, stubs
 * global fetch with deterministic responses, invokes feedback() with
 * fully-flagged input (no interactive prompts needed), and asserts on
 * the captured stdout / exit behavior.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { feedback } from "../dist/commands/feedback.js";

// --- tiny harness ---------------------------------------------------------

function tmpHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "concfb-"));
  fs.mkdirSync(path.join(dir, ".conclave"), { recursive: true });
  return dir;
}

function writeAuth(home) {
  fs.writeFileSync(
    path.join(home, ".conclave", "auth.json"),
    JSON.stringify({
      version: 1,
      token: "test-bearer-token",
      endpoint: "https://example.invalid",
      issuedAt: "2026-05-09T00:00:00Z",
      githubLogin: "test-user",
    }),
  );
}

function captureStdout(fn) {
  const original = process.stdout.write.bind(process.stdout);
  let buf = "";
  process.stdout.write = (chunk) => {
    buf += String(chunk);
    return true;
  };
  return Promise.resolve(fn()).finally(() => {
    process.stdout.write = original;
  }).then(() => buf);
}

function withFetchStub(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original;
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function withHome(home, fn) {
  const origUser = process.env.USERPROFILE;
  const origHome = process.env.HOME;
  const origXdg = process.env.XDG_CONFIG_HOME;
  process.env.USERPROFILE = home;
  process.env.HOME = home;
  delete process.env.XDG_CONFIG_HOME;
  return Promise.resolve(fn()).finally(() => {
    if (origUser !== undefined) process.env.USERPROFILE = origUser;
    else delete process.env.USERPROFILE;
    if (origHome !== undefined) process.env.HOME = origHome;
    else delete process.env.HOME;
    if (origXdg !== undefined) process.env.XDG_CONFIG_HOME = origXdg;
  });
}

// --- intake mode ---------------------------------------------------------

test("feedback intake: 200 classified → JSON output has category + reasoning", async () => {
  const home = tmpHome();
  writeAuth(home);
  const out = await withHome(home, () =>
    withFetchStub(
      async (url, init) => {
        assert.equal(String(url), "https://example.invalid/feedback");
        assert.equal(init.method, "POST");
        const body = JSON.parse(init.body);
        assert.equal(body.domain, "design");
        assert.equal(body.severity, "major");
        assert.equal(body.what_user_wanted, "buttons use design-system token");
        assert.equal(body.what_we_produced, "hardcoded #3B82F6");
        return jsonResponse({
          id: "fb_test_1",
          status: "classified",
          category: "design-tokens",
          confidence: 0.95,
          reasoning: "hardcoded color instead of token",
        });
      },
      () =>
        captureStdout(() =>
          feedback([
            "--domain",
            "design",
            "--severity",
            "major",
            "--wanted",
            "buttons use design-system token",
            "--produced",
            "hardcoded #3B82F6",
            "--json",
          ]),
        ),
    ),
  );
  const parsed = JSON.parse(out);
  assert.equal(parsed.id, "fb_test_1");
  assert.equal(parsed.status, "classified");
  assert.equal(parsed.category, "design-tokens");
});

test("feedback intake: 202 pending → JSON output has status=pending", async () => {
  const home = tmpHome();
  writeAuth(home);
  const out = await withHome(home, () =>
    withFetchStub(
      async () =>
        new Response(
          JSON.stringify({ id: "fb_test_2", status: "pending", category: null, confidence: null, reasoning: null }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
      () =>
        captureStdout(() =>
          feedback([
            "--domain",
            "code",
            "--severity",
            "blocker",
            "--wanted",
            "no SQL injection",
            "--produced",
            "concatenated query",
            "--json",
          ]),
        ),
    ),
  );
  const parsed = JSON.parse(out);
  assert.equal(parsed.status, "pending");
  assert.equal(parsed.category, null);
});

test("feedback intake: invalid --severity rejected before fetch", async () => {
  const home = tmpHome();
  writeAuth(home);
  let exitCode = null;
  const origExit = process.exit;
  process.exit = (code) => {
    exitCode = code;
    throw new Error("__exit__");
  };
  try {
    await withHome(home, async () => {
      try {
        await feedback(["--severity", "kinda-bad"]);
      } catch (e) {
        if (e.message !== "__exit__") throw e;
      }
    });
  } finally {
    process.exit = origExit;
  }
  assert.equal(exitCode, 2, "should exit 2 on parse error");
});

// --- list mode -----------------------------------------------------------

test("feedback --list: empty result → friendly message", async () => {
  const home = tmpHome();
  writeAuth(home);
  const out = await withHome(home, () =>
    withFetchStub(
      async (url) => {
        assert.equal(String(url), "https://example.invalid/me/feedback");
        return jsonResponse({ feedback: [] });
      },
      () => captureStdout(() => feedback(["--list"])),
    ),
  );
  // Color codes likely present; check substring.
  assert.match(out, /no feedback/i);
});

test("feedback --list --json: returns raw API JSON", async () => {
  const home = tmpHome();
  writeAuth(home);
  const fakeRows = {
    feedback: [
      {
        id: "fb_1",
        domain: "design",
        severity: "major",
        category: "accessibility",
        confidence: 0.9,
        reasoning: "missing alt",
        status: "classified",
        created_at: "2026-05-09T11:00:00.000Z",
        classified_at: "2026-05-09T11:00:01.000Z",
      },
    ],
  };
  const out = await withHome(home, () =>
    withFetchStub(
      async () => jsonResponse(fakeRows),
      () => captureStdout(() => feedback(["--list", "--json"])),
    ),
  );
  const parsed = JSON.parse(out);
  assert.equal(parsed.feedback.length, 1);
  assert.equal(parsed.feedback[0].id, "fb_1");
});

// --- auth gating ---------------------------------------------------------

test("feedback: 1 exit when no auth.json exists", async () => {
  const home = tmpHome();
  // intentionally do not writeAuth
  let exitCode = null;
  const origExit = process.exit;
  process.exit = (code) => {
    exitCode = code;
    throw new Error("__exit__");
  };
  try {
    await withHome(home, async () => {
      try {
        await feedback([
          "--domain",
          "design",
          "--severity",
          "minor",
          "--wanted",
          "x",
          "--produced",
          "y",
        ]);
      } catch (e) {
        if (e.message !== "__exit__") throw e;
      }
    });
  } finally {
    process.exit = origExit;
  }
  assert.equal(exitCode, 1, "should exit 1 when not logged in");
});

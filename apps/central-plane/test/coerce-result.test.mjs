/**
 * v0.14.4 — Sprint E6: container coerce-result tests.
 *
 * Pins the runAutofix-shape → callback-envelope coercion logic so the
 * four observed result variants (dry-run / approved / completed / bailed)
 * always normalize into something /internal/job-done can act on, and so
 * the diagnostic line is populated whenever verdict can't be determined
 * (avoids silent "done + verdict null" rows).
 *
 * Source under test: apps/central-plane/container/coerce-result.mjs
 * (the only module the tests can hit — the rest of server.mjs is HTTP
 * boilerplate + execFile shellouts that are exercised in the deploy
 * smoke test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coerceResult,
  extractHeaderEnv,
  validateRunPayload,
} from "../container/coerce-result.mjs";

// ---- validateRunPayload ------------------------------------------------

test("validateRunPayload: all required fields present → ok", () => {
  const r = validateRunPayload({
    jobId: "j1",
    repo: "alice/x",
    prNumber: 1,
    installationToken: "tok",
    callbackUrl: "https://w.example/internal/job-done",
    callbackToken: "ctok",
  });
  assert.deepEqual(r, { ok: true });
});

test("validateRunPayload: null payload → ok:false with full required list", () => {
  const r = validateRunPayload(null);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing.sort(), [
    "callbackToken", "callbackUrl", "installationToken", "jobId", "prNumber", "repo",
  ]);
});

test("validateRunPayload: missing callbackToken + prNumber → reports both", () => {
  const r = validateRunPayload({
    jobId: "j1", repo: "alice/x", installationToken: "t", callbackUrl: "u",
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing.sort(), ["callbackToken", "prNumber"]);
});

test("validateRunPayload: empty string is treated as present (caller's job to reject zero-length)", () => {
  // The validator only catches undefined/null. If a Worker upstream sends
  // an empty token string, the JWT mint will fail with a clearer error.
  const r = validateRunPayload({
    jobId: "j1", repo: "alice/x", prNumber: 1,
    installationToken: "", callbackUrl: "u", callbackToken: "c",
  });
  assert.equal(r.ok, true);
});

// ---- extractHeaderEnv --------------------------------------------------

test("extractHeaderEnv: maps the four documented headers to env names", () => {
  const env = extractHeaderEnv({
    "x-anthropic-key": "ak",
    "x-openai-key": "ok",
    "x-gemini-key": "gk",
    "x-telegram-bot-token": "tk",
    "user-agent": "ignored",
    "content-type": "application/json",
  });
  assert.deepEqual(env, {
    ANTHROPIC_API_KEY: "ak",
    OPENAI_API_KEY: "ok",
    GEMINI_API_KEY: "gk",
    TELEGRAM_BOT_TOKEN: "tk",
  });
});

test("extractHeaderEnv: empty / missing values are skipped (no empty env writes)", () => {
  const env = extractHeaderEnv({
    "x-anthropic-key": "",
    "x-openai-key": undefined,
    "x-gemini-key": "real",
  });
  assert.deepEqual(env, { GEMINI_API_KEY: "real" });
});

test("extractHeaderEnv: null/non-object input → empty result (not a throw)", () => {
  assert.deepEqual(extractHeaderEnv(null), {});
  assert.deepEqual(extractHeaderEnv(undefined), {});
});

// ---- coerceResult: shape #1 — dry-run review-only ----------------------

test("coerceResult: dry-run with finalVerdict='approve' → approve", () => {
  const r = coerceResult(
    { status: "dry-run", finalVerdict: "approve", remainingBlockers: [], totalCostUsd: 0.05 },
    0,
  );
  assert.equal(r.verdict, "approve");
  assert.equal(r.blockers, 0);
  assert.equal(r.diagnosticError, undefined);
});

test("coerceResult: dry-run with finalVerdict='rework' + remainingBlockers populated", () => {
  const r = coerceResult(
    {
      status: "dry-run",
      finalVerdict: "rework",
      remainingBlockers: [
        // cli emits filePath (camelCase) — coerceResult also accepts `path`
        // as a fallback. Plain `file` is the OUTPUT field, not an input.
        { category: "a11y", severity: "blocker", message: "missing aria-label", filePath: "src/x.tsx", line: 12 },
        { category: "security", severity: "major", message: "dangerous innerHTML", path: "src/y.tsx" },
      ],
      totalCostUsd: 0.12,
    },
    0,
  );
  assert.equal(r.verdict, "rework");
  assert.equal(r.blockers, 2);
  assert.deepEqual(r.blockerSummaries[0], {
    category: "a11y", severity: "blocker", message: "missing aria-label", file: "src/x.tsx", line: 12,
  });
  // path fallback for the second blocker.
  assert.equal(r.blockerSummaries[1].file, "src/y.tsx");
  assert.equal(r.diagnosticError, undefined);
});

test("coerceResult: dry-run with NO finalVerdict (council no-consensus) → rework via status fallback", () => {
  const r = coerceResult(
    { status: "dry-run", remainingBlockers: [], totalCostUsd: 0.02 },
    0,
  );
  assert.equal(r.verdict, "rework");
  assert.equal(r.diagnosticError, undefined);
});

// ---- coerceResult: shape #2 — autofix approved early -------------------

test("coerceResult: status='approved' → approve verdict", () => {
  const r = coerceResult({ status: "approved", iterations: [] }, 0);
  assert.equal(r.verdict, "approve");
});

test("coerceResult: status='merged' → approve (autofix merged the PR)", () => {
  const r = coerceResult({ status: "merged" }, 0);
  assert.equal(r.verdict, "approve");
});

// ---- coerceResult: shape #3 — autofix completed normally ---------------

test("coerceResult: explicit verdict='approve' wins over status field", () => {
  const r = coerceResult({ verdict: "approve", status: "errored", reviews: [] }, 0);
  assert.equal(r.verdict, "approve");
});

test("coerceResult: explicit verdict='reject' is preserved (not coerced)", () => {
  const r = coerceResult({ verdict: "reject", blockers: [] }, 0);
  assert.equal(r.verdict, "reject");
});

test("coerceResult: bogus verdict string is ignored, falls through to status logic", () => {
  const r = coerceResult({ verdict: "approveish", status: "approved" }, 0);
  // Bogus rawVerdict is rejected; status='approved' wins.
  assert.equal(r.verdict, "approve");
});

// ---- coerceResult: shape #4 — bailed -----------------------------------

test("coerceResult: status='bailed-no-patches' + reason → rework + verdict OK so no diagnosticError", () => {
  const r = coerceResult(
    { status: "bailed-no-patches", reason: "worker produced 0 patches", iterations: [] },
    1,
  );
  assert.equal(r.verdict, "rework");
  assert.equal(r.diagnosticError, undefined);
});

test("coerceResult: status='bailed-max-iter' → rework", () => {
  const r = coerceResult({ status: "bailed-max-iter" }, 1);
  assert.equal(r.verdict, "rework");
});

test("coerceResult: status='errored' → rework", () => {
  const r = coerceResult({ status: "errored", reason: "secret-guard tripped" }, 1);
  assert.equal(r.verdict, "rework");
});

// ---- coerceResult: undefined verdict path → diagnostic populated --------

test("coerceResult: empty result + non-zero exit → no verdict, diagnosticError captures detail", () => {
  const r = coerceResult({}, 1);
  assert.equal(r.verdict, undefined);
  assert.equal(r.blockers, undefined);
  assert.equal(r.blockerSummaries, undefined);
  assert.match(r.diagnosticError, /exitCode=1/);
  assert.match(r.diagnosticError, /reason=\(none\)/);
});

test("coerceResult: result with unrecognized status + no verdict → diagnostic populated", () => {
  const r = coerceResult({ status: "weirdo", reason: "?", iterations: [{}, {}] }, 2);
  assert.equal(r.verdict, undefined);
  assert.match(r.diagnosticError, /status=weirdo/);
  assert.match(r.diagnosticError, /iters=2/);
  assert.match(r.diagnosticError, /exitCode=2/);
});

test("coerceResult: null result → no verdict, diagnostic mentions empty key list", () => {
  const r = coerceResult(null, 1);
  assert.equal(r.verdict, undefined);
  assert.match(r.diagnosticError, /keys=\[\]/);
});

test("coerceResult: blockerSummaries cap at 8 even when more blockers present", () => {
  const big = Array.from({ length: 20 }, (_, i) => ({
    category: "x", severity: "minor", message: `b${i}`, filePath: `f${i}.ts`, line: i,
  }));
  const r = coerceResult({ status: "dry-run", finalVerdict: "rework", remainingBlockers: big }, 0);
  assert.equal(r.blockers, 20);
  assert.equal(r.blockerSummaries.length, 8);
});

test("coerceResult: long blocker message truncated to 240 chars", () => {
  const long = "x".repeat(500);
  const r = coerceResult(
    { verdict: "rework", blockers: [{ category: "c", severity: "major", message: long, filePath: "f.ts" }] },
    0,
  );
  assert.equal(r.blockerSummaries[0].message.length, 240);
});

test("coerceResult: debugLine includes status / verdict / cost — useful for log scraping", () => {
  const r = coerceResult(
    { verdict: "approve", status: "completed", reason: "all good", iterations: [{}], totalCostUsd: 0.42 },
    0,
  );
  assert.match(r.debugLine, /status=completed/);
  assert.match(r.debugLine, /verdict=approve/);
  assert.match(r.debugLine, /cost=\$0\.42/);
});

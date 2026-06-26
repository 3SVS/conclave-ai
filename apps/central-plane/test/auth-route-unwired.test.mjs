/**
 * auth-route-unwired.test.mjs
 *
 * Stage 218 PASS-condition guard (static, fast, no runtime).
 *
 * The Better Auth D1 runtime was proven to work in an ISOLATED local smoke
 * (scripts/smoke-better-auth-d1.mjs: real helper + better-auth + local D1 →
 * sign-up/sign-in write rows). That smoke must NOT change the deployed surface:
 * the committed `/api/auth/*` route and `createBetterAuthSpike` MUST stay UNWIRED
 * from the D1 runtime helper, so the production path never constructs a DB-backed
 * handler until a separately-approved wiring stage.
 *
 * This locks that invariant — the aborted first Stage 218 attempt wired
 * `createBetterAuthSpike` to `buildBetterAuthD1Database`; this test makes that
 * regression fail CI instead of silently shipping.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

// The deployed Better Auth surface: the spike factory + the route handler that
// delegates to it. Neither may pull in the D1 runtime binding.
const GUARDED_FILES = ["better-auth-spike.ts", join("routes", "auth-spike.ts")];
const FORBIDDEN = [
  /better-auth-d1/, // the helper module
  /buildBetterAuthD1Database/, // the helper function
  /D1Dialect/, // kysely-d1 dialect
  /kysely/i, // any kysely import
];

for (const rel of GUARDED_FILES) {
  test(`${rel} stays unwired from the D1 runtime helper (Stage 218)`, () => {
    const text = readFileSync(join(SRC, rel), "utf8");
    for (const pat of FORBIDDEN) {
      assert.ok(!pat.test(text), `${rel} must not reference ${pat} — the route must stay unwired`);
    }
  });
}

test("createBetterAuthSpike passes no D1 `database` option (stateless on the deployed path)", () => {
  const text = readFileSync(join(SRC, "better-auth-spike.ts"), "utf8");
  const callIdx = text.indexOf("betterAuth({");
  assert.ok(callIdx > 0, "expected a betterAuth({ ... }) call in better-auth-spike.ts");
  // Only the doc comment may mention the word `database`; the actual factory call must not
  // pass a `database:` option (that would be the aborted D1 wiring).
  const callBody = text.slice(callIdx);
  assert.ok(
    !/database\s*:/.test(callBody),
    "createBetterAuthSpike must not pass a `database:` option (keep it stateless / unwired)",
  );
});

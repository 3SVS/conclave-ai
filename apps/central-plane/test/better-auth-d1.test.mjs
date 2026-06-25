/**
 * better-auth-d1.test.mjs
 *
 * Stage 216 — verifies the kysely-d1 D1 dialect package resolves under the
 * central-plane build and that the compile-level helper builds the Better Auth
 * D1 `database` config shape WITHOUT requiring a live DB. Imports the built
 * output (dist), matching the repo convention. No secret/token/DB access.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { d1DialectAvailable, buildBetterAuthD1Database } from "../dist/better-auth-d1.js";

test("kysely-d1 D1Dialect resolves + imports under the central-plane build", () => {
  assert.equal(d1DialectAvailable(), true);
});

test("buildBetterAuthD1Database returns the Better Auth { dialect, type:'sqlite' } shape", () => {
  // A bare object stands in for the D1 binding — the dialect only stores it and
  // does not touch the database at construction, so no live D1 is required.
  const fakeDb = {};
  const cfg = buildBetterAuthD1Database(fakeDb);
  assert.equal(cfg.type, "sqlite");
  assert.ok(cfg.dialect, "expected a dialect instance");
  // Kysely Dialect contract surface is present (lazy — nothing has run yet).
  assert.equal(typeof cfg.dialect.createDriver, "function");
  assert.equal(typeof cfg.dialect.createAdapter, "function");
});

test("helper does not require a live DB and exposes no secret", () => {
  const cfg = buildBetterAuthD1Database({});
  // The config carries only the dialect + type — no secret/token field.
  const keys = Object.keys(cfg).sort();
  assert.deepEqual(keys, ["dialect", "type"]);
});

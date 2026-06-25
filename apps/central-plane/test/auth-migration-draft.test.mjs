/**
 * auth-migration-draft.test.mjs
 *
 * Stage 209 — Better Auth LOCAL-ONLY D1 migration DRAFT safety checks. Reads the
 * 0047 draft SQL straight from disk (no build needed) and asserts it is additive,
 * non-destructive, contains exactly the expected Better Auth identity tables, and
 * never touches the existing workspace / project / user_key surface.
 *
 * All structural/destructive scans run against the COMMENT-STRIPPED SQL so the
 * file's own safety prose ("additive only", "no DROP", ...) is never matched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const draftPath = join(here, "..", "migrations", "0047_better_auth_identity_tables.sql");

/** SQL with `-- ...` comment lines removed (leading-whitespace tolerant). */
function readCode() {
  return readFileSync(draftPath, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

test("0047 migration draft file exists", () => {
  assert.ok(existsSync(draftPath), `expected draft at ${draftPath}`);
});

test("draft creates exactly the four Better Auth identity tables", () => {
  const code = readCode();
  for (const table of ['"user"', '"session"', '"account"', '"verification"']) {
    assert.match(code, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `missing CREATE for ${table}`);
  }
});

test("draft is additive-only — every CREATE guards with IF NOT EXISTS", () => {
  const code = readCode();
  const creates = code.match(/CREATE\s+(TABLE|INDEX)\b/gi) ?? [];
  const guarded = code.match(/CREATE\s+(TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\b/gi) ?? [];
  assert.ok(creates.length > 0, "expected at least one CREATE statement");
  assert.equal(creates.length, guarded.length, "every CREATE must use IF NOT EXISTS");
});

test("draft contains no DROP and no destructive statements", () => {
  const code = readCode().toUpperCase();
  assert.ok(!/\bDROP\b/.test(code), "must not contain DROP");
  assert.ok(!/\bTRUNCATE\b/.test(code), "must not contain TRUNCATE");
  assert.ok(!/\bDELETE\s+FROM\b/.test(code), "must not contain DELETE FROM");
  assert.ok(!/\bUPDATE\s+\w/.test(code), "must not contain UPDATE statements");
  assert.ok(!/\bALTER\s+TABLE\b/.test(code), "must not contain ALTER TABLE");
});

test("draft does not touch workspace / project / user_key surface", () => {
  const code = readCode();
  assert.ok(!/workspace_/.test(code), "must not reference workspace_ tables");
  assert.ok(!/\buser_key\b/.test(code), "must not reference user_key");
  assert.ok(!/\bproject_id\b/.test(code), "must not reference project_id");
  assert.ok(!/\bprojects\b/.test(code), "must not reference projects table");
});

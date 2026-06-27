/**
 * workspace-membership-migration.test.mjs
 *
 * Stage 249 — additive-safety + shape checks for `0048_workspace_membership_foundation.sql`.
 * Reads the SQL straight from disk (no build) and asserts it is additive, non-destructive,
 * creates the two new tables + the nullable workspace_id column, never touches `user_key` or the
 * Better Auth 0047 tables. Mirrors test/auth-migration-draft.test.mjs (comment-stripped scans).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, "..", "migrations", "0048_workspace_membership_foundation.sql");

function readCode() {
  // Strip BOTH full-line and inline `--` comments so prose / logical-reference comments
  // (e.g. `-- logical -> "user"("id")`) are never matched by the structural scans.
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

test("0048 migration file exists", () => {
  assert.ok(existsSync(file), `expected migration at ${file}`);
});

test("creates the two new membership tables (IF NOT EXISTS)", () => {
  const code = readCode();
  assert.match(code, /CREATE TABLE IF NOT EXISTS workspaces\b/);
  assert.match(code, /CREATE TABLE IF NOT EXISTS workspace_members\b/);
});

test("adds a NULLABLE workspace_id column to workspace_projects (additive)", () => {
  const code = readCode();
  assert.match(code, /ALTER TABLE workspace_projects ADD COLUMN workspace_id TEXT/);
  // The added column must NOT be NOT NULL (legacy rows have no value).
  assert.doesNotMatch(code, /ADD COLUMN workspace_id TEXT\s+NOT NULL/i);
});

test("additive only — every CREATE guards with IF NOT EXISTS", () => {
  const code = readCode();
  const creates = code.match(/CREATE\s+(TABLE|INDEX)\b/gi) ?? [];
  const guarded = code.match(/CREATE\s+(TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\b/gi) ?? [];
  assert.ok(creates.length > 0, "expected CREATE statements");
  assert.equal(creates.length, guarded.length, "every CREATE must use IF NOT EXISTS");
});

test("no destructive statements (DROP/DELETE/TRUNCATE/UPDATE/destructive ALTER)", () => {
  const code = readCode();
  assert.doesNotMatch(code, /\bDROP\b/i);
  assert.doesNotMatch(code, /\bDELETE\b/i);
  assert.doesNotMatch(code, /\bTRUNCATE\b/i);
  assert.doesNotMatch(code, /\bUPDATE\b/i);
  // The only ALTER permitted is the additive ADD COLUMN above.
  const alters = code.match(/\bALTER TABLE\b[^;]*/gi) ?? [];
  for (const a of alters) assert.match(a, /ADD COLUMN/i, `non-additive ALTER: ${a}`);
});

test("does not drop/alter the existing workspace_projects.user_key, nor redefine the 0047 tables", () => {
  const code = readCode();
  // The ONLY change to workspace_projects is the additive ADD COLUMN workspace_id — never user_key.
  const wpAlters = code.match(/ALTER TABLE workspace_projects[^;]*/gi) ?? [];
  assert.equal(wpAlters.length, 1, "expected exactly one workspace_projects ALTER (the ADD COLUMN)");
  assert.match(wpAlters[0], /ADD COLUMN workspace_id TEXT/);
  assert.doesNotMatch(wpAlters[0], /user_key/i, "must not touch workspace_projects.user_key");
  // `legacy_user_key` on the NEW workspaces table is a new column, not the legacy scope key — allowed.
  // No CREATE may redefine the Better Auth 0047 identity tables.
  for (const t of ['"user"', '"session"', '"account"', '"verification"']) {
    // The quoted table name must follow CREATE TABLE [IF NOT EXISTS] directly to count as a redefinition.
    assert.doesNotMatch(code, new RegExp(`CREATE TABLE\\s+(IF NOT EXISTS\\s+)?${t}`), `must not redefine ${t}`);
  }
});

test("role/status/type CHECK constraints + expected indexes present", () => {
  const code = readCode();
  assert.match(code, /role\s+TEXT NOT NULL CHECK \(role IN \('owner', 'admin', 'member', 'viewer'\)\)/);
  assert.match(code, /status\s+TEXT NOT NULL DEFAULT 'active' CHECK \(status IN \('active', 'invited', 'removed'\)\)/);
  assert.match(code, /type\s+TEXT NOT NULL DEFAULT 'personal' CHECK \(type IN \('personal', 'team'\)\)/);
  for (const idx of [
    "idx_workspaces_created_by_auth_user_id",
    "idx_workspaces_legacy_user_key",
    "idx_workspace_members_auth_user_id",
    "idx_workspace_members_role",
    "idx_workspace_projects_workspace_id",
  ]) {
    assert.match(code, new RegExp(`CREATE INDEX IF NOT EXISTS ${idx}\\b`), `missing index ${idx}`);
  }
});

/**
 * workspace-membership.test.mjs
 *
 * Stage 249 — workspace membership types/validators. Imports the built output (dist).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WORKSPACE_ROLES,
  WORKSPACE_MEMBER_STATUSES,
  WORKSPACE_TYPES,
  DEFAULT_INVITED_ROLE,
  isWorkspaceRole,
  isWorkspaceMemberStatus,
  isWorkspaceType,
  roleAtLeast,
} from "../dist/workspace-membership.js";

test("role / status / type vocabularies match the 0048 CHECK constraints", () => {
  assert.deepEqual([...WORKSPACE_ROLES], ["owner", "admin", "member", "viewer"]);
  assert.deepEqual([...WORKSPACE_MEMBER_STATUSES], ["active", "invited", "removed"]);
  assert.deepEqual([...WORKSPACE_TYPES], ["personal", "team"]);
  assert.equal(DEFAULT_INVITED_ROLE, "member");
});

test("validators accept valid values and reject everything else", () => {
  for (const r of WORKSPACE_ROLES) assert.equal(isWorkspaceRole(r), true);
  for (const s of WORKSPACE_MEMBER_STATUSES) assert.equal(isWorkspaceMemberStatus(s), true);
  for (const t of WORKSPACE_TYPES) assert.equal(isWorkspaceType(t), true);
  for (const bad of [undefined, null, "", "OWNER", "guest", 1, {}]) {
    assert.equal(isWorkspaceRole(bad), false);
    assert.equal(isWorkspaceMemberStatus(bad), false);
    assert.equal(isWorkspaceType(bad), false);
  }
});

test("roleAtLeast honours owner > admin > member > viewer", () => {
  assert.equal(roleAtLeast("owner", "admin"), true);
  assert.equal(roleAtLeast("admin", "admin"), true);
  assert.equal(roleAtLeast("member", "admin"), false);
  assert.equal(roleAtLeast("viewer", "member"), false);
  assert.equal(roleAtLeast("admin", "viewer"), true);
});

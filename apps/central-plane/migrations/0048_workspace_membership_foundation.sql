-- Stage 249 — Workspace membership foundation (ADDITIVE, code-readiness DRAFT).
--
-- Status: DRAFT. NOT applied to production by this stage. A separately-approved stage
-- (Production apply gate) applies it — local first, then targeted `d1 execute --remote
-- --file` (NOT bulk `migrations apply`).
--
-- Purpose: the additive backbone for workspace membership / project ownership
-- (auth user -> workspace -> role -> project), WITHOUT migrating or mutating any legacy
-- user_key-scoped data. `workspace_projects` keeps its `user_key` column unchanged; the new
-- `workspace_id` column is NULLABLE and stays NULL for all legacy rows until a separately
-- built, explicit claim flow assigns it. No invite/share/audit tables yet (later stages).
--
-- Convention: follows the repo's snake_case workspace_* style (plain TEXT ids; no FK
-- enforcement — references to Better Auth `user("id")` are LOGICAL, documented in comments,
-- with no ON DELETE CASCADE to the auth user by design).
--
-- Safety properties (asserted by test/workspace-membership-migration.test.mjs):
--   * additive only — CREATE TABLE/INDEX IF NOT EXISTS + one ADD COLUMN
--   * no DROP, no destructive ALTER, no DELETE/UPDATE/TRUNCATE, no data backfill
--   * does not redefine the Better Auth 0047 tables (user/session/account/verification)
--   * does not remove or alter workspace_projects.user_key
--   * new workspace_id is NULLABLE (legacy rows unaffected)
--
-- NOTE: `ALTER TABLE ... ADD COLUMN` is additive but NOT idempotent in SQLite/D1; the
-- production apply must pre-check column existence (see docs/workspace-membership-schema.md).

CREATE TABLE IF NOT EXISTS workspaces (
  id                       TEXT NOT NULL PRIMARY KEY,
  name                     TEXT NOT NULL,
  type                     TEXT NOT NULL DEFAULT 'personal' CHECK (type IN ('personal', 'team')),
  created_by_auth_user_id  TEXT,                 -- logical -> "user"("id") (Better Auth); no FK/cascade by design
  legacy_user_key          TEXT,                 -- nullable; set only when a personal ws is bound to a claimed user_key
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  archived_at              TEXT                  -- nullable
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id             TEXT NOT NULL,        -- logical -> workspaces("id")
  auth_user_id             TEXT NOT NULL,        -- logical -> "user"("id")
  role                     TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status                   TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'removed')),
  invited_by_auth_user_id  TEXT,                 -- nullable; logical -> "user"("id")
  joined_at                TEXT,                 -- nullable
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  PRIMARY KEY (workspace_id, auth_user_id)
);

-- Additive link from existing projects to a workspace. NULL = legacy user_key-scoped (unchanged).
-- user_key is intentionally left in place and untouched.
ALTER TABLE workspace_projects ADD COLUMN workspace_id TEXT;

CREATE INDEX IF NOT EXISTS idx_workspaces_created_by_auth_user_id ON workspaces (created_by_auth_user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_legacy_user_key ON workspaces (legacy_user_key);
CREATE INDEX IF NOT EXISTS idx_workspace_members_auth_user_id ON workspace_members (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_role ON workspace_members (role);
CREATE INDEX IF NOT EXISTS idx_workspace_projects_workspace_id ON workspace_projects (workspace_id);

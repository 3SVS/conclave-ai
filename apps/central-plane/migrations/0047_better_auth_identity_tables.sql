-- Stage 209 — Better Auth LOCAL-ONLY identity tables (DRAFT).
--
-- Status: DRAFT. NOT applied to production. NOT applied locally by this stage.
-- This file exists so a separately-approved stage can apply it (local first,
-- then — only under "Production auth migration approved." — production).
--
-- Why the column names are camelCase (not the repo's snake_case convention):
-- these four tables are consumed by the `better-auth` package's own data layer,
-- which expects its documented default model field names (id, emailVerified,
-- userId, createdAt, ...). They are NOT consumed by the existing workspace_*
-- code, so they deliberately follow Better Auth's schema, not workspace naming.
-- Quoting matches Better Auth's generated SQLite output and sidesteps the
-- `user` identifier.
--
-- Safety properties (asserted by test/auth-migration-draft.test.mjs):
--   * additive only — every statement is CREATE TABLE/INDEX IF NOT EXISTS
--   * no DROP, no destructive ALTER, no DELETE/TRUNCATE
--   * does not touch workspace / project / user_key tables or behavior
--   * no backfill, no data writes
--
-- Source: Better Auth 1.6.20 core (email/password) documented schema —
-- user / session / account / verification. Hand-written to match the
-- documented field set; NOT produced by blindly running a generator.
-- D1/SQLite-compatible types only (integer for booleans, date for timestamps).

CREATE TABLE IF NOT EXISTS "user" (
  "id" text NOT NULL PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" integer NOT NULL DEFAULT 0,
  "image" text,
  "createdAt" date NOT NULL,
  "updatedAt" date NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" text NOT NULL PRIMARY KEY,
  "expiresAt" date NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" date NOT NULL,
  "updatedAt" date NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" text NOT NULL PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" date,
  "refreshTokenExpiresAt" date,
  "scope" text,
  "password" text,
  "createdAt" date NOT NULL,
  "updatedAt" date NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text NOT NULL PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" date NOT NULL,
  "createdAt" date NOT NULL,
  "updatedAt" date NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_session_userId" ON "session" ("userId");
CREATE INDEX IF NOT EXISTS "idx_account_userId" ON "account" ("userId");
CREATE INDEX IF NOT EXISTS "idx_verification_identifier" ON "verification" ("identifier");

-- workspace_rate_limit: hourly rate limiting for POST /workspace/idea-to-spec-draft.
-- Key: (ip_hash, hour_utc) — one row per IP per UTC hour.
-- ip_hash is SHA-256(salt::ip) so no raw IPs are stored.
-- hour_utc format: '2026-06-11T15' (ISO 8601, hours precision).
CREATE TABLE IF NOT EXISTS workspace_rate_limit (
  ip_hash   TEXT    NOT NULL,
  hour_utc  TEXT    NOT NULL,
  count     INTEGER NOT NULL DEFAULT 1,
  first_at  TEXT    NOT NULL,
  last_at   TEXT    NOT NULL,
  PRIMARY KEY (ip_hash, hour_utc)
);

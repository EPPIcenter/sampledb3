-- Migration 009: a session's cookie token is stored only as its SHA-256 hash (token_hash), and
-- sessions.id becomes a public id that admins list and revoke by, which cannot authenticate.
-- Existing rows stored the cookie value itself in id, and SQLite cannot hash it here, so they are
-- dropped: every user logs in again after this release.
DROP TABLE IF EXISTS sessions;--> statement-breakpoint
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX sessions_token_hash_idx ON sessions(token_hash);--> statement-breakpoint
CREATE INDEX sessions_user_id_idx ON sessions(user_id);

-- Migration 013: add empty tables for Connected apps and built-in OAuth 2.1
-- (oauth_clients, oauth_authorization_codes, connected_apps).
-- Authorization codes and access/refresh tokens are stored only as SHA-256 hashes.
CREATE TABLE IF NOT EXISTS oauth_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT current_timestamp
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS oauth_clients_created_at_idx ON oauth_clients(created_at);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  client_id TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL,
  resource TEXT,
  scope TEXT,
  expires_at INTEGER NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT current_timestamp
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS oauth_authorization_codes_code_hash_idx ON oauth_authorization_codes(code_hash);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS oauth_authorization_codes_expires_at_idx ON oauth_authorization_codes(expires_at);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS oauth_authorization_codes_user_id_idx ON oauth_authorization_codes(user_id);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS connected_apps (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  client_id TEXT NOT NULL REFERENCES oauth_clients(id),
  access_token_hash TEXT NOT NULL,
  access_token_expires_at INTEGER NOT NULL,
  refresh_token_hash TEXT,
  previous_refresh_token_hash TEXT,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  created_at TEXT NOT NULL DEFAULT current_timestamp,
  last_used_at TEXT,
  revoked_at TEXT
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS connected_apps_access_token_hash_idx ON connected_apps(access_token_hash);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS connected_apps_refresh_token_hash_idx ON connected_apps(refresh_token_hash);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS connected_apps_previous_refresh_token_hash_idx ON connected_apps(previous_refresh_token_hash);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS connected_apps_user_id_idx ON connected_apps(user_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS connected_apps_client_id_idx ON connected_apps(client_id);

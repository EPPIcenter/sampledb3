CREATE TABLE IF NOT EXISTS error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  error_code TEXT,
  stack TEXT,
  context TEXT,
  user_id INTEGER,
  url TEXT,
  user_agent TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  resolved_at TEXT,
  resolved_by INTEGER
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS error_logs_timestamp_idx ON error_logs(timestamp);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS error_logs_source_idx ON error_logs(source);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS error_logs_level_idx ON error_logs(level);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS error_logs_resolved_idx ON error_logs(resolved);--> statement-breakpoint
DROP TABLE IF EXISTS version;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);--> statement-breakpoint
DELETE FROM schema_version;--> statement-breakpoint
INSERT INTO schema_version (version) VALUES (1);

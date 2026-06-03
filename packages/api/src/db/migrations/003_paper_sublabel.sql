-- Migration 003: paper sublabel rename and drop unused position column (issue #64)
CREATE TEMP TABLE IF NOT EXISTS __migration_003_guard (id INTEGER PRIMARY KEY);--> statement-breakpoint
CREATE TRIGGER __migration_003_guard_tr BEFORE INSERT ON __migration_003_guard
BEGIN
  SELECT RAISE(ABORT, 'Cannot drop paper.position: non-empty values exist. Migrate or clear them first.')
  WHERE EXISTS (
    SELECT 1 FROM paper WHERE position IS NOT NULL AND TRIM(position) != ''
  );
END;--> statement-breakpoint
INSERT INTO __migration_003_guard DEFAULT VALUES;--> statement-breakpoint
DROP TRIGGER __migration_003_guard_tr;--> statement-breakpoint
DROP TABLE __migration_003_guard;--> statement-breakpoint
ALTER TABLE paper RENAME COLUMN barcode TO sublabel;--> statement-breakpoint
ALTER TABLE paper DROP COLUMN position;

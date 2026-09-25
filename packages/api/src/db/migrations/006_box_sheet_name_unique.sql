-- Migration 006: sheet names are unique within a box. Bags are exempt: legacy DBS bags hold
-- many single-paper sheets that share one name. (UNIQUE(name, box_id, bag_id) never fired
-- because one of box_id / bag_id is always NULL.)
CREATE TEMP TABLE IF NOT EXISTS __migration_006_guard (id INTEGER PRIMARY KEY);--> statement-breakpoint
CREATE TRIGGER __migration_006_guard_tr BEFORE INSERT ON __migration_006_guard
BEGIN
  SELECT RAISE(ABORT, 'Cannot add unique sheet name index: a box has two sheets with the same name. Rename one of them first.')
  WHERE EXISTS (
    SELECT 1 FROM sheet WHERE box_id IS NOT NULL GROUP BY box_id, name HAVING COUNT(*) > 1
  );
END;--> statement-breakpoint
INSERT INTO __migration_006_guard DEFAULT VALUES;--> statement-breakpoint
DROP TRIGGER __migration_006_guard_tr;--> statement-breakpoint
DROP TABLE __migration_006_guard;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS sheet_box_name_idx ON sheet(box_id, name) WHERE box_id IS NOT NULL;

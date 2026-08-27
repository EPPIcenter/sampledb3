-- Migration 004: at most one Container per grid position in a Collection.
-- NULL positions are excluded (legacy unpositioned tubes occupy no cell).
CREATE TEMP TABLE IF NOT EXISTS __migration_004_guard (id INTEGER PRIMARY KEY);--> statement-breakpoint
CREATE TRIGGER __migration_004_guard_tr BEFORE INSERT ON __migration_004_guard
BEGIN
  SELECT RAISE(ABORT, 'Cannot add unique grid position index: duplicate (collection_id, position) rows exist.')
  WHERE EXISTS (
    SELECT 1 FROM micronix_tube WHERE position IS NOT NULL GROUP BY collection_id, position HAVING COUNT(*) > 1
  )
  OR EXISTS (
    SELECT 1 FROM cryovial_tube WHERE position IS NOT NULL GROUP BY collection_id, position HAVING COUNT(*) > 1
  )
  OR EXISTS (
    SELECT 1 FROM static_well WHERE position IS NOT NULL GROUP BY collection_id, position HAVING COUNT(*) > 1
  );
END;--> statement-breakpoint
INSERT INTO __migration_004_guard DEFAULT VALUES;--> statement-breakpoint
DROP TRIGGER __migration_004_guard_tr;--> statement-breakpoint
DROP TABLE __migration_004_guard;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS micronix_tube_collection_position_idx ON micronix_tube(collection_id, position) WHERE position IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS cryovial_tube_collection_position_idx ON cryovial_tube(collection_id, position) WHERE position IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS static_well_collection_position_idx ON static_well(collection_id, position) WHERE position IS NOT NULL;

-- Migration 010: every stored Grid position passes the Grid position rule (issue #125).
-- The rule is `parseGridPosition` in packages/contract/src/grid-position.ts: a row letter and
-- a one- or two-digit column inside the Collection's geometry (micronix plate A01–H12, cryovial
-- box A01–J10), stored as an upper-case letter and a two-digit column. For each position not
-- already in stored form:
--   - leading dashes are stripped and the rest stored in stored form (`--A01`, `-F02`, `a1`)
--   - a position that is a letter followed by the tube's own barcode is cleared (`A1145854300`)
--   - an `NA` position is cleared (`NA`, `NA01`)
-- A cleared Container stays in its Collection as an Unplaced container. Aborts, changing
-- nothing, if any other position is found or if a repair would put two Containers in one
-- position of the same Collection (micronix tubes and static wells share a plate).
CREATE TEMP TABLE __migration_010_repair AS
WITH stored AS (
  SELECT 'micronix_tube' AS tbl, id, barcode, position, 8 AS max_rows, 12 AS max_cols
  FROM micronix_tube WHERE position IS NOT NULL
  UNION ALL
  SELECT 'cryovial_tube', id, barcode, position, 10, 10
  FROM cryovial_tube WHERE position IS NOT NULL
  UNION ALL
  SELECT 'static_well', id, NULL, position, 8, 12
  FROM static_well WHERE position IS NOT NULL
),
stripped AS (
  SELECT *, ltrim(trim(position), '-') AS s FROM stored
),
parsed AS (
  SELECT *,
    CASE
      WHEN (s GLOB '[A-Za-z][0-9]' OR s GLOB '[A-Za-z][0-9][0-9]')
        AND unicode(upper(substr(s, 1, 1))) - 64 <= max_rows
        AND CAST(substr(s, 2) AS INTEGER) BETWEEN 1 AND max_cols
      THEN upper(substr(s, 1, 1)) || printf('%02d', CAST(substr(s, 2) AS INTEGER))
    END AS grid
  FROM stripped
)
SELECT tbl, id, position AS old_position, grid AS new_position,
  CASE
    WHEN grid IS NOT NULL THEN 'normalize'
    WHEN barcode IS NOT NULL AND barcode <> '' AND s GLOB '[A-Za-z]?*' AND substr(s, 2) = barcode THEN 'clear_barcode'
    WHEN upper(s) = 'NA' OR upper(s) GLOB 'NA[0-9]' OR upper(s) GLOB 'NA[0-9][0-9]' THEN 'clear_na'
    ELSE 'unexpected'
  END AS repair
FROM parsed
WHERE grid IS NULL OR grid <> position;--> statement-breakpoint
CREATE TEMP TABLE __migration_010_final AS
SELECT t.grid_type, t.collection_id,
  CASE WHEN r.id IS NULL THEN t.position ELSE r.new_position END AS position,
  r.id IS NOT NULL AS repaired
FROM (
  SELECT 'micronix_tube' AS tbl, 'micronix_plate' AS grid_type, id, collection_id, position FROM micronix_tube
  UNION ALL SELECT 'cryovial_tube', 'cryovial_box', id, collection_id, position FROM cryovial_tube
  UNION ALL SELECT 'static_well', 'micronix_plate', id, collection_id, position FROM static_well
) t
LEFT JOIN __migration_010_repair r ON r.tbl = t.tbl AND r.id = t.id;--> statement-breakpoint
CREATE TEMP TABLE IF NOT EXISTS __migration_010_guard (id INTEGER PRIMARY KEY);--> statement-breakpoint
CREATE TRIGGER __migration_010_unexpected_tr BEFORE INSERT ON __migration_010_guard
BEGIN
  SELECT RAISE(ABORT, 'Cannot repair Grid positions: a stored position is not dash-prefixed, the tube''s barcode or NA, so it cannot be repaired automatically. Correct or clear it by hand first.')
  WHERE EXISTS (SELECT 1 FROM __migration_010_repair WHERE repair = 'unexpected');
END;--> statement-breakpoint
CREATE TRIGGER __migration_010_collision_tr BEFORE INSERT ON __migration_010_guard
BEGIN
  SELECT RAISE(ABORT, 'Cannot repair Grid positions: a repaired position would put two Containers in one position of the same Collection. Move or clear one of them first.')
  WHERE EXISTS (
    SELECT 1 FROM __migration_010_final WHERE position IS NOT NULL
    GROUP BY grid_type, collection_id, position HAVING COUNT(*) > 1 AND MAX(repaired) = 1
  );
END;--> statement-breakpoint
INSERT INTO __migration_010_guard DEFAULT VALUES;--> statement-breakpoint
DROP TRIGGER __migration_010_unexpected_tr;--> statement-breakpoint
DROP TRIGGER __migration_010_collision_tr;--> statement-breakpoint
DROP TABLE __migration_010_guard;--> statement-breakpoint
UPDATE micronix_tube
SET position = (SELECT r.new_position FROM __migration_010_repair r WHERE r.tbl = 'micronix_tube' AND r.id = micronix_tube.id)
WHERE id IN (SELECT id FROM __migration_010_repair WHERE tbl = 'micronix_tube');--> statement-breakpoint
UPDATE cryovial_tube
SET position = (SELECT r.new_position FROM __migration_010_repair r WHERE r.tbl = 'cryovial_tube' AND r.id = cryovial_tube.id)
WHERE id IN (SELECT id FROM __migration_010_repair WHERE tbl = 'cryovial_tube');--> statement-breakpoint
UPDATE static_well
SET position = (SELECT r.new_position FROM __migration_010_repair r WHERE r.tbl = 'static_well' AND r.id = static_well.id)
WHERE id IN (SELECT id FROM __migration_010_repair WHERE tbl = 'static_well');--> statement-breakpoint
DROP TABLE __migration_010_final;--> statement-breakpoint
DROP TABLE __migration_010_repair;

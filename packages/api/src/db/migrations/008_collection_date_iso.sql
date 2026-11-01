-- Migration 008: every Specimen collection date is YYYY-MM-DD (issue #104).
-- Rewrites legacy M/D/YY and M/D/YYYY values (US month first; a 2-digit year is 20YY) and
-- surrounding whitespace, and turns blank values into NULL. Abort if any other value remains,
-- so it can be reviewed by hand.
UPDATE specimen SET collection_date = NULL
WHERE typeof(collection_date) = 'text' AND trim(collection_date) = '';--> statement-breakpoint
CREATE TEMP TABLE __migration_008_dates AS
WITH legacy AS (
  SELECT id, trim(collection_date) AS v
  FROM specimen
  WHERE collection_date IS NOT NULL
    AND NOT (
      typeof(collection_date) = 'text'
      AND collection_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND date(collection_date) IS collection_date
    )
),
parts AS (
  SELECT id, v, substr(v, 1, instr(v, '/') - 1) AS m, substr(v, instr(v, '/') + 1) AS rest FROM legacy
),
fields AS (
  SELECT id, v, m, substr(rest, 1, instr(rest, '/') - 1) AS d, substr(rest, instr(rest, '/') + 1) AS y FROM parts
),
candidates AS (
  SELECT id, CASE
    WHEN v GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' THEN v
    WHEN (m GLOB '[0-9]' OR m GLOB '[0-9][0-9]')
      AND (d GLOB '[0-9]' OR d GLOB '[0-9][0-9]')
      AND (y GLOB '[0-9][0-9]' OR y GLOB '[0-9][0-9][0-9][0-9]')
    THEN printf(
      '%04d-%02d-%02d',
      CASE WHEN length(y) = 2 THEN 2000 + CAST(y AS INTEGER) ELSE CAST(y AS INTEGER) END,
      CAST(m AS INTEGER),
      CAST(d AS INTEGER)
    )
  END AS iso
  FROM fields
)
SELECT id, CASE WHEN date(iso) IS iso THEN iso END AS iso FROM candidates;--> statement-breakpoint
CREATE TEMP TABLE IF NOT EXISTS __migration_008_guard (id INTEGER PRIMARY KEY);--> statement-breakpoint
CREATE TRIGGER __migration_008_guard_tr BEFORE INSERT ON __migration_008_guard
BEGIN
  SELECT RAISE(ABORT, 'Cannot convert collection dates to YYYY-MM-DD: a specimen.collection_date is not YYYY-MM-DD, M/D/YY or M/D/YYYY, or is not a real calendar date. Fix it by hand first. SELECT id, collection_date FROM specimen WHERE date(collection_date) IS NOT collection_date lists every value that is not YYYY-MM-DD.')
  WHERE EXISTS (SELECT 1 FROM __migration_008_dates WHERE iso IS NULL);
END;--> statement-breakpoint
INSERT INTO __migration_008_guard DEFAULT VALUES;--> statement-breakpoint
DROP TRIGGER __migration_008_guard_tr;--> statement-breakpoint
DROP TABLE __migration_008_guard;--> statement-breakpoint
UPDATE specimen
SET collection_date = (SELECT iso FROM __migration_008_dates WHERE __migration_008_dates.id = specimen.id)
WHERE id IN (SELECT id FROM __migration_008_dates);--> statement-breakpoint
DROP TABLE __migration_008_dates;

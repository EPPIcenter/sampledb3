-- Migration 008: store Specimen collection dates as YYYY-MM-DD (issue #104).
-- Rewrites legacy M/D/YY and M/D/YYYY values (US month first; a 2-digit year is 20YY) and
-- surrounding whitespace, and turns blank values into NULL. A value in any other format, or one
-- that is not a real calendar date, is left exactly as it is: the migration runs at startup on
-- every install, so it must not stop one. The integrity report's "Collection date not ISO"
-- check lists what is left, for an admin to correct.
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
UPDATE specimen
SET collection_date = (SELECT iso FROM __migration_008_dates WHERE __migration_008_dates.id = specimen.id)
WHERE id IN (SELECT id FROM __migration_008_dates WHERE iso IS NOT NULL);--> statement-breakpoint
DROP TABLE __migration_008_dates;

-- Migration 008: store Specimen collection dates as YYYY-MM-DD (issue #104).
-- Rewrites legacy M/D/YY and M/D/YYYY values (US month first; a 2-digit year is 20YY) and
-- surrounding whitespace, and turns blank values into NULL. The migration runs at startup on
-- every install, so it must not stop one. These are left exactly as they are:
--   - a value in any other format, or one that is not a real calendar date
--   - a value whose rewrite a unique index would reject. A database created from the snapshot
--     has unique indexes on (study_subject_id, specimen_type_id, collection_date) and
--     (control_batch_id, specimen_type_id, collection_date). Where such an index exists, a
--     rewrite is skipped when another Specimen of the same Subject (or control batch) and
--     Specimen type already stores the date it would produce (`2024-01-02` beside `1/2/24`),
--     and when two rewrites would produce the same date (` 2024-01-02 ` beside `01/02/2024`):
--     neither is rewritten. A database without the index (one upgraded from before the
--     versioned snapshot) has every readable value rewritten.
-- The integrity report's "Collection date not ISO" check lists what is left, for an admin to
-- correct. Turning a blank into NULL cannot break a unique index: SQLite counts every NULL as
-- distinct.
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
CREATE TEMP TABLE __migration_008_final AS
SELECT s.id, 'study_subject' AS owner, s.study_subject_id AS owner_id, s.specimen_type_id,
  COALESCE(d.iso, s.collection_date) AS collection_date
FROM specimen s
LEFT JOIN __migration_008_dates d ON d.id = s.id
WHERE s.study_subject_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM pragma_index_list('specimen') AS il
    WHERE il."unique" = 1
      AND (SELECT COUNT(*) FROM pragma_index_info(il.name)) = 3
      AND (SELECT COUNT(*) FROM pragma_index_info(il.name) AS ii
           WHERE ii.name IN ('study_subject_id', 'specimen_type_id', 'collection_date')) = 3
  )
UNION ALL
SELECT s.id, 'control_batch', s.control_batch_id, s.specimen_type_id,
  COALESCE(d.iso, s.collection_date)
FROM specimen s
LEFT JOIN __migration_008_dates d ON d.id = s.id
WHERE s.control_batch_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM pragma_index_list('specimen') AS il
    WHERE il."unique" = 1
      AND (SELECT COUNT(*) FROM pragma_index_info(il.name)) = 3
      AND (SELECT COUNT(*) FROM pragma_index_info(il.name) AS ii
           WHERE ii.name IN ('control_batch_id', 'specimen_type_id', 'collection_date')) = 3
  );--> statement-breakpoint
DELETE FROM __migration_008_dates
WHERE id IN (
  SELECT f.id FROM __migration_008_final f
  JOIN (
    SELECT owner, owner_id, specimen_type_id, collection_date
    FROM __migration_008_final
    WHERE collection_date IS NOT NULL
    GROUP BY owner, owner_id, specimen_type_id, collection_date
    HAVING COUNT(*) > 1
  ) g ON g.owner = f.owner
    AND g.owner_id = f.owner_id
    AND g.specimen_type_id = f.specimen_type_id
    AND g.collection_date = f.collection_date
);--> statement-breakpoint
DROP TABLE __migration_008_final;--> statement-breakpoint
UPDATE specimen
SET collection_date = (SELECT iso FROM __migration_008_dates WHERE __migration_008_dates.id = specimen.id)
WHERE id IN (SELECT id FROM __migration_008_dates WHERE iso IS NOT NULL);--> statement-breakpoint
DROP TABLE __migration_008_dates;

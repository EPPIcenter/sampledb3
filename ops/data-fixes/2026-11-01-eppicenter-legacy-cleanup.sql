-- One-time data fix for the EPPIcenter lab's SampleDB database ONLY.
--
-- DO NOT RUN THIS ON ANY OTHER DATABASE. It names rows by the ids they have in the EPPIcenter
-- production database (snapshot arwen_2026-10-31) and carries out decisions that lab made about
-- its own legacy data. On another install it would abort or, worse, change unrelated rows.
--
-- Decisions: eppicenter/sampledb3 issue #124, comment "Decisions (2026-11-01)"; work in #126.
-- Run with `bun run data-fix` (packages/api/src/db/README.md, "One-time data fixes"). Every
-- step is guarded: if the database holds rows the lab did not review, the fix aborts and
-- changes nothing, so they can be reviewed first.
--
--   1. Placeholder collection dates (1970-01-01, 1999-09-09, 1899-12-30, 1111-01-01) become unknown.
--   3. Containers commented "exhausted" with remaining quantity 1 get remaining quantity 0; the
--      comment stays.
--   4. NA / N/A-style cryovial tube barcodes become empty (NULL, as for any tube without a barcode).
--   5. Container 34513 (no tube or Paper row; Specimen 31863 keeps its other Container) is deleted.
--   6. CTRL Subjects 3d7_0.05 (31047) and 3d7_10k (31049) are merged into 3D7_0.05 (66537) and
--      3D7_10K (66543) the way the app's Subject merge does it. The app refuses new case-variant
--      Subject names; there is no database index for it.
--   8. Empty plate 1760 `EXVIVO-27 ` (trailing space) is deleted; plate 1761 `EXVIVO-27` stays.
--   9. Specimen type Polyclonal Ab (47) allows micronix tubes, so the 8 micronix tubes holding
--      Specimen 141173 are in an allowed Container type (decided 2026-11-02, follow-up on #124).
-- Decisions 2 (future dates) and 7 (duplicate Specimen identity) change no data; the integrity
-- report lists them.

-- Setup: list the exhausted Containers the lab reviewed (decision 3)
CREATE TEMP TABLE __fix_exhausted (id INTEGER PRIMARY KEY);--> statement-breakpoint
-- Setup: reviewed exhausted Container ids
INSERT INTO __fix_exhausted (id) VALUES
  (50465), (87730), (87732), (87735), (87736), (87737), (87738), (87739), (87741), (87742),
  (87743), (87744), (87747), (87748), (87749), (87750), (87751), (87752), (87753), (87754),
  (87756), (87757), (87759), (87762), (87763), (87765), (87766), (87768), (87769), (124552),
  (124564), (124565), (124568), (124570), (124598), (124645), (124646), (136248), (140979), (143331),
  (143335), (143339), (143343), (143347), (144277), (144318);--> statement-breakpoint
-- Setup: list the placeholder dates and the counts the lab reviewed (decision 1)
CREATE TEMP TABLE __fix_placeholder_dates (collection_date TEXT PRIMARY KEY, reviewed INTEGER NOT NULL);--> statement-breakpoint
-- Setup: placeholder dates and reviewed counts
INSERT INTO __fix_placeholder_dates (collection_date, reviewed) VALUES
  ('1970-01-01', 17043), ('1999-09-09', 245), ('1899-12-30', 17), ('1111-01-01', 1);--> statement-breakpoint
-- Setup: list the Subject pairs to merge (decision 6)
CREATE TEMP TABLE __fix_subject_merge (
  source_id INTEGER PRIMARY KEY,
  source_name TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  target_name TEXT NOT NULL
);--> statement-breakpoint
-- Setup: Subject pairs to merge
INSERT INTO __fix_subject_merge (source_id, source_name, target_id, target_name) VALUES
  (31047, '3d7_0.05', 66537, '3D7_0.05'), (31049, '3d7_10k', 66543, '3D7_10K');--> statement-breakpoint
-- Setup: drop pairs whose source Subject is gone
-- A pair is merged only while its source Subject still exists.
DELETE FROM __fix_subject_merge WHERE source_id NOT IN (SELECT id FROM study_subject);--> statement-breakpoint
-- Guard: table the guard triggers fire on
CREATE TEMP TABLE IF NOT EXISTS __fix_guard (id INTEGER PRIMARY KEY);--> statement-breakpoint
-- Guard: placeholder date counts (decision 1)
CREATE TRIGGER __fix_dates_tr BEFORE INSERT ON __fix_guard
BEGIN
  SELECT RAISE(ABORT, 'Cannot clear placeholder collection dates: more Specimens are dated 1970-01-01, 1999-09-09, 1899-12-30 or 1111-01-01 than the lab reviewed (17043, 245, 17 and 1). Review the newer ones first: SELECT id, collection_date, created FROM specimen WHERE collection_date IN (''1970-01-01'', ''1999-09-09'', ''1899-12-30'', ''1111-01-01'') ORDER BY created DESC.')
  WHERE EXISTS (
    SELECT 1 FROM specimen s JOIN __fix_placeholder_dates p ON p.collection_date = s.collection_date
    GROUP BY p.collection_date HAVING COUNT(*) > MAX(p.reviewed)
  );
END;--> statement-breakpoint
-- Guard: exhausted Containers (decision 3)
CREATE TRIGGER __fix_exhausted_tr BEFORE INSERT ON __fix_guard
BEGIN
  SELECT RAISE(ABORT, 'Cannot set exhausted Containers to remaining quantity 0: a Container commented exhausted has remaining quantity above 0 and is not one of the 46 the lab reviewed, or its remaining quantity is not 1. Review it first: SELECT id, comment, remaining_quantity FROM storage_container WHERE comment LIKE ''%exhausted%'' AND remaining_quantity > 0.')
  WHERE EXISTS (
    SELECT 1 FROM storage_container
    WHERE comment LIKE '%exhausted%' AND remaining_quantity > 0
      AND (id NOT IN (SELECT id FROM __fix_exhausted) OR remaining_quantity <> 1)
  );
END;--> statement-breakpoint
-- Guard: placeholder barcodes (decision 4)
CREATE TRIGGER __fix_barcodes_tr BEFORE INSERT ON __fix_guard
BEGIN
  SELECT RAISE(ABORT, 'Cannot empty placeholder barcodes: a micronix tube has an NA-style placeholder barcode (micronix tubes must have one), or more cryovial tubes have one than the 285 the lab reviewed. Review them first.')
  WHERE EXISTS (
    SELECT 1 FROM micronix_tube WHERE upper(replace(replace(trim(barcode), '/', ''), '.', '')) = 'NA'
  ) OR (
    SELECT COUNT(*) FROM cryovial_tube WHERE upper(replace(replace(trim(barcode), '/', ''), '.', '')) = 'NA'
  ) > 285;
END;--> statement-breakpoint
-- Guard: Container 34513 (decision 5)
CREATE TRIGGER __fix_container_tr BEFORE INSERT ON __fix_guard
BEGIN
  SELECT RAISE(ABORT, 'Cannot delete Container 34513: it no longer matches what the lab reviewed (Specimen 31863, no tube, Paper or well row, no derivation, Tag or qPCR well, and its Specimen has another Container). Review it first.')
  WHERE EXISTS (SELECT 1 FROM storage_container WHERE id = 34513)
    AND NOT (
      (SELECT specimen_id FROM storage_container WHERE id = 34513) = 31863
      AND NOT EXISTS (SELECT 1 FROM micronix_tube WHERE id = 34513)
      AND NOT EXISTS (SELECT 1 FROM cryovial_tube WHERE id = 34513)
      AND NOT EXISTS (SELECT 1 FROM paper WHERE id = 34513)
      AND NOT EXISTS (SELECT 1 FROM static_well WHERE id = 34513)
      AND NOT EXISTS (SELECT 1 FROM container_derivation WHERE parent_container_id = 34513 OR child_container_id = 34513)
      AND NOT EXISTS (SELECT 1 FROM storage_container_tag WHERE storage_container_id = 34513)
      AND NOT EXISTS (SELECT 1 FROM qpcr_experiment_well WHERE storage_container_id = 34513)
      AND EXISTS (SELECT 1 FROM storage_container WHERE specimen_id = 31863 AND id <> 34513)
    );
END;--> statement-breakpoint
-- Guard: plate 1760 (decision 8)
CREATE TRIGGER __fix_plate_tr BEFORE INSERT ON __fix_guard
BEGIN
  SELECT RAISE(ABORT, 'Cannot delete plate 1760: it no longer matches what the lab reviewed (named "EXVIVO-27 " with a trailing space, holding no tubes or wells, beside plate 1761 "EXVIVO-27"). Review it first.')
  WHERE EXISTS (SELECT 1 FROM micronix_plate WHERE id = 1760)
    AND NOT (
      (SELECT name FROM micronix_plate WHERE id = 1760) = 'EXVIVO-27 '
      AND NOT EXISTS (SELECT 1 FROM micronix_tube WHERE collection_id = 1760)
      AND NOT EXISTS (SELECT 1 FROM static_well WHERE collection_id = 1760)
      AND EXISTS (SELECT 1 FROM micronix_plate WHERE id = 1761 AND name = 'EXVIVO-27')
    );
END;--> statement-breakpoint
-- Guard: Subject pairs to merge (decision 6)
CREATE TRIGGER __fix_merge_tr BEFORE INSERT ON __fix_guard
BEGIN
  SELECT RAISE(ABORT, 'Cannot merge the CTRL Subjects 3d7_0.05 into 3D7_0.05 and 3d7_10k into 3D7_10K: one of them no longer has the name or Study the lab reviewed, or its target Subject is missing. Review them first.')
  WHERE EXISTS (
    SELECT 1 FROM __fix_subject_merge m
    JOIN study_subject src ON src.id = m.source_id
    LEFT JOIN study_subject tgt ON tgt.id = m.target_id
    WHERE src.name IS NOT m.source_name
      OR tgt.name IS NOT m.target_name
      OR tgt.study_id IS NOT src.study_id
      OR src.study_id IS NOT (SELECT id FROM study WHERE short_code = 'CTRL')
  );
END;--> statement-breakpoint
-- Guard: no other case-variant Subjects (decision 6)
CREATE TRIGGER __fix_subject_case_tr BEFORE INSERT ON __fix_guard
BEGIN
  SELECT RAISE(ABORT, 'Cannot merge the CTRL case-variant Subjects: a Study has Subjects whose names differ only by case beyond the two CTRL pairs the lab reviewed. Review them first. SELECT study_id, group_concat(id || '':'' || name, '', '') FROM study_subject GROUP BY study_id, name COLLATE NOCASE HAVING COUNT(*) > 1 lists them.')
  WHERE EXISTS (
    SELECT 1 FROM study_subject
    WHERE id NOT IN (SELECT source_id FROM __fix_subject_merge)
    GROUP BY study_id, name COLLATE NOCASE HAVING COUNT(*) > 1
  );
END;--> statement-breakpoint
-- Guard: specimen type 47 is Polyclonal Ab (decision 9)
CREATE TRIGGER __fix_polyclonal_tr BEFORE INSERT ON __fix_guard
BEGIN
  SELECT RAISE(ABORT, 'Cannot allow micronix tubes for Polyclonal Ab: specimen type 47 is no longer named Polyclonal Ab. Review it first: SELECT id, name FROM specimen_type WHERE id = 47.')
  WHERE EXISTS (SELECT 1 FROM specimen_type WHERE id = 47 AND name IS NOT 'Polyclonal Ab');
END;--> statement-breakpoint
-- Guard: run every check; aborts the fix on unreviewed rows
INSERT INTO __fix_guard DEFAULT VALUES;--> statement-breakpoint
DROP TRIGGER __fix_dates_tr;--> statement-breakpoint
DROP TRIGGER __fix_exhausted_tr;--> statement-breakpoint
DROP TRIGGER __fix_barcodes_tr;--> statement-breakpoint
DROP TRIGGER __fix_container_tr;--> statement-breakpoint
DROP TRIGGER __fix_plate_tr;--> statement-breakpoint
DROP TRIGGER __fix_merge_tr;--> statement-breakpoint
DROP TRIGGER __fix_subject_case_tr;--> statement-breakpoint
DROP TRIGGER __fix_polyclonal_tr;--> statement-breakpoint
DROP TABLE __fix_guard;--> statement-breakpoint
-- Decision 1: clear placeholder collection dates
UPDATE specimen SET collection_date = NULL
WHERE collection_date IN (SELECT collection_date FROM __fix_placeholder_dates);--> statement-breakpoint
-- Decision 3: exhausted Containers get remaining quantity 0
UPDATE storage_container SET remaining_quantity = 0
WHERE id IN (SELECT id FROM __fix_exhausted) AND comment LIKE '%exhausted%' AND remaining_quantity = 1;--> statement-breakpoint
-- Decision 4: empty placeholder cryovial barcodes
UPDATE cryovial_tube SET barcode = NULL
WHERE upper(replace(replace(trim(barcode), '/', ''), '.', '')) = 'NA';--> statement-breakpoint
-- Decision 5: delete Container 34513
DELETE FROM storage_container WHERE id = 34513;--> statement-breakpoint
-- Decision 8: delete empty plate 1760
DELETE FROM micronix_plate WHERE id = 1760;--> statement-breakpoint
-- Decision 9: Polyclonal Ab allows micronix tubes
INSERT OR IGNORE INTO specimen_type_container_type (specimen_type_id, container_type)
SELECT id, 'micronix_tube' FROM specimen_type WHERE id = 47 AND name = 'Polyclonal Ab';--> statement-breakpoint
-- Decision 6: pair each source Specimen with its match
-- As mergeSubjects in src/lib/subjects/merge.ts does it, each source Specimen in turn
-- (lowest id first) is merged into the first target Specimen with the same Specimen type and
-- collection date, moving its Containers there; a source Specimen with no such match moves to
-- the target Subject, where a later source Specimen can match it. Runs after decision 1, so it
-- compares the cleaned dates.
CREATE TEMP TABLE __fix_specimen_merge AS
SELECT s.id AS specimen_id, m.target_id,
  COALESCE(
    (SELECT MIN(t.id) FROM specimen t
     WHERE t.study_subject_id = m.target_id AND t.specimen_type_id = s.specimen_type_id AND t.collection_date IS s.collection_date),
    (SELECT MIN(e.id) FROM specimen e
     WHERE e.study_subject_id = m.source_id AND e.id < s.id AND e.specimen_type_id = s.specimen_type_id AND e.collection_date IS s.collection_date)
  ) AS match_id
FROM specimen s
JOIN __fix_subject_merge m ON m.source_id = s.study_subject_id;--> statement-breakpoint
-- Decision 6: move Containers to the matching target Specimen
UPDATE storage_container
SET specimen_id = (SELECT match_id FROM __fix_specimen_merge WHERE specimen_id = storage_container.specimen_id),
  last_updated = datetime('now')
WHERE specimen_id IN (SELECT specimen_id FROM __fix_specimen_merge WHERE match_id IS NOT NULL);--> statement-breakpoint
-- Decision 6: move qPCR wells to the matching target Specimen
UPDATE qpcr_experiment_well
SET specimen_id = (SELECT match_id FROM __fix_specimen_merge WHERE specimen_id = qpcr_experiment_well.specimen_id)
WHERE specimen_id IN (SELECT specimen_id FROM __fix_specimen_merge WHERE match_id IS NOT NULL);--> statement-breakpoint
-- Decision 6: delete the merged source Specimens
DELETE FROM specimen
WHERE id IN (SELECT specimen_id FROM __fix_specimen_merge WHERE match_id IS NOT NULL);--> statement-breakpoint
-- Decision 6: move unmatched source Specimens to the target Subject
UPDATE specimen
SET study_subject_id = (SELECT target_id FROM __fix_specimen_merge WHERE specimen_id = specimen.id),
  last_updated = datetime('now')
WHERE id IN (SELECT specimen_id FROM __fix_specimen_merge WHERE match_id IS NULL);--> statement-breakpoint
-- Decision 6: mark the target Subjects updated
UPDATE study_subject SET last_updated = datetime('now')
WHERE id IN (SELECT target_id FROM __fix_subject_merge);--> statement-breakpoint
-- Decision 6: delete the merged source Subjects
DELETE FROM study_subject WHERE id IN (SELECT source_id FROM __fix_subject_merge);--> statement-breakpoint
DROP TABLE __fix_specimen_merge;--> statement-breakpoint
DROP TABLE __fix_subject_merge;--> statement-breakpoint
DROP TABLE __fix_placeholder_dates;--> statement-breakpoint
DROP TABLE __fix_exhausted;

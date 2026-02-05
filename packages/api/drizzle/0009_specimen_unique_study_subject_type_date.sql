-- Deduplicate study specimens: for each (study_subject_id, specimen_type_id, collection_date)
-- with count > 1, keep the row with min(id), reassign containers to that row, delete duplicates.
-- Then add partial unique index so duplicates cannot be re-introduced.

-- Step 1: Temp table of (study_subject_id, specimen_type_id, collection_date, keep_id) for duplicate groups
CREATE TEMP TABLE IF NOT EXISTS _specimen_keep AS
SELECT study_subject_id, specimen_type_id, collection_date, MIN(id) AS keep_id
FROM specimen
WHERE study_subject_id IS NOT NULL
GROUP BY study_subject_id, specimen_type_id, collection_date
HAVING COUNT(*) > 1;

-- Step 2: Reassign storage_container.specimen_id from duplicate specimens to the kept specimen
UPDATE storage_container
SET specimen_id = (
  SELECT sk.keep_id
  FROM _specimen_keep sk
  WHERE sk.study_subject_id = (SELECT study_subject_id FROM specimen WHERE id = storage_container.specimen_id)
    AND sk.specimen_type_id = (SELECT specimen_type_id FROM specimen WHERE id = storage_container.specimen_id)
    AND ((sk.collection_date IS NULL AND (SELECT collection_date FROM specimen WHERE id = storage_container.specimen_id) IS NULL)
         OR sk.collection_date = (SELECT collection_date FROM specimen WHERE id = storage_container.specimen_id))
  LIMIT 1
)
WHERE specimen_id IN (
  SELECT s.id
  FROM specimen s
  INNER JOIN _specimen_keep sk
    ON s.study_subject_id = sk.study_subject_id
   AND s.specimen_type_id = sk.specimen_type_id
   AND ((s.collection_date IS NULL AND sk.collection_date IS NULL) OR s.collection_date = sk.collection_date)
  WHERE s.id != sk.keep_id
);

-- Step 3: Collect duplicate specimen ids to delete
CREATE TEMP TABLE IF NOT EXISTS _specimen_duplicate_ids AS
SELECT s.id
FROM specimen s
INNER JOIN _specimen_keep sk
  ON s.study_subject_id = sk.study_subject_id
 AND s.specimen_type_id = sk.specimen_type_id
 AND ((s.collection_date IS NULL AND sk.collection_date IS NULL) OR s.collection_date = sk.collection_date)
WHERE s.id != sk.keep_id;

-- Step 4: Delete duplicate specimen rows (containers already reassigned)
DELETE FROM specimen WHERE id IN (SELECT id FROM _specimen_duplicate_ids);

-- Step 5: Drop temp tables
DROP TABLE IF EXISTS _specimen_duplicate_ids;
DROP TABLE IF EXISTS _specimen_keep;

-- Step 6: Partial unique index so study specimens are unique on (subject, type, collection_date)
CREATE UNIQUE INDEX IF NOT EXISTS idx_specimen_study_subject_type_date
ON specimen(study_subject_id, specimen_type_id, collection_date)
WHERE study_subject_id IS NOT NULL;

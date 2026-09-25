-- Migration 005: a Subject name is unique within its Study, ignoring surrounding whitespace.
-- Names are trimmed first; abort if trimming would merge two Subjects so they can be reviewed by hand.
CREATE TEMP TABLE IF NOT EXISTS __migration_005_guard (id INTEGER PRIMARY KEY);--> statement-breakpoint
CREATE TRIGGER __migration_005_guard_tr BEFORE INSERT ON __migration_005_guard
BEGIN
  SELECT RAISE(ABORT, 'Cannot add unique subject name index: a study has two subjects whose names match after trimming whitespace. Merge or rename them first.')
  WHERE EXISTS (
    SELECT 1 FROM study_subject GROUP BY study_id, trim(name) HAVING COUNT(*) > 1
  );
END;--> statement-breakpoint
INSERT INTO __migration_005_guard DEFAULT VALUES;--> statement-breakpoint
DROP TRIGGER __migration_005_guard_tr;--> statement-breakpoint
DROP TABLE __migration_005_guard;--> statement-breakpoint
UPDATE study_subject SET name = trim(name) WHERE name != trim(name);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS study_subject_study_name_idx ON study_subject(study_id, name);

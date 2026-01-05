-- Migration: Remove state_id column from storage_container and drop state table
-- Status is now derived from remainingQuantity (In Use/Exhausted)
-- Archival status is expressed through tags, not state_id

-- Step 1: Convert "Archived" state to tags (if state table exists)
-- This should be done before dropping the column
INSERT OR IGNORE INTO tag (name) VALUES ('Archived');

-- Add "Archived" tag to containers with state_id = 2 (Archived)
INSERT INTO storage_container_tag (storage_container_id, tag_id)
SELECT sc.id, t.id
FROM storage_container sc
JOIN state s ON sc.state_id = s.id
JOIN tag t ON t.name = 'Archived'
WHERE sc.state_id = 2
AND NOT EXISTS (
  SELECT 1 FROM storage_container_tag sct 
  WHERE sct.storage_container_id = sc.id AND sct.tag_id = t.id
);

-- Step 2: Remove state_id column from storage_container
-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
CREATE TABLE storage_container_new (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  specimen_id INTEGER NOT NULL,
  comment TEXT DEFAULT NULL,
  total_quantity REAL DEFAULT 1.0,
  remaining_quantity REAL DEFAULT 1.0,
  unit_id INTEGER NOT NULL,
  created TEXT NOT NULL DEFAULT current_timestamp,
  last_updated TEXT NOT NULL DEFAULT current_timestamp,
  FOREIGN KEY(specimen_id) REFERENCES specimen(id),
  FOREIGN KEY(unit_id) REFERENCES unit(id)
);

-- Copy data without state_id
INSERT INTO storage_container_new 
  (id, specimen_id, comment, total_quantity, remaining_quantity, unit_id, created, last_updated)
SELECT 
  id, specimen_id, comment, total_quantity, remaining_quantity, unit_id, created, last_updated
FROM storage_container;

-- Drop old table and rename new one
DROP TABLE storage_container;
ALTER TABLE storage_container_new RENAME TO storage_container;

-- Recreate indexes
CREATE INDEX idx_storage_container_specimen_id ON storage_container(specimen_id);

-- Step 3: Drop state table
DROP TABLE IF EXISTS state;


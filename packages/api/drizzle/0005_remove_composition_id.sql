-- Migration: Remove composition_id column from control_definition table
-- This migration removes the composition_id foreign key and column after data has been migrated

-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
-- Step 1: Create new table without composition_id
CREATE TABLE "control_definition_new" (
	"id" INTEGER PRIMARY KEY AUTOINCREMENT,
	"name" VARCHAR NOT NULL UNIQUE,
	"control_type" VARCHAR NOT NULL CHECK(control_type IN ('blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative')),
	"target_density" NUMERIC,
	"target_density_unit_id" INTEGER,
	"properties" TEXT,
	"created" DATETIME NOT NULL DEFAULT current_timestamp,
	"last_updated" DATETIME NOT NULL DEFAULT current_timestamp,
	FOREIGN KEY("target_density_unit_id") REFERENCES "unit"("id")
);

-- Step 2: Copy data from old table to new table
INSERT INTO "control_definition_new" 
("id", "name", "control_type", "target_density", "target_density_unit_id", "properties", "created", "last_updated")
SELECT 
    "id", 
    "name", 
    "control_type", 
    "target_density", 
    "target_density_unit_id", 
    "properties", 
    "created", 
    "last_updated"
FROM "control_definition";

-- Step 3: Drop old table
DROP TABLE "control_definition";

-- Step 4: Rename new table to original name
ALTER TABLE "control_definition_new" RENAME TO "control_definition";


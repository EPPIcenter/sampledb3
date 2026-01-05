-- Migration: Add control_definition_strain table and migrate data from composition_strain
-- This migration adds the new control_definition_strain table and migrates existing data

-- Step 1: Create control_definition_strain table
CREATE TABLE IF NOT EXISTS "control_definition_strain" (
	"control_definition_id" INTEGER NOT NULL,
	"strain_id" INTEGER NOT NULL,
	"percentage" REAL NOT NULL,
	PRIMARY KEY("control_definition_id", "strain_id"),
	FOREIGN KEY("control_definition_id") REFERENCES "control_definition"("id") ON DELETE CASCADE,
	FOREIGN KEY("strain_id") REFERENCES "strain"("id"),
	CHECK("percentage" > 0.0 AND "percentage" <= 100.0)
);

-- Step 2: Migrate data from composition_strain to control_definition_strain
-- This copies all strain relationships from compositions to their associated control definitions
INSERT INTO "control_definition_strain" ("control_definition_id", "strain_id", "percentage")
SELECT 
    cd.id AS control_definition_id,
    cs.strain_id,
    cs.percentage
FROM "control_definition" cd
INNER JOIN "composition" c ON cd.composition_id = c.id
INNER JOIN "composition_strain" cs ON c.id = cs.composition_id
WHERE NOT EXISTS (
    SELECT 1 FROM "control_definition_strain" cds 
    WHERE cds.control_definition_id = cd.id 
    AND cds.strain_id = cs.strain_id
);


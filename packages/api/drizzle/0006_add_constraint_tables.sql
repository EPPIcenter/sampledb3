-- Migration: Add specimen_type_container_type and container_type_unit junction tables
-- These tables enforce constraints on which container types can be used with specimen types
-- and which units can be used with container types

-- Create specimen_type_container_type junction table
CREATE TABLE "specimen_type_container_type" (
	"id" INTEGER PRIMARY KEY AUTOINCREMENT,
	"specimen_type_id" INTEGER NOT NULL,
	"container_type" VARCHAR NOT NULL CHECK(container_type IN ('paper', 'cryovial_tube', 'micronix_tube', 'static_well')),
	"created" DATETIME NOT NULL DEFAULT current_timestamp,
	FOREIGN KEY("specimen_type_id") REFERENCES "specimen_type"("id") ON DELETE CASCADE,
	UNIQUE("specimen_type_id", "container_type")
);

-- Create container_type_unit junction table
CREATE TABLE "container_type_unit" (
	"id" INTEGER PRIMARY KEY AUTOINCREMENT,
	"container_type" VARCHAR NOT NULL CHECK(container_type IN ('paper', 'cryovial_tube', 'micronix_tube', 'static_well')),
	"unit_id" INTEGER NOT NULL,
	"created" DATETIME NOT NULL DEFAULT current_timestamp,
	FOREIGN KEY("unit_id") REFERENCES "unit"("id") ON DELETE CASCADE,
	UNIQUE("container_type", "unit_id")
);


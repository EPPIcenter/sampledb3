-- Pre-migration schema from sampledb_database_bk.sqlite
-- This is the schema of the OLD database BEFORE migration.
-- The migration target schema is defined in packages/api/src/db/schema.ts (Drizzle ORM)
-- and packages/api/initial_schema.sql (generated DDL).
--
-- Dumped from the actual backup database for reference.

CREATE TABLE IF NOT EXISTS "specimen" (
	"created"	DATETIME NOT NULL,
	"last_updated"	DATETIME NOT NULL,

	"id"	INTEGER NOT NULL,
	"study_subject_id"	INTEGER NOT NULL,
	"specimen_type_id"	INTEGER NOT NULL,
	"collection_date"	DATE,

	FOREIGN KEY("study_subject_id") REFERENCES "study_subject"("id"),
	FOREIGN KEY("specimen_type_id") REFERENCES "specimen_type"("id"),
	CONSTRAINT "specimen_collection_date_uc" UNIQUE("study_subject_id","specimen_type_id","collection_date"),
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "study_subject" (
	"created"	DATETIME NOT NULL,
	"last_updated"	DATETIME NOT NULL,

	"id"	INTEGER NOT NULL,
	"study_id"	INTEGER NOT NULL,
	"name"	VARCHAR NOT NULL,

	FOREIGN KEY("study_id") REFERENCES "study"("id"),
	CONSTRAINT "study_subject_study_uc" UNIQUE("name","study_id"),
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "tube" (
	"id"	INTEGER NOT NULL,
	"box_id"	INTEGER NOT NULL,
	"box_position"	VARCHAR NOT NULL,
	"label"	VARCHAR NOT NULL,

	FOREIGN KEY("id") REFERENCES "storage_container"("id"),
	FOREIGN KEY("box_id") REFERENCES "box"("id"),
	PRIMARY KEY("id"),
	CONSTRAINT "box_position_plate_uc" UNIQUE("box_position","box_id")
);
CREATE TABLE IF NOT EXISTS "specimen_type" (
	"created"	DATETIME NOT NULL,
	"last_updated"	DATETIME NOT NULL,

	"id"	INTEGER NOT NULL,
	"name"	VARCHAR NOT NULL UNIQUE,

	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "study" (
	"created"	DATETIME NOT NULL,
	"last_updated"	DATETIME NOT NULL,

	"id"	INTEGER NOT NULL,
	"title"	VARCHAR NOT NULL UNIQUE,
	"description"	VARCHAR,
	"short_code"	VARCHAR NOT NULL UNIQUE,
	"is_longitudinal"	BOOLEAN NOT NULL,
	"lead_person"	VARCHAR NOT NULL,
	CHECK("is_longitudinal" IN (0, 1)),

	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "version" (
	"name"	VARCHAR NOT NULL
);
CREATE TABLE IF NOT EXISTS "status" (
	"id"	INTEGER PRIMARY KEY AUTOINCREMENT,
	"name"	VARCHAR NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS "state" (
	"id"	INTEGER PRIMARY KEY AUTOINCREMENT,
	"name"	VARCHAR NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS "state_status_relationship" (
	"id"	INTEGER PRIMARY KEY AUTOINCREMENT,
	"status_id"	INTEGER NOT NULL,
	"state_id" INTEGER NOT NULL,
	"default"  INTEGER NOT NULL,

	FOREIGN KEY("status_id") REFERENCES "status"("id"),
	FOREIGN KEY("state_id") REFERENCES "state"("id")
);
CREATE TABLE IF NOT EXISTS "sample_type" (
	"id"			INTEGER NOT NULL,
	"name"			VARCHAR NOT NULL UNIQUE,
	"description"	TEXT, "parent_id" INTEGER DEFAULT NULL REFERENCES "sample_type"("id"),

	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "storage_type" (
	"id"			INTEGER NOT NULL,
	"name"			VARCHAR NOT NULL UNIQUE,
	"description"	TEXT,

	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "cryovial_box"  (
	"created"		DATETIME NOT NULL DEFAULT current_timestamp,
	"last_updated"	DATETIME NOT NULL DEFAULT current_timestamp,

	"id"			INTEGER NOT NULL,
	"location_id"	INTEGER NOT NULL,
	"name"			VARCHAR NOT NULL UNIQUE,
	"barcode"		VARCHAR DEFAULT NULL UNIQUE,

	PRIMARY KEY("id"),
	FOREIGN KEY("location_id") REFERENCES "location"("id")
);
CREATE TABLE IF NOT EXISTS "micronix_plate" (
	"created"		DATETIME NOT NULL DEFAULT current_timestamp,
	"last_updated"	DATETIME NOT NULL DEFAULT current_timestamp,

	"id"			INTEGER NOT NULL,
	"location_id"	INTEGER NOT NULL,
	"name"			VARCHAR NOT NULL UNIQUE,
	"barcode"		VARCHAR DEFAULT NULL UNIQUE,

	PRIMARY KEY("id"),
	FOREIGN KEY("location_id") REFERENCES "location"("id")
);
CREATE TABLE IF NOT EXISTS "micronix_tube" (
	"id"			INTEGER NOT NULL,
	"manifest_id"	INTEGER NOT NULL,
	"barcode"		VARCHAR NOT NULL UNIQUE,
	"position"		VARCHAR CHECK(length("position") > 1 OR "position" IS NULL),

	PRIMARY KEY("id"),
	FOREIGN KEY("id") REFERENCES "storage_container"("id"),
	FOREIGN KEY("manifest_id") REFERENCES "micronix_plate"("id"),

	CONSTRAINT "micronix_tube_position_manifest_id_uc" UNIQUE("position", "manifest_id")
);
CREATE TABLE IF NOT EXISTS "cryovial_tube" (
	"id"			INTEGER NOT NULL,
	"manifest_id"	INTEGER NOT NULL,
	"barcode"		VARCHAR,
	"position"		VARCHAR CHECK(length("position") > 1 OR "position" IS NULL),

	PRIMARY KEY("id"),
	FOREIGN KEY("id") REFERENCES "storage_container"("id"),
	FOREIGN KEY("manifest_id") REFERENCES "cryovial_box"("id"),

	CONSTRAINT "cryovial_tube_position_manifest_id_uc" UNIQUE("position", "manifest_id")
);
CREATE TABLE IF NOT EXISTS "control_collection" (
	"id"			INTEGER NOT NULL,
	"study_id"		INTEGER NOT NULL,
	"url"			VARCHAR NOT NULL,
	"metadata"		TEXT,

	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "dbs_bag" (
	"created"		DATETIME NOT NULL DEFAULT current_timestamp,
	"last_updated"	DATETIME NOT NULL DEFAULT current_timestamp,
	"id"			INTEGER NOT NULL,
	"location_id"	INTEGER NOT NULL,
	"name"			VARCHAR NOT NULL,
	"barcode"		VARCHAR,
	"description"	VARCHAR,

	PRIMARY KEY("id"),
	FOREIGN KEY("location_id") REFERENCES "location"("id")
);
CREATE TABLE IF NOT EXISTS "malaria_blood_control" (
	"id"		INTEGER NOT NULL,
	"study_subject_id" INTEGER NOT NULL,
	"composition_id" INTEGER NOT NULL,
	"density"	REAL NOT NULL,

	PRIMARY KEY("id"),
	FOREIGN KEY("study_subject_id") REFERENCES "study_subject"("id")
);
CREATE TABLE IF NOT EXISTS "dbs_control_sheet" (
	"id"			INTEGER NOT NULL,
	"dbs_bag_id" 	INTEGER NOT NULL,
	"label"			VARCHAR NOT NULL,
	"replicates"	INTEGER NOT NULL DEFAULT 1,

	PRIMARY KEY("id"),
	FOREIGN KEY("dbs_bag_id") REFERENCES "dbs_bag"("id"),
	CONSTRAINT "dbs_control_sheet_bag_id_uc" UNIQUE("label", "dbs_bag_id")
);
CREATE TABLE IF NOT EXISTS "strain" (
	"id"			INTEGER NOT NULL,
	"name"			VARCHAR NOT NULL UNIQUE,
	"description"	VARCHAR,

	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "composition" (
	"id"			INTEGER NOT NULL,
	"index"         INTEGER,
	"label"			VARCHAR NOT NULL,
	"legacy"		INTEGER NOT NULL,

	PRIMARY KEY("id"),
	CONSTRAINT "label_index_legacy_uc" UNIQUE("index","label","legacy")
);
CREATE TABLE IF NOT EXISTS "whole_blood_tube" (
	"id"			INTEGER NOT NULL,
	"malaria_blood_control_id" INTEGER NOT NULL,
	"barcode"		VARCHAR,
	"position"		VARCHAR NOT NULL,
	"cryovial_box_id"	INTEGER NOT NULL,
	"state_id" INTEGER REFERENCES "state"("id"),
	"status_id" INTEGER REFERENCES "status"("id"),
	"reason" TEXT,

	PRIMARY KEY ("id"),
	FOREIGN KEY ("cryovial_box_id") REFERENCES "cryovial_box"("id"),
	FOREIGN KEY ("malaria_blood_control_id") REFERENCES "malaria_blood_control"("id")
);
CREATE TABLE IF NOT EXISTS "storage_container" (
	"created"	DATETIME NOT NULL DEFAULT current_timestamp,
	"last_updated"	DATETIME NOT NULL DEFAULT current_timestamp,

	"id"	INTEGER NOT NULL,
	"specimen_id"	INTEGER NOT NULL,
	"comment" TEXT DEFAULT NULL,
	"state_id"	INTEGER NOT NULL,
	"status_id"	INTEGER NOT NULL,

	FOREIGN KEY("state_id") REFERENCES "state"("id"),
	FOREIGN KEY("status_id") REFERENCES "status"("id"),
	FOREIGN KEY("specimen_id") REFERENCES "specimen"("id"),
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "composition_strain" (
	"id"			INTEGER NOT NULL,
	"composition_id"	INTEGER NOT NULL,
	"strain_id" 	INTEGER NOT NULL,
	"percentage"	NUMERIC NOT NULL CHECK("percentage" > 0.0 AND "percentage" <= 100.0),

	PRIMARY KEY ("id"),
	FOREIGN KEY ("strain_id") REFERENCES "strain"("id")
);
CREATE TABLE IF NOT EXISTS "blood_spot_collection" (
	"id"                        INTEGER NOT NULL,
	"malaria_blood_control_id"  INTEGER NOT NULL,
	"total"                     INTEGER NOT NULL CHECK ("total" > 0),
	"exhausted"                 INTEGER NOT NULL DEFAULT 0 CHECK ("exhausted" <= "total" AND "exhausted" >= 0),
	"dbs_control_sheet_id"      INTEGER REFERENCES "dbs_control_sheet"("id"),
	PRIMARY KEY("id"),
	FOREIGN KEY("malaria_blood_control_id") REFERENCES "malaria_blood_control"("id")
);
CREATE TABLE IF NOT EXISTS "archived_dbs_blood_spots" (
	"id" INTEGER NOT NULL,
	"blood_spot_collection_id" INTEGER NOT NULL,
	"archived_spots_count" INTEGER NOT NULL,
	"reason" TEXT,
	"archived_date" DATETIME NOT NULL DEFAULT current_timestamp,
	"status_id" INTEGER NOT NULL,
	PRIMARY KEY("id"),
	FOREIGN KEY("blood_spot_collection_id") REFERENCES "blood_spot_collection"("id"),
	FOREIGN KEY("status_id") REFERENCES "status"("id")
);
CREATE TABLE IF NOT EXISTS "paper" (
	"id"	INTEGER NOT NULL,
	"manifest_id"	INTEGER NOT NULL,
	"manifest_type" VARCHAR NOT NULL,
	"label"	VARCHAR NOT NULL,
	FOREIGN KEY("id") REFERENCES "storage_container"("id"),
	PRIMARY KEY("id"),
	CHECK("manifest_type" IN ("box", "bag")),
	CONSTRAINT "label_container_uc" UNIQUE("label","manifest_id","manifest_type")
);
CREATE TABLE IF NOT EXISTS "box" (
	"created"	DATETIME NOT NULL,
	"last_updated"	DATETIME NOT NULL,
	"id"	INTEGER NOT NULL,
	"location_id"	INTEGER NOT NULL,
	"name"	VARCHAR NOT NULL UNIQUE,
	FOREIGN KEY("location_id") REFERENCES "location"("id"),
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "bag" (
	"created"	DATETIME NOT NULL,
	"last_updated"	DATETIME NOT NULL,
	"id"	INTEGER NOT NULL,
	"location_id"	INTEGER NOT NULL,
	"name"	VARCHAR NOT NULL UNIQUE,
	FOREIGN KEY("location_id") REFERENCES "location"("id"),
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "static_well" (
	"id"			INTEGER NOT NULL,
	"manifest_id"	INTEGER NOT NULL,
	"position"		VARCHAR,

	FOREIGN KEY("id") REFERENCES "storage_container"("id"),
	FOREIGN KEY("manifest_id") REFERENCES "micronix_plate"("id"),
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "location" (
	created DATETIME NOT NULL DEFAULT current_timestamp,
	last_updated DATETIME NOT NULL DEFAULT current_timestamp,
	id INTEGER NOT NULL,
	location_root VARCHAR NOT NULL,
	storage_type_id VARCHAR NOT NULL,
	description TEXT,
	level_I VARCHAR NOT NULL,
	level_II VARCHAR NOT NULL,
	level_III VARCHAR,
	PRIMARY KEY(id),
	FOREIGN KEY(storage_type_id) REFERENCES storage_type(id)
);

CREATE INDEX idx_specimen_study_subject_id ON specimen(study_subject_id);
CREATE INDEX idx_specimen_specimen_type_id ON specimen(specimen_type_id);
CREATE INDEX idx_study_subject_study_id ON study_subject(study_id);
CREATE INDEX idx_storage_container_specimen_id ON storage_container(specimen_id);
CREATE INDEX idx_malaria_blood_control_study_subject_id ON malaria_blood_control(study_subject_id);
CREATE INDEX idx_blood_spot_collection_mbc_id ON blood_spot_collection(malaria_blood_control_id);
CREATE INDEX idx_study_subject_name ON study_subject(name);
CREATE INDEX idx_study_short_code ON study(short_code);
CREATE INDEX idx_specimen_collection_date ON specimen(collection_date);
CREATE INDEX idx_specimen_study_type ON specimen(study_subject_id, specimen_type_id);
CREATE INDEX idx_study_subject_study_name ON study_subject(study_id, name);

CREATE VIEW view_archive_statuses AS
SELECT status.id, status.name FROM state_status_relationship AS ssr
INNER JOIN state ON state.id = ssr.state_id
INNER JOIN status ON status.id = ssr.status_id
WHERE state.name = 'Archived';

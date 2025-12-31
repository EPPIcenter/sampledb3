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
CREATE TABLE sqlite_sequence(name,seq);
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
	"collection_id"	INTEGER NOT NULL,
	"barcode"		VARCHAR NOT NULL UNIQUE,
	"position"		VARCHAR CHECK(length("position") > 1 OR "position" IS NULL),

	PRIMARY KEY("id"),
	FOREIGN KEY("id") REFERENCES "storage_container"("id"),
	FOREIGN KEY("collection_id") REFERENCES "micronix_plate"("id"),

	CONSTRAINT "micronix_tube_position_collection_id_uc" UNIQUE("position", "collection_id")
);
CREATE TABLE _litestream_seq (id INTEGER PRIMARY KEY, seq INTEGER);
CREATE TABLE _litestream_lock (id INTEGER);
CREATE TABLE IF NOT EXISTS "cryovial_tube" (
	"id"			INTEGER NOT NULL,
	"collection_id"	INTEGER NOT NULL,
	"barcode"		VARCHAR,
	"position"		VARCHAR CHECK(length("position") > 1 OR "position" IS NULL),

	PRIMARY KEY("id"),
	FOREIGN KEY("id") REFERENCES "storage_container"("id"),
	FOREIGN KEY("collection_id") REFERENCES "cryovial_box"("id"),

	CONSTRAINT "cryovial_tube_position_collection_id_uc" UNIQUE("position", "collection_id")
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
CREATE TABLE IF NOT EXISTS "composition_strain" (
	"id"			INTEGER NOT NULL,
	"composition_id"	INTEGER NOT NULL,
	"strain_id" 	INTEGER NOT NULL,
	"percentage"	NUMERIC NOT NULL CHECK("percentage" > 0.0 AND "percentage" <= 100.0),

	PRIMARY KEY ("id"),
	FOREIGN KEY ("strain_id") REFERENCES "strain"("id")
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
	"collection_id"	INTEGER NOT NULL,
	"position"		VARCHAR,

	FOREIGN KEY("id") REFERENCES "storage_container"("id"),
	FOREIGN KEY("collection_id") REFERENCES "micronix_plate"("id"),
	PRIMARY KEY("id")
);
CREATE TABLE sqlite_stat1(tbl,idx,stat);
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
CREATE INDEX idx_study_subject_study_id 
ON study_subject(study_id);
CREATE INDEX idx_study_subject_name 
ON study_subject(name);
CREATE INDEX idx_study_short_code 
ON study(short_code);
CREATE INDEX idx_study_subject_study_name 
ON study_subject(study_id, name);
CREATE VIEW view_archive_statuses
AS 
SELECT status.id, status.name FROM state_status_relationship AS ssr
INNER JOIN state ON state.id = ssr.state_id
INNER JOIN status ON status.id = ssr.status_id
WHERE state.name = 'Archived';
CREATE TABLE IF NOT EXISTS "tag" (
                "id"    INTEGER PRIMARY KEY AUTOINCREMENT,
                "name"  VARCHAR NOT NULL UNIQUE
            );
CREATE TABLE IF NOT EXISTS "storage_container_tag" (
                "storage_container_id"  INTEGER NOT NULL,
                "tag_id"                INTEGER NOT NULL,
                PRIMARY KEY("storage_container_id", "tag_id"),
                FOREIGN KEY("storage_container_id") REFERENCES "storage_container"("id"),
                FOREIGN KEY("tag_id") REFERENCES "tag"("id")
            );
CREATE TABLE IF NOT EXISTS "unit" (
                "id"                    INTEGER PRIMARY KEY AUTOINCREMENT,
                "symbol"                VARCHAR NOT NULL UNIQUE,
                "name"                  VARCHAR NOT NULL,
                "category"              VARCHAR NOT NULL,
                "base_unit_id"          INTEGER,
                "conversion_to_base"    REAL DEFAULT 1.0,
                "numerator_unit_id"     INTEGER,
                "denominator_unit_id"   INTEGER,
                FOREIGN KEY("base_unit_id") REFERENCES "unit"("id"),
                FOREIGN KEY("numerator_unit_id") REFERENCES "unit"("id"),
                FOREIGN KEY("denominator_unit_id") REFERENCES "unit"("id")
            );
CREATE TABLE IF NOT EXISTS "control_definition" (
                "id"                    INTEGER PRIMARY KEY AUTOINCREMENT,
                "name"                  VARCHAR NOT NULL UNIQUE,
                "control_type"          VARCHAR NOT NULL CHECK(control_type IN ('blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative')),
                "composition_id"        INTEGER,
                "target_density"        NUMERIC,
                "target_density_unit_id" INTEGER,
                "properties"            TEXT,
                "created"               DATETIME NOT NULL DEFAULT current_timestamp,
                "last_updated"          DATETIME NOT NULL DEFAULT current_timestamp,
                FOREIGN KEY("composition_id") REFERENCES "composition"("id"),
                FOREIGN KEY("target_density_unit_id") REFERENCES "unit"("id")
            );
CREATE TABLE IF NOT EXISTS "control_batch" (
                "id"                    INTEGER PRIMARY KEY AUTOINCREMENT,
                "control_definition_id" INTEGER NOT NULL,
                "name"                  VARCHAR NOT NULL,
                "production_date"       DATE,
                "properties"            TEXT,
                "created"               DATETIME NOT NULL DEFAULT current_timestamp,
                "last_updated"          DATETIME NOT NULL DEFAULT current_timestamp,
                FOREIGN KEY("control_definition_id") REFERENCES "control_definition"("id")
            );
CREATE TABLE IF NOT EXISTS "specimen" (
                id INTEGER NOT NULL PRIMARY KEY,
                study_subject_id INTEGER DEFAULT NULL,
                control_batch_id INTEGER DEFAULT NULL,
                specimen_type_id INTEGER NOT NULL,
                collection_date DATE,
                created DATETIME NOT NULL DEFAULT current_timestamp,
                last_updated DATETIME NOT NULL DEFAULT current_timestamp,
                FOREIGN KEY(study_subject_id) REFERENCES study_subject(id),
                FOREIGN KEY(control_batch_id) REFERENCES control_batch(id),
                FOREIGN KEY(specimen_type_id) REFERENCES specimen_type(id),
                CONSTRAINT specimen_subject_xor_control CHECK (
                    (study_subject_id IS NOT NULL AND control_batch_id IS NULL) OR
                    (study_subject_id IS NULL AND control_batch_id IS NOT NULL)
                )
            );
CREATE INDEX idx_specimen_study_subject_id ON specimen(study_subject_id);
CREATE INDEX idx_specimen_control_batch_id ON specimen(control_batch_id);
CREATE TABLE IF NOT EXISTS "storage_container" (
                id INTEGER NOT NULL PRIMARY KEY,
                specimen_id INTEGER NOT NULL,
                comment TEXT DEFAULT NULL,
                state_id INTEGER NOT NULL,
                total_quantity REAL DEFAULT 1.0,
                remaining_quantity REAL DEFAULT 1.0,
                unit_id INTEGER NOT NULL,
                created DATETIME NOT NULL DEFAULT current_timestamp,
                last_updated DATETIME NOT NULL DEFAULT current_timestamp,
                FOREIGN KEY(state_id) REFERENCES state(id),
                FOREIGN KEY(specimen_id) REFERENCES specimen(id),
                FOREIGN KEY(unit_id) REFERENCES unit(id)
            );
CREATE INDEX idx_storage_container_specimen_id ON storage_container(specimen_id);
CREATE TABLE IF NOT EXISTS "sheet" (
                "id"            INTEGER PRIMARY KEY AUTOINCREMENT,
                "name"          VARCHAR NOT NULL,
                "box_id"        INTEGER DEFAULT NULL,
                "bag_id"        INTEGER DEFAULT NULL,
                "created"       DATETIME NOT NULL DEFAULT current_timestamp,
                "last_updated"  DATETIME NOT NULL DEFAULT current_timestamp,
                FOREIGN KEY("box_id") REFERENCES "box"("id"),
                FOREIGN KEY("bag_id") REFERENCES "bag"("id"),
                CONSTRAINT "sheet_parent_check" CHECK (
                    (box_id IS NOT NULL AND bag_id IS NULL) OR 
                    (box_id IS NULL AND bag_id IS NOT NULL) OR
                    (box_id IS NULL AND bag_id IS NULL)
                ),
                UNIQUE(name, box_id, bag_id)
            );
CREATE TABLE IF NOT EXISTS "paper" (
                "id"            INTEGER NOT NULL PRIMARY KEY,
                "sheet_id"      INTEGER NOT NULL,
                "barcode"       VARCHAR,
                "position"      VARCHAR,
                FOREIGN KEY("id") REFERENCES "storage_container"("id"),
                FOREIGN KEY("sheet_id") REFERENCES "sheet"("id")
            );

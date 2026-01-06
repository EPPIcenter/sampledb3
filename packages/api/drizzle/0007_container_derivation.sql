-- Migration: Add container_derivation table to track parent/child container relationships

CREATE TABLE "container_derivation" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "parent_container_id" INTEGER NOT NULL,
  "child_container_id" INTEGER NOT NULL,
  "derivation_type" VARCHAR NOT NULL,
  "derivation_date" DATETIME,
  "operator_id" INTEGER,
  "protocol" TEXT,
  "notes" TEXT,
  "properties" TEXT,
  "created" DATETIME NOT NULL DEFAULT current_timestamp,
  CONSTRAINT "container_derivation_parent_child_check"
    CHECK ("parent_container_id" != "child_container_id"),
  CONSTRAINT "container_derivation_child_unique"
    UNIQUE ("child_container_id"),
  FOREIGN KEY ("parent_container_id") REFERENCES "storage_container" ("id"),
  FOREIGN KEY ("child_container_id") REFERENCES "storage_container" ("id"),
  FOREIGN KEY ("operator_id") REFERENCES "users" ("id")
);

CREATE INDEX "idx_container_derivation_parent"
  ON "container_derivation" ("parent_container_id");

CREATE INDEX "idx_container_derivation_child"
  ON "container_derivation" ("child_container_id");

CREATE INDEX "idx_container_derivation_type"
  ON "container_derivation" ("derivation_type");

CREATE INDEX "idx_container_derivation_date"
  ON "container_derivation" ("derivation_date");



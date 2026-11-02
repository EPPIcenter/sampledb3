-- Migration 011: indexes for Collection, barcode, Sheet and Tag lookups, and the schema.ts
-- indexes that older production databases lack (issue #106).
--
-- Production files that predate the versioned snapshot carry some schema.ts indexes under
-- other names (idx_specimen_study_subject_id for specimen_study_subject_id_idx, and so on).
-- Those are dropped and recreated under the schema.ts name, so every database has one index
-- per declaration. idx_study_subject_study_name duplicates the unique
-- study_subject_study_name_idx (migration 005) and is dropped.
--
-- Not added here: the unique idx_specimen_study_subject_type_date and
-- idx_specimen_control_batch_type_date. New installs have them, but production files hold
-- duplicate collection events, and adding them would fail this migration.
DROP INDEX IF EXISTS idx_specimen_study_subject_id;--> statement-breakpoint
DROP INDEX IF EXISTS idx_specimen_control_batch_id;--> statement-breakpoint
DROP INDEX IF EXISTS idx_storage_container_specimen_id;--> statement-breakpoint
DROP INDEX IF EXISTS idx_study_short_code;--> statement-breakpoint
DROP INDEX IF EXISTS idx_study_subject_study_id;--> statement-breakpoint
DROP INDEX IF EXISTS idx_study_subject_name;--> statement-breakpoint
DROP INDEX IF EXISTS idx_study_subject_study_name;--> statement-breakpoint
DROP INDEX IF EXISTS idx_location_new_parent_id;--> statement-breakpoint
DROP INDEX IF EXISTS idx_location_new_path;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS study_title_idx ON study(title);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS study_short_code_idx ON study(short_code);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS study_subject_study_id_idx ON study_subject(study_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS study_subject_name_idx ON study_subject(name);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS control_batch_control_definition_id_idx ON control_batch(control_definition_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specimen_study_subject_id_idx ON specimen(study_subject_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specimen_control_batch_id_idx ON specimen(control_batch_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specimen_collection_date_idx ON specimen(collection_date);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specimen_specimen_type_id_idx ON specimen(specimen_type_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS storage_container_specimen_id_idx ON storage_container(specimen_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS storage_container_tag_tag_id_idx ON storage_container_tag(tag_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_location_parent_id ON location(parent_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_location_path ON location(path);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS micronix_plate_location_id_idx ON micronix_plate(location_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS micronix_tube_collection_id_idx ON micronix_tube(collection_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS micronix_tube_barcode_folded_idx ON micronix_tube(lower(trim(barcode)));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cryovial_box_location_id_idx ON cryovial_box(location_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cryovial_tube_collection_id_idx ON cryovial_tube(collection_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cryovial_tube_barcode_idx ON cryovial_tube(barcode);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cryovial_tube_barcode_folded_idx ON cryovial_tube(lower(trim(barcode)));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS bag_location_id_idx ON bag(location_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sheet_bag_id_idx ON sheet(bag_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS paper_sheet_id_sublabel_idx ON paper(sheet_id, sublabel);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS paper_sublabel_idx ON paper(sublabel);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS static_well_collection_id_idx ON static_well(collection_id);

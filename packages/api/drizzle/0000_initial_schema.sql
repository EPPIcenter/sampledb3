PRAGMA foreign_keys=OFF;--> statement-breakpoint
-- Initial schema migration for greenfield dev database
-- This creates all tables in the correct order with proper dependencies

-- Users and authentication
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`email` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`created` text NOT NULL DEFAULT current_timestamp,
	`last_login` text
);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);--> statement-breakpoint
-- Tags and Units
CREATE TABLE `tag` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL UNIQUE
);--> statement-breakpoint
CREATE TABLE `unit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`base_unit_id` integer,
	`conversion_to_base` real DEFAULT 1.0,
	`numerator_unit_id` integer,
	`denominator_unit_id` integer,
	FOREIGN KEY (`base_unit_id`) REFERENCES `unit`(`id`),
	FOREIGN KEY (`numerator_unit_id`) REFERENCES `unit`(`id`),
	FOREIGN KEY (`denominator_unit_id`) REFERENCES `unit`(`id`)
);--> statement-breakpoint
-- Studies and subjects
CREATE TABLE `study` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL UNIQUE,
	`description` text,
	`short_code` text NOT NULL UNIQUE,
	`is_longitudinal` integer NOT NULL,
	`lead_person` text NOT NULL,
	`created` text NOT NULL,
	`last_updated` text NOT NULL
);--> statement-breakpoint
CREATE TABLE `study_subject` (
	`id` integer PRIMARY KEY NOT NULL,
	`study_id` integer NOT NULL,
	`name` text NOT NULL,
	`created` text NOT NULL,
	`last_updated` text NOT NULL,
	FOREIGN KEY (`study_id`) REFERENCES `study`(`id`)
);--> statement-breakpoint
-- Control Production Hierarchy
CREATE TABLE `control_definition` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL UNIQUE,
	`control_type` text NOT NULL,
	`properties` text,
	`created` text NOT NULL DEFAULT current_timestamp,
	`last_updated` text NOT NULL DEFAULT current_timestamp,
	CHECK (`control_type` IN ('blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative'))
);--> statement-breakpoint
CREATE TABLE `control_batch` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`control_definition_id` integer NOT NULL,
	`name` text NOT NULL,
	`production_date` text,
	`properties` text,
	`created` text NOT NULL DEFAULT current_timestamp,
	`last_updated` text NOT NULL DEFAULT current_timestamp,
	FOREIGN KEY (`control_definition_id`) REFERENCES `control_definition`(`id`)
);--> statement-breakpoint
-- Other polymorphic source tables
CREATE TABLE `reagent` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`reagent_type` text NOT NULL,
	`vendor` text,
	`catalog_number` text,
	`lot_number` text,
	`received_date` text,
	`expiration_date` text,
	`storage_temp` text,
	`properties` text,
	`created` text NOT NULL DEFAULT current_timestamp,
	`last_updated` text NOT NULL DEFAULT current_timestamp
);--> statement-breakpoint
CREATE TABLE `cell_line` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL UNIQUE,
	`species` text NOT NULL,
	`strain` text,
	`source` text,
	`properties` text,
	`created` text NOT NULL DEFAULT current_timestamp,
	`last_updated` text NOT NULL DEFAULT current_timestamp
);--> statement-breakpoint
CREATE TABLE `plasmid` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL UNIQUE,
	`backbone` text,
	`insert_name` text,
	`insert_size_bp` integer,
	`resistance` text,
	`source` text,
	`properties` text,
	`created` text NOT NULL DEFAULT current_timestamp,
	`last_updated` text NOT NULL DEFAULT current_timestamp
);--> statement-breakpoint
CREATE TABLE `standard` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`standard_type` text NOT NULL,
	`manufacturer` text,
	`catalog_number` text,
	`lot_number` text,
	`properties` text,
	`created` text NOT NULL DEFAULT current_timestamp,
	`last_updated` text NOT NULL DEFAULT current_timestamp
);--> statement-breakpoint
-- Specimen types
CREATE TABLE `specimen_type` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL UNIQUE,
	`created` text NOT NULL,
	`last_updated` text NOT NULL
);--> statement-breakpoint
-- Core specimen table
CREATE TABLE `specimen` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`study_subject_id` integer,
	`control_batch_id` integer,
	`specimen_type_id` integer NOT NULL,
	`collection_date` text,
	`created` text NOT NULL DEFAULT current_timestamp,
	`last_updated` text NOT NULL DEFAULT current_timestamp,
	FOREIGN KEY (`study_subject_id`) REFERENCES `study_subject`(`id`),
	FOREIGN KEY (`control_batch_id`) REFERENCES `control_batch`(`id`),
	FOREIGN KEY (`specimen_type_id`) REFERENCES `specimen_type`(`id`),
	CHECK (
		(`study_subject_id` IS NOT NULL AND `control_batch_id` IS NULL) OR
		(`study_subject_id` IS NULL AND `control_batch_id` IS NOT NULL)
	)
);--> statement-breakpoint
-- Storage container
CREATE TABLE `storage_container` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`specimen_id` integer NOT NULL,
	`comment` text,
	`total_quantity` real DEFAULT 1.0,
	`remaining_quantity` real DEFAULT 1.0,
	`unit_id` integer NOT NULL,
	`created` text NOT NULL DEFAULT current_timestamp,
	`last_updated` text NOT NULL DEFAULT current_timestamp,
	FOREIGN KEY (`specimen_id`) REFERENCES `specimen`(`id`),
	FOREIGN KEY (`unit_id`) REFERENCES `unit`(`id`)
);--> statement-breakpoint
CREATE TABLE `storage_container_tag` (
	`storage_container_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY (`storage_container_id`, `tag_id`),
	FOREIGN KEY (`storage_container_id`) REFERENCES `storage_container`(`id`),
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`)
);--> statement-breakpoint
-- Additional reference tables
CREATE TABLE `strain` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL UNIQUE,
	`description` text
);--> statement-breakpoint
CREATE TABLE `storage_type` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL UNIQUE,
	`description` text
);--> statement-breakpoint
CREATE TABLE `version` (
	`name` text NOT NULL
);--> statement-breakpoint
-- Application settings
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);--> statement-breakpoint
-- Locations (hierarchical parent-child structure)
CREATE TABLE `location` (
	`id` integer PRIMARY KEY NOT NULL,
	`parent_id` integer,
	`name` text NOT NULL,
	`storage_type_id` text,
	`description` text,
	`can_contain_collections` integer NOT NULL DEFAULT 0,
	`path` text,
	`created` text NOT NULL DEFAULT current_timestamp,
	`last_updated` text NOT NULL DEFAULT current_timestamp,
	FOREIGN KEY (`parent_id`) REFERENCES `location`(`id`),
	FOREIGN KEY (`storage_type_id`) REFERENCES `storage_type`(`id`),
	UNIQUE (`parent_id`, `name`),
	CHECK (`can_contain_collections` IN (0, 1)),
	CHECK (
		(`parent_id` IS NULL AND `storage_type_id` IS NOT NULL) OR
		(`parent_id` IS NOT NULL AND `storage_type_id` IS NULL)
	)
);--> statement-breakpoint
CREATE INDEX `idx_location_parent_id` ON `location`(`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_location_path` ON `location`(`path`);--> statement-breakpoint
-- Container collections
CREATE TABLE `micronix_plate` (
	`id` integer PRIMARY KEY NOT NULL,
	`location_id` integer NOT NULL,
	`name` text NOT NULL UNIQUE,
	`barcode` text UNIQUE,
	`created` text NOT NULL DEFAULT current_timestamp,
	`last_updated` text NOT NULL DEFAULT current_timestamp,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`)
);--> statement-breakpoint
CREATE TABLE `micronix_tube` (
	`id` integer PRIMARY KEY NOT NULL,
	`collection_id` integer NOT NULL,
	`barcode` text NOT NULL UNIQUE,
	`position` text,
	FOREIGN KEY (`id`) REFERENCES `storage_container`(`id`),
	FOREIGN KEY (`collection_id`) REFERENCES `micronix_plate`(`id`)
);--> statement-breakpoint
CREATE TABLE `cryovial_box` (
	`id` integer PRIMARY KEY NOT NULL,
	`location_id` integer NOT NULL,
	`name` text NOT NULL UNIQUE,
	`barcode` text UNIQUE,
	`created` text NOT NULL DEFAULT current_timestamp,
	`last_updated` text NOT NULL DEFAULT current_timestamp,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`)
);--> statement-breakpoint
CREATE TABLE `cryovial_tube` (
	`id` integer PRIMARY KEY NOT NULL,
	`collection_id` integer NOT NULL,
	`barcode` text,
	`position` text,
	FOREIGN KEY (`id`) REFERENCES `storage_container`(`id`),
	FOREIGN KEY (`collection_id`) REFERENCES `cryovial_box`(`id`)
);--> statement-breakpoint
CREATE TABLE `box` (
	`id` integer PRIMARY KEY NOT NULL,
	`location_id` integer NOT NULL,
	`name` text NOT NULL UNIQUE,
	`created` text NOT NULL,
	`last_updated` text NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`)
);--> statement-breakpoint
CREATE TABLE `bag` (
	`id` integer PRIMARY KEY NOT NULL,
	`location_id` integer NOT NULL,
	`name` text NOT NULL UNIQUE,
	`created` text NOT NULL,
	`last_updated` text NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`)
);--> statement-breakpoint
CREATE TABLE `sheet` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`box_id` integer,
	`bag_id` integer,
	`created` text NOT NULL DEFAULT current_timestamp,
	`last_updated` text NOT NULL DEFAULT current_timestamp,
	FOREIGN KEY (`box_id`) REFERENCES `box`(`id`),
	FOREIGN KEY (`bag_id`) REFERENCES `bag`(`id`),
	CHECK (
		(`box_id` IS NOT NULL AND `bag_id` IS NULL) OR
		(`box_id` IS NULL AND `bag_id` IS NOT NULL) OR
		(`box_id` IS NULL AND `bag_id` IS NULL)
	),
	UNIQUE (`name`, `box_id`, `bag_id`)
);--> statement-breakpoint
CREATE TABLE `paper` (
	`id` integer PRIMARY KEY NOT NULL,
	`sheet_id` integer NOT NULL,
	`barcode` text,
	`position` text,
	FOREIGN KEY (`id`) REFERENCES `storage_container`(`id`),
	FOREIGN KEY (`sheet_id`) REFERENCES `sheet`(`id`)
);--> statement-breakpoint
CREATE TABLE `static_well` (
	`id` integer PRIMARY KEY NOT NULL,
	`collection_id` integer NOT NULL,
	`position` text,
	FOREIGN KEY (`id`) REFERENCES `storage_container`(`id`),
	FOREIGN KEY (`collection_id`) REFERENCES `micronix_plate`(`id`)
);--> statement-breakpoint
-- Constraint junction tables
CREATE TABLE `specimen_type_container_type` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`specimen_type_id` integer NOT NULL,
	`container_type` text NOT NULL,
	`created` text NOT NULL DEFAULT current_timestamp,
	FOREIGN KEY (`specimen_type_id`) REFERENCES `specimen_type`(`id`) ON DELETE CASCADE,
	UNIQUE (`specimen_type_id`, `container_type`),
	CHECK (`container_type` IN ('paper', 'cryovial_tube', 'micronix_tube', 'static_well'))
);--> statement-breakpoint
CREATE TABLE `container_type_unit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`container_type` text NOT NULL,
	`unit_id` integer NOT NULL,
	`created` text NOT NULL DEFAULT current_timestamp,
	FOREIGN KEY (`unit_id`) REFERENCES `unit`(`id`) ON DELETE CASCADE,
	UNIQUE (`container_type`, `unit_id`),
	CHECK (`container_type` IN ('paper', 'cryovial_tube', 'micronix_tube', 'static_well'))
);--> statement-breakpoint
PRAGMA foreign_keys=ON;

CREATE TABLE `bag` (
	`id` integer PRIMARY KEY NOT NULL,
	`location_id` integer NOT NULL,
	`name` text NOT NULL,
	`created` text NOT NULL,
	`last_updated` text NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bag_name_unique` ON `bag` (`name`);--> statement-breakpoint
CREATE TABLE `box` (
	`id` integer PRIMARY KEY NOT NULL,
	`location_id` integer NOT NULL,
	`name` text NOT NULL,
	`created` text NOT NULL,
	`last_updated` text NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `box_name_unique` ON `box` (`name`);--> statement-breakpoint
CREATE TABLE `cell_line` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`species` text NOT NULL,
	`strain` text,
	`source` text,
	`properties` text,
	`created` text DEFAULT current_timestamp NOT NULL,
	`last_updated` text DEFAULT current_timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cell_line_name_unique` ON `cell_line` (`name`);--> statement-breakpoint
CREATE TABLE `composition` (
	`id` integer PRIMARY KEY NOT NULL,
	`index` integer,
	`label` text NOT NULL,
	`legacy` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `composition_strain` (
	`id` integer PRIMARY KEY NOT NULL,
	`composition_id` integer NOT NULL,
	`strain_id` integer NOT NULL,
	`percentage` real NOT NULL,
	FOREIGN KEY (`composition_id`) REFERENCES `composition`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`strain_id`) REFERENCES `strain`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `control_batch` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`control_definition_id` integer NOT NULL,
	`name` text NOT NULL,
	`production_date` text,
	`properties` text,
	`created` text DEFAULT current_timestamp NOT NULL,
	`last_updated` text DEFAULT current_timestamp NOT NULL,
	FOREIGN KEY (`control_definition_id`) REFERENCES `control_definition`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `control_definition` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`control_type` text NOT NULL,
	`composition_id` integer,
	`target_density` real,
	`target_density_unit_id` integer,
	`properties` text,
	`created` text DEFAULT current_timestamp NOT NULL,
	`last_updated` text DEFAULT current_timestamp NOT NULL,
	FOREIGN KEY (`composition_id`) REFERENCES `composition`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_density_unit_id`) REFERENCES `unit`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "control_type_check" CHECK("control_definition"."control_type" IN ('blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `control_definition_name_unique` ON `control_definition` (`name`);--> statement-breakpoint
CREATE TABLE `cryovial_box` (
	`id` integer PRIMARY KEY NOT NULL,
	`location_id` integer NOT NULL,
	`name` text NOT NULL,
	`barcode` text,
	`created` text DEFAULT current_timestamp NOT NULL,
	`last_updated` text DEFAULT current_timestamp NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cryovial_box_name_unique` ON `cryovial_box` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `cryovial_box_barcode_unique` ON `cryovial_box` (`barcode`);--> statement-breakpoint
CREATE TABLE `cryovial_tube` (
	`id` integer PRIMARY KEY NOT NULL,
	`manifest_id` integer NOT NULL,
	`barcode` text,
	`position` text,
	FOREIGN KEY (`id`) REFERENCES `storage_container`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`manifest_id`) REFERENCES `cryovial_box`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `location` (
	`id` integer PRIMARY KEY NOT NULL,
	`location_root` text NOT NULL,
	`storage_type_id` text NOT NULL,
	`description` text,
	`level_I` text NOT NULL,
	`level_II` text NOT NULL,
	`level_III` text,
	`created` text DEFAULT current_timestamp NOT NULL,
	`last_updated` text DEFAULT current_timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE `micronix_plate` (
	`id` integer PRIMARY KEY NOT NULL,
	`location_id` integer NOT NULL,
	`name` text NOT NULL,
	`barcode` text,
	`created` text DEFAULT current_timestamp NOT NULL,
	`last_updated` text DEFAULT current_timestamp NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micronix_plate_name_unique` ON `micronix_plate` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `micronix_plate_barcode_unique` ON `micronix_plate` (`barcode`);--> statement-breakpoint
CREATE TABLE `micronix_tube` (
	`id` integer PRIMARY KEY NOT NULL,
	`manifest_id` integer NOT NULL,
	`barcode` text NOT NULL,
	`position` text,
	FOREIGN KEY (`id`) REFERENCES `storage_container`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`manifest_id`) REFERENCES `micronix_plate`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micronix_tube_barcode_unique` ON `micronix_tube` (`barcode`);--> statement-breakpoint
CREATE TABLE `paper` (
	`id` integer PRIMARY KEY NOT NULL,
	`sheet_id` integer NOT NULL,
	`barcode` text,
	`position` text,
	FOREIGN KEY (`id`) REFERENCES `storage_container`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sheet_id`) REFERENCES `sheet`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `plasmid` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`backbone` text,
	`insert_name` text,
	`insert_size_bp` integer,
	`resistance` text,
	`source` text,
	`properties` text,
	`created` text DEFAULT current_timestamp NOT NULL,
	`last_updated` text DEFAULT current_timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plasmid_name_unique` ON `plasmid` (`name`);--> statement-breakpoint
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
	`created` text DEFAULT current_timestamp NOT NULL,
	`last_updated` text DEFAULT current_timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sample_type` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`parent_id` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sample_type_name_unique` ON `sample_type` (`name`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sheet` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`box_id` integer,
	`bag_id` integer,
	`created` text DEFAULT current_timestamp NOT NULL,
	`last_updated` text DEFAULT current_timestamp NOT NULL,
	FOREIGN KEY (`box_id`) REFERENCES `box`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bag_id`) REFERENCES `bag`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sheet_name_box_id_bag_id_unique` ON `sheet` (`name`,`box_id`,`bag_id`);--> statement-breakpoint
CREATE TABLE `specimen` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`study_subject_id` integer,
	`control_batch_id` integer,
	`specimen_type_id` integer NOT NULL,
	`collection_date` text,
	`created` text DEFAULT current_timestamp NOT NULL,
	`last_updated` text DEFAULT current_timestamp NOT NULL,
	FOREIGN KEY (`study_subject_id`) REFERENCES `study_subject`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`control_batch_id`) REFERENCES `control_batch`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`specimen_type_id`) REFERENCES `specimen_type`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `specimen_type` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created` text NOT NULL,
	`last_updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `specimen_type_name_unique` ON `specimen_type` (`name`);--> statement-breakpoint
CREATE TABLE `standard` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`standard_type` text NOT NULL,
	`manufacturer` text,
	`catalog_number` text,
	`lot_number` text,
	`properties` text,
	`created` text DEFAULT current_timestamp NOT NULL,
	`last_updated` text DEFAULT current_timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE `state` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `state_name_unique` ON `state` (`name`);--> statement-breakpoint
CREATE TABLE `static_well` (
	`id` integer PRIMARY KEY NOT NULL,
	`manifest_id` integer NOT NULL,
	`position` text,
	FOREIGN KEY (`id`) REFERENCES `storage_container`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`manifest_id`) REFERENCES `micronix_plate`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `storage_container` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`specimen_id` integer NOT NULL,
	`comment` text,
	`state_id` integer NOT NULL,
	`total_quantity` real DEFAULT 1,
	`remaining_quantity` real DEFAULT 1,
	`unit_id` integer NOT NULL,
	`created` text DEFAULT current_timestamp NOT NULL,
	`last_updated` text DEFAULT current_timestamp NOT NULL,
	FOREIGN KEY (`specimen_id`) REFERENCES `specimen`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`state_id`) REFERENCES `state`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `unit`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `storage_container_tag` (
	`storage_container_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`storage_container_id`, `tag_id`),
	FOREIGN KEY (`storage_container_id`) REFERENCES `storage_container`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `storage_type` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storage_type_name_unique` ON `storage_type` (`name`);--> statement-breakpoint
CREATE TABLE `strain` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `strain_name_unique` ON `strain` (`name`);--> statement-breakpoint
CREATE TABLE `study` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`short_code` text NOT NULL,
	`is_longitudinal` integer NOT NULL,
	`lead_person` text NOT NULL,
	`created` text NOT NULL,
	`last_updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_title_unique` ON `study` (`title`);--> statement-breakpoint
CREATE UNIQUE INDEX `study_short_code_unique` ON `study` (`short_code`);--> statement-breakpoint
CREATE TABLE `study_subject` (
	`id` integer PRIMARY KEY NOT NULL,
	`study_id` integer NOT NULL,
	`name` text NOT NULL,
	`created` text NOT NULL,
	`last_updated` text NOT NULL,
	FOREIGN KEY (`study_id`) REFERENCES `study`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tag` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_name_unique` ON `tag` (`name`);--> statement-breakpoint
CREATE TABLE `tube` (
	`id` integer PRIMARY KEY NOT NULL,
	`box_id` integer NOT NULL,
	`box_position` text NOT NULL,
	`label` text NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `storage_container`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`box_id`) REFERENCES `box`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `unit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`base_unit_id` integer,
	`conversion_to_base` real DEFAULT 1,
	`numerator_unit_id` integer,
	`denominator_unit_id` integer,
	FOREIGN KEY (`base_unit_id`) REFERENCES `unit`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`numerator_unit_id`) REFERENCES `unit`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`denominator_unit_id`) REFERENCES `unit`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unit_symbol_unique` ON `unit` (`symbol`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`created` text DEFAULT current_timestamp NOT NULL,
	`last_login` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `version` (
	`name` text NOT NULL
);

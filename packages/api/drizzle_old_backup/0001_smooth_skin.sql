PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sheet` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`box_id` integer,
	`bag_id` integer,
	`created` text DEFAULT current_timestamp NOT NULL,
	`last_updated` text DEFAULT current_timestamp NOT NULL,
	FOREIGN KEY (`box_id`) REFERENCES `box`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bag_id`) REFERENCES `bag`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sheet_parent_check" CHECK(
    ("__new_sheet"."box_id" IS NOT NULL AND "__new_sheet"."bag_id" IS NULL) OR
    ("__new_sheet"."box_id" IS NULL AND "__new_sheet"."bag_id" IS NOT NULL) OR
    ("__new_sheet"."box_id" IS NULL AND "__new_sheet"."bag_id" IS NULL)
  )
);
--> statement-breakpoint
INSERT INTO `__new_sheet`("id", "name", "box_id", "bag_id", "created", "last_updated") SELECT "id", "name", "box_id", "bag_id", "created", "last_updated" FROM `sheet`;--> statement-breakpoint
DROP TABLE `sheet`;--> statement-breakpoint
ALTER TABLE `__new_sheet` RENAME TO `sheet`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `sheet_name_box_id_bag_id_unique` ON `sheet` (`name`,`box_id`,`bag_id`);--> statement-breakpoint
CREATE TABLE `__new_specimen` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`study_subject_id` integer,
	`control_batch_id` integer,
	`specimen_type_id` integer NOT NULL,
	`collection_date` text,
	`created` text DEFAULT current_timestamp NOT NULL,
	`last_updated` text DEFAULT current_timestamp NOT NULL,
	FOREIGN KEY (`study_subject_id`) REFERENCES `study_subject`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`control_batch_id`) REFERENCES `control_batch`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`specimen_type_id`) REFERENCES `specimen_type`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "specimen_subject_xor_control" CHECK(
    ("__new_specimen"."study_subject_id" IS NOT NULL AND "__new_specimen"."control_batch_id" IS NULL) OR
    ("__new_specimen"."study_subject_id" IS NULL AND "__new_specimen"."control_batch_id" IS NOT NULL)
  )
);
--> statement-breakpoint
INSERT INTO `__new_specimen`("id", "study_subject_id", "control_batch_id", "specimen_type_id", "collection_date", "created", "last_updated") SELECT "id", "study_subject_id", "control_batch_id", "specimen_type_id", "collection_date", "created", "last_updated" FROM `specimen`;--> statement-breakpoint
DROP TABLE `specimen`;--> statement-breakpoint
ALTER TABLE `__new_specimen` RENAME TO `specimen`;
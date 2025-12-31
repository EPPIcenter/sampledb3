PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_storage_container` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`specimen_id` integer NOT NULL,
	`comment` text,
	`total_quantity` real DEFAULT 1,
	`remaining_quantity` real DEFAULT 1,
	`unit_id` integer NOT NULL,
	`created` text DEFAULT current_timestamp NOT NULL,
	`last_updated` text DEFAULT current_timestamp NOT NULL,
	FOREIGN KEY (`specimen_id`) REFERENCES `specimen`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `unit`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_storage_container`("id", "specimen_id", "comment", "total_quantity", "remaining_quantity", "unit_id", "created", "last_updated") SELECT "id", "specimen_id", "comment", "total_quantity", "remaining_quantity", "unit_id", "created", "last_updated" FROM `storage_container`;--> statement-breakpoint
DROP TABLE `storage_container`;--> statement-breakpoint
ALTER TABLE `__new_storage_container` RENAME TO `storage_container`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
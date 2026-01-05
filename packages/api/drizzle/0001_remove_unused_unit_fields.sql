PRAGMA foreign_keys=OFF;--> statement-breakpoint
-- Migration: Remove unused unit fields (baseUnitId, conversionToBase, numeratorUnitId, denominatorUnitId)
-- These fields were never used in the application and add unnecessary complexity

-- SQLite doesn't support DROP COLUMN directly, so we need to:
-- 1. Create new table without the columns
-- 2. Copy data
-- 3. Drop old table
-- 4. Rename new table

CREATE TABLE `unit_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`category` text NOT NULL
);--> statement-breakpoint

-- Copy existing data (excluding the unused columns)
INSERT INTO `unit_new` (`id`, `symbol`, `name`, `category`)
SELECT `id`, `symbol`, `name`, `category` FROM `unit`;--> statement-breakpoint

-- Drop old table
DROP TABLE `unit`;--> statement-breakpoint

-- Rename new table to original name
ALTER TABLE `unit_new` RENAME TO `unit`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
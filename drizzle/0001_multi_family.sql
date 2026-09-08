CREATE TABLE `households` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_households_slug` ON `households` (`slug`);
--> statement-breakpoint
CREATE TABLE `household_members` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `household_id` integer NOT NULL,
  `user_id` text,
  `email` text NOT NULL,
  `display_name` text NOT NULL,
  `role` text DEFAULT 'member' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_household_members_email` ON `household_members` (`email`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_household_members_user_id` ON `household_members` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_household_members_household` ON `household_members` (`household_id`);
--> statement-breakpoint
ALTER TABLE `categories` ADD `household_id` integer REFERENCES `households`(`id`);
--> statement-breakpoint
ALTER TABLE `expenses` ADD `household_id` integer REFERENCES `households`(`id`);
--> statement-breakpoint
DROP INDEX `idx_categories_name`;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_categories_household_name` ON `categories` (`household_id`,`name`);
--> statement-breakpoint
DROP INDEX `idx_expenses_occurred_at`;
--> statement-breakpoint
CREATE INDEX `idx_expenses_household_date` ON `expenses` (`household_id`,`occurred_at`);
--> statement-breakpoint
CREATE INDEX `idx_expenses_household_category_date` ON `expenses` (`household_id`,`category_id`,`occurred_at`);
--> statement-breakpoint
CREATE INDEX `idx_expenses_household_payment_date` ON `expenses` (`household_id`,`payment_method`,`occurred_at`);
--> statement-breakpoint
PRAGMA optimize;

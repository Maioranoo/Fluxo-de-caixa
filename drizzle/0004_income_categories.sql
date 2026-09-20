ALTER TABLE `categories` ADD `kind` text DEFAULT 'expense' NOT NULL;
--> statement-breakpoint
ALTER TABLE `incomes` ADD `category_id` integer REFERENCES categories(id);
--> statement-breakpoint
CREATE INDEX `idx_incomes_household_category_date` ON `incomes` (`household_id`,`category_id`,`occurred_at`);

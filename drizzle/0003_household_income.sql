ALTER TABLE `households` ADD `allow_income` integer DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE `incomes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `household_id` integer NOT NULL,
  `amount_cents` integer NOT NULL,
  `description` text NOT NULL,
  `person` text NOT NULL,
  `occurred_at` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_incomes_household_date` ON `incomes` (`household_id`,`occurred_at`);

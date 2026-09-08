CREATE TABLE `payment_methods` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `household_id` integer NOT NULL,
  `key` text NOT NULL,
  `name` text NOT NULL,
  `is_card` integer DEFAULT false NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_methods_household_name` ON `payment_methods` (`household_id`,`name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_methods_household_key` ON `payment_methods` (`household_id`,`key`);

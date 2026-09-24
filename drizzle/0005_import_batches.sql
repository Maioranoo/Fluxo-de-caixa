PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `import_batches` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `household_id` integer NOT NULL,
  `original_filename` text NOT NULL,
  `file_hash` text NOT NULL,
  `source_type` text NOT NULL,
  `mode` text NOT NULL,
  `reference_month` text NOT NULL,
  `imported_by_member_id` integer,
  `imported_by_name` text NOT NULL,
  `default_payment_method` text,
  `default_person` text,
  `item_count` integer NOT NULL,
  `total_cents` integer NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`household_id`) REFERENCES `households`(`id`),
  FOREIGN KEY (`imported_by_member_id`) REFERENCES `household_members`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `idx_import_batches_household_month` ON `import_batches` (`household_id`,`reference_month`);
--> statement-breakpoint
CREATE INDEX `idx_import_batches_household_hash` ON `import_batches` (`household_id`,`file_hash`);
--> statement-breakpoint
CREATE TABLE `category_rules` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `household_id` integer NOT NULL,
  `category_id` integer NOT NULL,
  `pattern` text NOT NULL,
  `source` text DEFAULT 'learned' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`household_id`) REFERENCES `households`(`id`),
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_category_rules_household_pattern` ON `category_rules` (`household_id`,`pattern`);
--> statement-breakpoint
CREATE TABLE `import_batch_categories` (
  `import_batch_id` integer NOT NULL,
  `category_id` integer NOT NULL,
  FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_import_batch_categories_pair` ON `import_batch_categories` (`import_batch_id`,`category_id`);
--> statement-breakpoint
CREATE TABLE `expenses_new` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `household_id` integer,
  `amount_cents` integer NOT NULL,
  `description` text,
  `category_id` integer,
  `payment_method` text,
  `person` text,
  `occurred_at` text,
  `import_batch_id` integer,
  `reference_month` text,
  `import_fingerprint` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`household_id`) REFERENCES `households`(`id`),
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`),
  FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `expenses_new` (`id`,`household_id`,`amount_cents`,`description`,`category_id`,`payment_method`,`person`,`occurred_at`,`created_at`)
SELECT `id`,`household_id`,`amount_cents`,`description`,`category_id`,`payment_method`,`person`,`occurred_at`,`created_at` FROM `expenses`;
--> statement-breakpoint
DROP TABLE `expenses`;
--> statement-breakpoint
ALTER TABLE `expenses_new` RENAME TO `expenses`;
--> statement-breakpoint
CREATE INDEX `idx_expenses_household_date` ON `expenses` (`household_id`,`occurred_at`);
--> statement-breakpoint
CREATE INDEX `idx_expenses_household_category_date` ON `expenses` (`household_id`,`category_id`,`occurred_at`);
--> statement-breakpoint
CREATE INDEX `idx_expenses_household_payment_date` ON `expenses` (`household_id`,`payment_method`,`occurred_at`);
--> statement-breakpoint
CREATE INDEX `idx_expenses_household_reference_month` ON `expenses` (`household_id`,`reference_month`);
--> statement-breakpoint
CREATE INDEX `idx_expenses_household_fingerprint` ON `expenses` (`household_id`,`import_fingerprint`);
--> statement-breakpoint
CREATE INDEX `idx_expenses_import_batch` ON `expenses` (`import_batch_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;

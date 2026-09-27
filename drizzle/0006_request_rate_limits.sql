CREATE TABLE IF NOT EXISTS `request_rate_limits` (
  `bucket_key` text PRIMARY KEY NOT NULL,
  `hits` integer NOT NULL,
  `expires_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_request_rate_limits_expires` ON `request_rate_limits` (`expires_at`);

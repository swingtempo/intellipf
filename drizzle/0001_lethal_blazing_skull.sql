CREATE TABLE `security_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ticker` text NOT NULL,
	`allocations` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_allocations_user_ticker_unique` ON `security_allocations` (`user_id`,`ticker`);--> statement-breakpoint
CREATE INDEX `security_allocations_ticker_idx` ON `security_allocations` (`ticker`);
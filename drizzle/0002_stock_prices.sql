CREATE TABLE `stock_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`ticker` text NOT NULL,
	`date` text NOT NULL,
	`price` real NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_prices_ticker_date_unique` ON `stock_prices` (`ticker`,`date`);--> statement-breakpoint
CREATE INDEX `stock_prices_ticker_idx` ON `stock_prices` (`ticker`);

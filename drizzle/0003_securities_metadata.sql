ALTER TABLE `securities` ADD COLUMN `sector` text;--> statement-breakpoint
ALTER TABLE `securities` ADD COLUMN `industry` text;--> statement-breakpoint
CREATE UNIQUE INDEX `securities_ticker_unique` ON `securities` (`ticker`);

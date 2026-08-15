ALTER TABLE `quiz_sessions` ADD `mode` text DEFAULT 'practice' NOT NULL;--> statement-breakpoint
ALTER TABLE `quiz_sessions` ADD `exam_mode` text;--> statement-breakpoint
ALTER TABLE `quiz_sessions` ADD `time_limit_seconds` integer;--> statement-breakpoint
ALTER TABLE `quiz_sessions` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `quiz_sessions` ADD `choice_orders` text;--> statement-breakpoint
ALTER TABLE `quiz_sessions` ADD `flagged` text;--> statement-breakpoint
ALTER TABLE `quiz_sessions` ADD `scaled_score` integer;--> statement-breakpoint
ALTER TABLE `quiz_sessions` ADD `passed` integer;
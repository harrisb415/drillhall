CREATE TABLE `course_progress` (
	`user_id` text NOT NULL,
	`cert_id` integer NOT NULL,
	`lesson_id` text NOT NULL,
	`completed_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `cert_id`, `lesson_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cert_id`) REFERENCES `certs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `flashcard_state` (
	`user_id` text NOT NULL,
	`cert_id` integer NOT NULL,
	`domain_code` text,
	`hide_known` integer DEFAULT false NOT NULL,
	`seed` integer DEFAULT 0 NOT NULL,
	`card_index` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `cert_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cert_id`) REFERENCES `certs`(`id`) ON UPDATE no action ON DELETE cascade
);

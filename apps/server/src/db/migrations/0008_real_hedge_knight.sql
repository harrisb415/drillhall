CREATE TABLE `course_flags` (
	`user_id` text NOT NULL,
	`cert_id` integer NOT NULL,
	`lesson_id` text NOT NULL,
	`flagged_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `cert_id`, `lesson_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cert_id`) REFERENCES `certs`(`id`) ON UPDATE no action ON DELETE cascade
);

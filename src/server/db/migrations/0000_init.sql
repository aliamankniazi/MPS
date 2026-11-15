CREATE TABLE `accounts` (
	`id` varchar(64) NOT NULL,
	`email` varchar(320) NOT NULL,
	`password_hash` varchar(255),
	`email_verified` boolean NOT NULL DEFAULT false,
	`failed_sign_ins` int NOT NULL DEFAULT 0,
	`locked_until` datetime(3),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `accounts_email` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `applied_ops` (
	`op_id` varchar(64) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `applied_ops_op_id` PRIMARY KEY(`op_id`)
);
--> statement-breakpoint
CREATE TABLE `counters` (
	`name` varchar(64) NOT NULL,
	`value` bigint unsigned NOT NULL,
	CONSTRAINT `counters_name` PRIMARY KEY(`name`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`path` varchar(512) NOT NULL,
	`collection` varchar(384) NOT NULL,
	`doc_id` varchar(255) NOT NULL,
	`data_raw` longtext NOT NULL,
	`version` bigint unsigned NOT NULL,
	`deleted` boolean NOT NULL DEFAULT false,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `documents_path` PRIMARY KEY(`path`)
);
--> statement-breakpoint
CREATE TABLE `email_tokens` (
	`token_hash` varchar(64) NOT NULL,
	`account_id` varchar(64) NOT NULL,
	`purpose` varchar(16) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`used_at` datetime(3),
	CONSTRAINT `email_tokens_token_hash` PRIMARY KEY(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` varchar(64) NOT NULL,
	`account_id` varchar(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `sessions_token_hash` PRIMARY KEY(`token_hash`)
);
--> statement-breakpoint
CREATE INDEX `documents_pull` ON `documents` (`version`);--> statement-breakpoint
CREATE INDEX `documents_collection` ON `documents` (`collection`);--> statement-breakpoint
CREATE INDEX `sessions_account` ON `sessions` (`account_id`);
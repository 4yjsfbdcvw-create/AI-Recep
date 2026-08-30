CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`customerId` int NOT NULL,
	`serviceId` int NOT NULL,
	`reference` varchar(24) NOT NULL,
	`startAt` bigint NOT NULL,
	`endAt` bigint NOT NULL,
	`appointmentStatus` enum('confirmed','cancelled','completed','no_show') NOT NULL DEFAULT 'confirmed',
	`notes` text,
	`appointmentSource` enum('ai_receptionist','staff','import') NOT NULL DEFAULT 'ai_receptionist',
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`),
	CONSTRAINT `appointments_reference_unique` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE TABLE `business_hours` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`dayOfWeek` int NOT NULL,
	`isOpen` boolean NOT NULL DEFAULT true,
	`openTime` varchar(5),
	`closeTime` varchar(5),
	CONSTRAINT `business_hours_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_hours_day_unique` UNIQUE(`tenantId`,`dayOfWeek`)
);
--> statement-breakpoint
CREATE TABLE `call_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`callId` int NOT NULL,
	`messageSpeaker` enum('customer','agent','system') NOT NULL,
	`body` text NOT NULL,
	`metadata` json,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `call_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `calls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`externalId` varchar(40) NOT NULL,
	`callChannel` enum('browser','telephone') NOT NULL DEFAULT 'browser',
	`callStatus` enum('active','completed','transferred','abandoned') NOT NULL DEFAULT 'active',
	`state` varchar(64) NOT NULL DEFAULT 'GREETING',
	`intent` varchar(64),
	`confidence` int,
	`callerName` varchar(160),
	`callerPhone` varchar(40),
	`summary` text,
	`context` json,
	`appointmentId` int,
	`escalated` boolean NOT NULL DEFAULT false,
	`escalationReason` text,
	`startedAt` bigint NOT NULL,
	`endedAt` bigint,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `calls_id` PRIMARY KEY(`id`),
	CONSTRAINT `calls_external_id_unique` UNIQUE(`externalId`)
);
--> statement-breakpoint
CREATE TABLE `confirmations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`appointmentId` int NOT NULL,
	`confirmationChannel` enum('in_app','email','sms') NOT NULL DEFAULT 'in_app',
	`recipient` varchar(320),
	`confirmationStatus` enum('queued','sent','failed') NOT NULL DEFAULT 'queued',
	`body` text NOT NULL,
	`providerMessageId` varchar(160),
	`createdAt` bigint NOT NULL,
	`sentAt` bigint,
	CONSTRAINT `confirmations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`phone` varchar(40),
	`email` varchar(320),
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `integration_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`integrationType` enum('calendar','telephony','stt','tts','email','sms','crm') NOT NULL,
	`provider` varchar(80) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`config` json,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `integration_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `integration_tenant_type_unique` UNIQUE(`tenantId`,`integrationType`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`knowledgeCategory` enum('hours','services','pricing','location','parking','policy','faq') NOT NULL,
	`title` varchar(180) NOT NULL,
	`content` text NOT NULL,
	`keywords` text,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `knowledge_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`durationMinutes` int NOT NULL,
	`priceMinor` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'GBP',
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `services_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenant_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`userId` int NOT NULL,
	`tenantRole` enum('owner','manager','receptionist') NOT NULL DEFAULT 'receptionist',
	`createdAt` bigint NOT NULL,
	CONSTRAINT `tenant_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_member_unique` UNIQUE(`tenantId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int,
	`name` varchar(160) NOT NULL,
	`slug` varchar(80) NOT NULL,
	`timezone` varchar(80) NOT NULL,
	`phone` varchar(40),
	`email` varchar(320),
	`address` text,
	`parkingInstructions` text,
	`greeting` text NOT NULL,
	`bookingWindowDays` int NOT NULL DEFAULT 60,
	`cancellationHours` int NOT NULL DEFAULT 24,
	`slotIntervalMinutes` int NOT NULL DEFAULT 15,
	`voiceProvider` varchar(80) NOT NULL DEFAULT 'browser',
	`llmProvider` varchar(80) NOT NULL DEFAULT 'built-in',
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenants_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `tool_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`callId` int NOT NULL,
	`toolName` varchar(80) NOT NULL,
	`toolStatus` enum('success','failure','blocked') NOT NULL,
	`input` json,
	`output` json,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `tool_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_serviceId_services_id_fk` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_hours` ADD CONSTRAINT `business_hours_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `call_messages` ADD CONSTRAINT `call_messages_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `call_messages` ADD CONSTRAINT `call_messages_callId_calls_id_fk` FOREIGN KEY (`callId`) REFERENCES `calls`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calls` ADD CONSTRAINT `calls_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calls` ADD CONSTRAINT `calls_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `confirmations` ADD CONSTRAINT `confirmations_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `confirmations` ADD CONSTRAINT `confirmations_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customers` ADD CONSTRAINT `customers_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `integration_configs` ADD CONSTRAINT `integration_configs_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledge_items` ADD CONSTRAINT `knowledge_items_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `services` ADD CONSTRAINT `services_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_members` ADD CONSTRAINT `tenant_members_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenant_members` ADD CONSTRAINT `tenant_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenants` ADD CONSTRAINT `tenants_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tool_events` ADD CONSTRAINT `tool_events_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tool_events` ADD CONSTRAINT `tool_events_callId_calls_id_fk` FOREIGN KEY (`callId`) REFERENCES `calls`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `appointments_tenant_start_idx` ON `appointments` (`tenantId`,`startAt`);--> statement-breakpoint
CREATE INDEX `call_messages_call_idx` ON `call_messages` (`callId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `calls_tenant_started_idx` ON `calls` (`tenantId`,`startedAt`);--> statement-breakpoint
CREATE INDEX `confirmations_appointment_idx` ON `confirmations` (`appointmentId`);--> statement-breakpoint
CREATE INDEX `customers_tenant_phone_idx` ON `customers` (`tenantId`,`phone`);--> statement-breakpoint
CREATE INDEX `knowledge_tenant_category_idx` ON `knowledge_items` (`tenantId`,`knowledgeCategory`);--> statement-breakpoint
CREATE INDEX `services_tenant_idx` ON `services` (`tenantId`);--> statement-breakpoint
CREATE INDEX `tool_events_call_idx` ON `tool_events` (`callId`,`createdAt`);
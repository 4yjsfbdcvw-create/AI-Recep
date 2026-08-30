CREATE TABLE `availability_slots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`serviceId` int NOT NULL,
	`startAt` bigint NOT NULL,
	`endAt` bigint NOT NULL,
	`capacity` int NOT NULL DEFAULT 1,
	`enabled` boolean NOT NULL DEFAULT true,
	`availabilitySource` enum('internal_schedule','calendar_adapter') NOT NULL DEFAULT 'internal_schedule',
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `availability_slots_id` PRIMARY KEY(`id`),
	CONSTRAINT `availability_tenant_service_start_unique` UNIQUE(`tenantId`,`serviceId`,`startAt`)
);
--> statement-breakpoint
ALTER TABLE `availability_slots` ADD CONSTRAINT `availability_slots_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `availability_slots` ADD CONSTRAINT `availability_slots_serviceId_services_id_fk` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `availability_tenant_time_idx` ON `availability_slots` (`tenantId`,`startAt`);
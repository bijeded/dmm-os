DROP INDEX `ingresos_cfdi_unique`;--> statement-breakpoint
ALTER TABLE `ingresos` ADD `cfdi_parcialidad` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `ingresos_cfdi_unique` ON `ingresos` (`cfdi_uuid`,`cfdi_parcialidad`);
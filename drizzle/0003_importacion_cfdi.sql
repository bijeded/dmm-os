CREATE TABLE `sugerencias_importacion` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entidad` text NOT NULL,
	`entidad_id` integer NOT NULL,
	`proyecto_id` integer NOT NULL,
	`motivo` text NOT NULL,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`creado_en` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`proyecto_id`) REFERENCES `proyectos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sugerencias_entidad_unique` ON `sugerencias_importacion` (`entidad`,`entidad_id`);--> statement-breakpoint
ALTER TABLE `contactos` ADD `rfc` text;--> statement-breakpoint
CREATE UNIQUE INDEX `contactos_rfc_unique` ON `contactos` (`rfc`);
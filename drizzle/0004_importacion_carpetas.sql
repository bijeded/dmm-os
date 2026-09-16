DROP INDEX `cotizaciones_folio_unique`;--> statement-breakpoint
ALTER TABLE `cotizaciones` ADD `folio_sufijo` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `cotizaciones_folio_unique` ON `cotizaciones` (`folio`,`folio_sufijo`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sugerencias_importacion` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entidad` text NOT NULL,
	`entidad_id` integer NOT NULL,
	`accion` text DEFAULT 'vincular' NOT NULL,
	`proyecto_id` integer,
	`contacto_id` integer,
	`motivo` text NOT NULL,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`creado_en` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`proyecto_id`) REFERENCES `proyectos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contacto_id`) REFERENCES `contactos`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sugerencias_destino" CHECK(("__new_sugerencias_importacion"."accion" = 'fusionar') = ("__new_sugerencias_importacion"."contacto_id" IS NOT NULL)
          AND ("__new_sugerencias_importacion"."accion" = 'vincular') = ("__new_sugerencias_importacion"."proyecto_id" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_sugerencias_importacion`("id", "entidad", "entidad_id", "accion", "proyecto_id", "contacto_id", "motivo", "estado", "creado_en") SELECT "id", "entidad", "entidad_id", 'vincular', "proyecto_id", NULL, "motivo", "estado", "creado_en" FROM `sugerencias_importacion`;--> statement-breakpoint
DROP TABLE `sugerencias_importacion`;--> statement-breakpoint
ALTER TABLE `__new_sugerencias_importacion` RENAME TO `sugerencias_importacion`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `sugerencias_entidad_unique` ON `sugerencias_importacion` (`entidad`,`entidad_id`,`accion`);
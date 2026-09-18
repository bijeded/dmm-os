PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ingresos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`categoria` text NOT NULL,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`estado_facturacion` text,
	`subtotal` integer NOT NULL,
	`iva` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`monto_original` integer,
	`moneda_original` text,
	`proyecto_id` integer,
	`cotizacion_id` integer,
	`contacto_id` integer,
	`fecha_registro` text,
	`fecha_pago` text,
	`periodo` text,
	`definicion_id` integer,
	`cfdi_uuid` text,
	`reembolso_de_id` integer,
	`notas` text,
	`creado_en` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`proyecto_id`) REFERENCES `proyectos`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cotizacion_id`) REFERENCES `cotizaciones`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contacto_id`) REFERENCES `contactos`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`definicion_id`) REFERENCES `definiciones_ingreso`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reembolso_de_id`) REFERENCES `ingresos`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ingresos_estado_facturacion" CHECK(("__new_ingresos"."categoria" = 'factura') = ("__new_ingresos"."estado_facturacion" IS NOT NULL)),
	CONSTRAINT "ingresos_total" CHECK("__new_ingresos"."total" = "__new_ingresos"."subtotal" + "__new_ingresos"."iva"),
	CONSTRAINT "ingresos_reembolso_negativo" CHECK(("__new_ingresos"."reembolso_de_id" IS NOT NULL) = ("__new_ingresos"."total" < 0))
);
--> statement-breakpoint
INSERT INTO `__new_ingresos`("id", "categoria", "estado", "estado_facturacion", "subtotal", "iva", "total", "monto_original", "moneda_original", "proyecto_id", "cotizacion_id", "contacto_id", "fecha_registro", "fecha_pago", "periodo", "definicion_id", "cfdi_uuid", "reembolso_de_id", "notas", "creado_en") SELECT "id", "categoria", "estado", "estado_facturacion", "subtotal", "iva", "total", "monto_original", "moneda_original", "proyecto_id", "cotizacion_id", "contacto_id", "fecha_registro", "fecha_pago", "periodo", "definicion_id", "cfdi_uuid", "reembolso_de_id", "notas", "creado_en" FROM `ingresos`;--> statement-breakpoint
DROP TABLE `ingresos`;--> statement-breakpoint
ALTER TABLE `__new_ingresos` RENAME TO `ingresos`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `ingresos_cfdi_unique` ON `ingresos` (`cfdi_uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `ingresos_definicion_periodo_unique` ON `ingresos` (`definicion_id`,`periodo`);--> statement-breakpoint
CREATE INDEX `ingresos_proyecto_idx` ON `ingresos` (`proyecto_id`);--> statement-breakpoint
CREATE INDEX `ingresos_contacto_idx` ON `ingresos` (`contacto_id`);--> statement-breakpoint
ALTER TABLE `cotizaciones` ADD `parcialidades` integer;--> statement-breakpoint
ALTER TABLE `cotizaciones` ADD `costos_estimados` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `definiciones_costo` ADD `cotizacion_id` integer REFERENCES cotizaciones(id);
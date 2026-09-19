PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_costos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`categoria` text NOT NULL,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`estimado` integer DEFAULT false NOT NULL,
	`subtotal` integer NOT NULL,
	`iva` integer DEFAULT 0 NOT NULL,
	`retenciones` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`monto_original` integer,
	`moneda_original` text,
	`proveedor` text,
	`referencia` text,
	`fecha` text NOT NULL,
	`fecha_pago` text,
	`periodo` text,
	`definicion_id` integer,
	`proyecto_id` integer,
	`cotizacion_id` integer,
	`cfdi_uuid` text,
	`notas` text,
	`creado_en` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`definicion_id`) REFERENCES `definiciones_costo`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`proyecto_id`) REFERENCES `proyectos`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cotizacion_id`) REFERENCES `cotizaciones`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "costos_total" CHECK("__new_costos"."total" = "__new_costos"."subtotal" + "__new_costos"."iva" - "__new_costos"."retenciones")
);
--> statement-breakpoint
INSERT INTO `__new_costos`("id", "nombre", "categoria", "estado", "estimado", "subtotal", "iva", "retenciones", "total", "monto_original", "moneda_original", "proveedor", "referencia", "fecha", "fecha_pago", "periodo", "definicion_id", "proyecto_id", "cotizacion_id", "cfdi_uuid", "notas", "creado_en") SELECT "id", "nombre", "categoria", "estado", "estimado", "subtotal", "iva", 0, "total", "monto_original", "moneda_original", "proveedor", "referencia", "fecha", "fecha_pago", "periodo", "definicion_id", "proyecto_id", "cotizacion_id", "cfdi_uuid", "notas", "creado_en" FROM `costos`;--> statement-breakpoint
DROP TABLE `costos`;--> statement-breakpoint
ALTER TABLE `__new_costos` RENAME TO `costos`;--> statement-breakpoint
CREATE UNIQUE INDEX `costos_cfdi_unique` ON `costos` (`cfdi_uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `costos_definicion_periodo_unique` ON `costos` (`definicion_id`,`periodo`);--> statement-breakpoint
CREATE INDEX `costos_proyecto_idx` ON `costos` (`proyecto_id`);--> statement-breakpoint
CREATE TABLE `__new_definiciones_ingreso` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cotizacion_id` integer,
	`proyecto_id` integer,
	`contacto_id` integer,
	`tipo` text NOT NULL,
	`categoria` text NOT NULL,
	`subtotal` integer NOT NULL,
	`iva` integer DEFAULT 0 NOT NULL,
	`retenciones` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`monto_original` integer,
	`moneda_original` text,
	`dia_del_mes` integer DEFAULT 1 NOT NULL,
	`periodo_inicio` text NOT NULL,
	`periodo_fin` text,
	`numero_parcialidades` integer,
	`creado_en` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`cotizacion_id`) REFERENCES `cotizaciones`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`proyecto_id`) REFERENCES `proyectos`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contacto_id`) REFERENCES `contactos`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "definiciones_ingreso_total" CHECK("__new_definiciones_ingreso"."total" = "__new_definiciones_ingreso"."subtotal" + "__new_definiciones_ingreso"."iva" - "__new_definiciones_ingreso"."retenciones"),
	CONSTRAINT "definiciones_ingreso_parcialidades" CHECK(("__new_definiciones_ingreso"."tipo" = 'parcialidades') = ("__new_definiciones_ingreso"."numero_parcialidades" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_definiciones_ingreso`("id", "cotizacion_id", "proyecto_id", "contacto_id", "tipo", "categoria", "subtotal", "iva", "retenciones", "total", "monto_original", "moneda_original", "dia_del_mes", "periodo_inicio", "periodo_fin", "numero_parcialidades", "creado_en") SELECT "id", "cotizacion_id", "proyecto_id", "contacto_id", "tipo", "categoria", "subtotal", "iva", 0, "total", "monto_original", "moneda_original", "dia_del_mes", "periodo_inicio", "periodo_fin", "numero_parcialidades", "creado_en" FROM `definiciones_ingreso`;--> statement-breakpoint
DROP TABLE `definiciones_ingreso`;--> statement-breakpoint
ALTER TABLE `__new_definiciones_ingreso` RENAME TO `definiciones_ingreso`;--> statement-breakpoint
CREATE TABLE `__new_ingresos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`categoria` text NOT NULL,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`estado_facturacion` text,
	`subtotal` integer NOT NULL,
	`iva` integer DEFAULT 0 NOT NULL,
	`retenciones` integer DEFAULT 0 NOT NULL,
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
	CONSTRAINT "ingresos_total" CHECK("__new_ingresos"."total" = "__new_ingresos"."subtotal" + "__new_ingresos"."iva" - "__new_ingresos"."retenciones"),
	CONSTRAINT "ingresos_reembolso_negativo" CHECK(("__new_ingresos"."reembolso_de_id" IS NOT NULL) = ("__new_ingresos"."total" < 0))
);
--> statement-breakpoint
INSERT INTO `__new_ingresos`("id", "categoria", "estado", "estado_facturacion", "subtotal", "iva", "retenciones", "total", "monto_original", "moneda_original", "proyecto_id", "cotizacion_id", "contacto_id", "fecha_registro", "fecha_pago", "periodo", "definicion_id", "cfdi_uuid", "reembolso_de_id", "notas", "creado_en") SELECT "id", "categoria", "estado", "estado_facturacion", "subtotal", "iva", 0, "total", "monto_original", "moneda_original", "proyecto_id", "cotizacion_id", "contacto_id", "fecha_registro", "fecha_pago", "periodo", "definicion_id", "cfdi_uuid", "reembolso_de_id", "notas", "creado_en" FROM `ingresos`;--> statement-breakpoint
DROP TABLE `ingresos`;--> statement-breakpoint
ALTER TABLE `__new_ingresos` RENAME TO `ingresos`;--> statement-breakpoint
CREATE UNIQUE INDEX `ingresos_cfdi_unique` ON `ingresos` (`cfdi_uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `ingresos_definicion_periodo_unique` ON `ingresos` (`definicion_id`,`periodo`);--> statement-breakpoint
CREATE INDEX `ingresos_proyecto_idx` ON `ingresos` (`proyecto_id`);--> statement-breakpoint
CREATE INDEX `ingresos_contacto_idx` ON `ingresos` (`contacto_id`);--> statement-breakpoint
CREATE TABLE `__new_vigencias_precio` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`definicion_costo_id` integer NOT NULL,
	`desde` text NOT NULL,
	`subtotal` integer NOT NULL,
	`iva` integer DEFAULT 0 NOT NULL,
	`retenciones` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`monto_original` integer,
	`moneda_original` text,
	FOREIGN KEY (`definicion_costo_id`) REFERENCES `definiciones_costo`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "vigencias_total" CHECK("__new_vigencias_precio"."total" = "__new_vigencias_precio"."subtotal" + "__new_vigencias_precio"."iva" - "__new_vigencias_precio"."retenciones")
);
--> statement-breakpoint
INSERT INTO `__new_vigencias_precio`("id", "definicion_costo_id", "desde", "subtotal", "iva", "retenciones", "total", "monto_original", "moneda_original") SELECT "id", "definicion_costo_id", "desde", "subtotal", "iva", 0, "total", "monto_original", "moneda_original" FROM `vigencias_precio`;--> statement-breakpoint
DROP TABLE `vigencias_precio`;--> statement-breakpoint
ALTER TABLE `__new_vigencias_precio` RENAME TO `vigencias_precio`;--> statement-breakpoint
CREATE UNIQUE INDEX `vigencias_definicion_desde_unique` ON `vigencias_precio` (`definicion_costo_id`,`desde`);--> statement-breakpoint
PRAGMA foreign_keys=ON;

CREATE TABLE `asignaciones_costo` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`costo_id` integer NOT NULL,
	`proyecto_id` integer NOT NULL,
	`tokens` integer,
	`monto` integer NOT NULL,
	FOREIGN KEY (`costo_id`) REFERENCES `costos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`proyecto_id`) REFERENCES `proyectos`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asignaciones_costo_proyecto_unique` ON `asignaciones_costo` (`costo_id`,`proyecto_id`);--> statement-breakpoint
CREATE TABLE `contactos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`empresa` text,
	`email` text,
	`telefono` text,
	`direccion` text,
	`notas` text,
	`creado_en` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `costos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`categoria` text NOT NULL,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`estimado` integer DEFAULT false NOT NULL,
	`subtotal` integer NOT NULL,
	`iva` integer DEFAULT 0 NOT NULL,
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
	FOREIGN KEY (`cotizacion_id`) REFERENCES `cotizaciones`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `costos_cfdi_unique` ON `costos` (`cfdi_uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `costos_definicion_periodo_unique` ON `costos` (`definicion_id`,`periodo`);--> statement-breakpoint
CREATE INDEX `costos_proyecto_idx` ON `costos` (`proyecto_id`);--> statement-breakpoint
CREATE TABLE `cotizaciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`folio` integer,
	`contacto_id` integer NOT NULL,
	`categoria` text NOT NULL,
	`estado` text DEFAULT 'borrador' NOT NULL,
	`fecha` text NOT NULL,
	`validez_dias` integer DEFAULT 30 NOT NULL,
	`moneda` text DEFAULT 'MXN' NOT NULL,
	`items` text DEFAULT '[]' NOT NULL,
	`stack` text,
	`subtotal` integer DEFAULT 0 NOT NULL,
	`iva` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`facturacion` text DEFAULT 'unica' NOT NULL,
	`terminos` text,
	`notas` text,
	`pdf_ruta` text,
	`creado_en` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`contacto_id`) REFERENCES `contactos`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "cotizaciones_folio_borrador" CHECK(("cotizaciones"."estado" = 'borrador') = ("cotizaciones"."folio" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cotizaciones_folio_unique` ON `cotizaciones` (`folio`);--> statement-breakpoint
CREATE INDEX `cotizaciones_contacto_idx` ON `cotizaciones` (`contacto_id`);--> statement-breakpoint
CREATE TABLE `definiciones_costo` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`proveedor` text,
	`tipo` text NOT NULL,
	`proyecto_id` integer,
	`suscripcion_ia` integer DEFAULT false NOT NULL,
	`dia_del_mes` integer DEFAULT 1 NOT NULL,
	`periodo_inicio` text NOT NULL,
	`periodo_fin` text,
	`numero_parcialidades` integer,
	`creado_en` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`proyecto_id`) REFERENCES `proyectos`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "definiciones_costo_msi" CHECK(("definiciones_costo"."tipo" = 'msi') = ("definiciones_costo"."numero_parcialidades" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `definiciones_ingreso` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cotizacion_id` integer,
	`proyecto_id` integer,
	`contacto_id` integer,
	`tipo` text NOT NULL,
	`categoria` text NOT NULL,
	`subtotal` integer NOT NULL,
	`iva` integer DEFAULT 0 NOT NULL,
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
	CONSTRAINT "definiciones_ingreso_parcialidades" CHECK(("definiciones_ingreso"."tipo" = 'parcialidades') = ("definiciones_ingreso"."numero_parcialidades" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `ingresos` (
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
	`fecha_registro` text NOT NULL,
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
	CONSTRAINT "ingresos_estado_facturacion" CHECK(("ingresos"."categoria" = 'factura') = ("ingresos"."estado_facturacion" IS NOT NULL)),
	CONSTRAINT "ingresos_reembolso_negativo" CHECK("ingresos"."reembolso_de_id" IS NULL OR "ingresos"."total" < 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingresos_cfdi_unique` ON `ingresos` (`cfdi_uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `ingresos_definicion_periodo_unique` ON `ingresos` (`definicion_id`,`periodo`);--> statement-breakpoint
CREATE INDEX `ingresos_proyecto_idx` ON `ingresos` (`proyecto_id`);--> statement-breakpoint
CREATE INDEX `ingresos_contacto_idx` ON `ingresos` (`contacto_id`);--> statement-breakpoint
CREATE TABLE `proyectos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`contacto_id` integer,
	`cotizacion_id` integer,
	`cliente_final` text,
	`categoria` text NOT NULL,
	`etiqueta` text DEFAULT 'cliente' NOT NULL,
	`estado` text DEFAULT 'en_curso' NOT NULL,
	`fecha_inicio` text,
	`fecha_entrega` text,
	`fecha_fin` text,
	`notas` text,
	`creado_en` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`contacto_id`) REFERENCES `contactos`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cotizacion_id`) REFERENCES `cotizaciones`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "proyectos_personal_sin_contacto" CHECK("proyectos"."etiqueta" = 'cliente' OR ("proyectos"."contacto_id" IS NULL AND "proyectos"."cotizacion_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proyectos_cotizacion_unique` ON `proyectos` (`cotizacion_id`);--> statement-breakpoint
CREATE INDEX `proyectos_contacto_idx` ON `proyectos` (`contacto_id`);--> statement-breakpoint
CREATE TABLE `ubicaciones_archivo` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proyecto_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`ruta_relativa` text NOT NULL,
	`disponible` integer DEFAULT true NOT NULL,
	`verificado_en` text,
	FOREIGN KEY (`proyecto_id`) REFERENCES `proyectos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ubicaciones_proyecto_tipo_unique` ON `ubicaciones_archivo` (`proyecto_id`,`tipo`);--> statement-breakpoint
CREATE TABLE `vigencias_precio` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`definicion_costo_id` integer NOT NULL,
	`desde` text NOT NULL,
	`subtotal` integer NOT NULL,
	`iva` integer DEFAULT 0 NOT NULL,
	`total` integer NOT NULL,
	`monto_original` integer,
	`moneda_original` text,
	FOREIGN KEY (`definicion_costo_id`) REFERENCES `definiciones_costo`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vigencias_definicion_desde_unique` ON `vigencias_precio` (`definicion_costo_id`,`desde`);
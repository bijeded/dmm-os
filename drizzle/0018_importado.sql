ALTER TABLE `contactos` ADD `importado` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `cotizaciones` ADD `importado` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `proyectos` ADD `importado` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `contactos` SET `importado` = 1 WHERE coalesce(`empresa`, '') = '' AND coalesce(`email`, '') = '' AND coalesce(`telefono`, '') = '' AND coalesce(`direccion`, '') = '' AND coalesce(`notas`, '') = '';--> statement-breakpoint
UPDATE `cotizaciones` SET `importado` = 1 WHERE `estado` <> 'borrador' AND coalesce(`items`, '[]') = '[]';--> statement-breakpoint
UPDATE `proyectos` SET `importado` = 1 WHERE `etiqueta` <> 'personal' AND `fecha_inicio` IS NULL AND `fecha_entrega` IS NULL;

ALTER TABLE `cotizaciones` ADD `tipo_cambio` real;--> statement-breakpoint
-- An accepted USD quote takes the rate its Proyecto's USD Ingresos were recorded at (pesos per USD).
UPDATE `cotizaciones` SET `tipo_cambio` = (
  SELECT CAST(SUM(i.`total`) AS REAL) / SUM(i.`monto_original`)
  FROM `ingresos` i JOIN `proyectos` p ON i.`proyecto_id` = p.`id`
  WHERE p.`cotizacion_id` = `cotizaciones`.`id` AND i.`moneda_original` = 'USD' AND i.`monto_original` > 0 AND i.`reembolso_de_id` IS NULL
) WHERE `moneda` = 'USD' AND `estado` = 'aceptada';

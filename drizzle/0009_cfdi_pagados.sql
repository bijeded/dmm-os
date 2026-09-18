-- A CFDI that isn't cancelled has been paid: imported Ingresos and Costos still pending become paid on their date.
UPDATE `ingresos` SET `estado` = 'pagado', `fecha_pago` = `fecha_registro` WHERE `cfdi_uuid` IS NOT NULL AND `estado` = 'pendiente';--> statement-breakpoint
UPDATE `costos` SET `estado` = 'pagado', `fecha_pago` = `fecha` WHERE `cfdi_uuid` IS NOT NULL AND `estado` = 'pendiente';

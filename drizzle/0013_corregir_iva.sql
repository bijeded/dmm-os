-- Earlier imports stored IVA net of retenciones, which went negative when more was withheld than
-- charged. Without the XML the split is unknown, so IVA becomes 0 and the rest is retenciones;
-- the total stays. The importer re-reads the exact split from any XML still reachable.
UPDATE `ingresos` SET `retenciones` = `retenciones` - `iva`, `iva` = 0 WHERE `iva` < 0 AND `cfdi_uuid` IS NOT NULL;--> statement-breakpoint
UPDATE `costos` SET `retenciones` = `retenciones` - `iva`, `iva` = 0 WHERE `iva` < 0 AND `cfdi_uuid` IS NOT NULL;

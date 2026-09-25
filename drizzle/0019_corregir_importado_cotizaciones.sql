-- The app stored an omitted `items` as the JSON string "[]" rather than the empty list [], so 0018
-- marked no imported Cotización. A Cotización sent from the app always has an item; a borrador
-- stays hand-made. Then every "[]" becomes [].
UPDATE `cotizaciones` SET `importado` = 1 WHERE `estado` <> 'borrador' AND `items` IN ('[]', '"[]"');--> statement-breakpoint
UPDATE `cotizaciones` SET `items` = '[]' WHERE `items` = '"[]"';

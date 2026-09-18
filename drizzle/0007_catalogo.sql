CREATE TABLE `catalogo` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`concepto` text NOT NULL,
	`categoria` text NOT NULL,
	`precio` integer NOT NULL,
	`creado_en` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);

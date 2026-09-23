CREATE TABLE `ahorro_tokens` (
	`dia` text PRIMARY KEY NOT NULL,
	`tokens` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `uso_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dia` text NOT NULL,
	`carpeta` text NOT NULL,
	`proveedor` text NOT NULL,
	`modelo` text NOT NULL,
	`tokens_entrada` integer NOT NULL,
	`tokens_salida` integer NOT NULL,
	`tokens_cache_escritura` integer NOT NULL,
	`tokens_cache_lectura` integer NOT NULL,
	`costo_usd` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uso_tokens_unique` ON `uso_tokens` (`dia`,`carpeta`,`proveedor`,`modelo`);
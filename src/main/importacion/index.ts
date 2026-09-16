/**
 * Importación: bringing the files already on disk into the app. Two runs, the folder scan and
 * the Facturas run; both are safe to repeat. Behind this interface every file imports in one
 * transaction, each Sugerencia de importación is proposed once, and the log counts what the
 * run itself added.
 */
export { escanearCarpetas } from './escaneo'
export { importarFacturas } from './facturas'
export { marcarHddNoDisponible } from './carpetas'

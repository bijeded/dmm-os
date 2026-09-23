import type { Db } from './db'
import { expirarCotizaciones } from './cotizar'
import { generarPeriodos } from './db/periodos'

// The ledger Al día: brought up to hoy before money is read. Sent Cotizaciones past their validity
// become expiradas, then every Periodo generado due this month exists. Idempotent; reading twice
// changes nothing. dbAlDia is the only way in: every handler over Ingresos, Costos, Cotizaciones or
// Proyectos gets its db from it, so none can see a stale state (the handler tests pin this for every
// entry). The importer alone writes through the connection, since imported history is exempt
// (ADR-0002); the next call through here brings what it wrote Al día. A command that writes a
// definition does so in transaccionConPeriodos, so its Periodos exist before it returns.

/** A transaction, which reads and writes exactly like the database itself. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** Brings the ledger Al día: expires Cotizaciones, then generates Periodos up to `hoy`'s month. */
function alDia(db: Db, hoy: string): void {
  expirarCotizaciones(db, hoy)
  generarPeriodos(db, hoy.slice(0, 7))
}

/** The db to work with for `hoy`, brought Al día first. */
export function dbAlDia(db: Db, hoy: string): Db {
  alDia(db, hoy)
  return db
}

/**
 * Writes `trabajo` in one transaction that generates Periodos up to `hoy`'s month before it
 * commits, so a definition it wrote leaves the ledger Al día.
 */
export function transaccionConPeriodos<T>(db: Db, hoy: string, trabajo: (tx: Tx) => T): T {
  return db.transaction((tx) => {
    const resultado = trabajo(tx)
    generarPeriodos(tx, hoy.slice(0, 7))
    return resultado
  })
}

import type { Db } from './db'
import { expirarCotizaciones } from './cotizar'
import { generarPeriodos } from './db/periodos'

// The ledger as of hoy (Al día): every read and command over Ingresos, Costos, Cotizaciones or
// Proyectos goes through here, so what they see has expired Cotizaciones marked and Periodos
// generated up to this month, and a definition they write has its Periodos before they return.

/** A transaction, which reads and writes exactly like the database itself. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** Brings the ledger Al día: expires Cotizaciones, then generates Periodos up to `hoy`'s month. Idempotent. */
export function alDia(db: Db, hoy: string): void {
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

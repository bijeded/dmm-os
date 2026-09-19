import type { Db } from './db'
import { expirarCotizaciones } from './cotizar'
import { generarPeriodos } from './db/periodos'

// The ledger as of hoy: every read of Ingresos, Costos or Cotización estado goes through here, so
// what it sees has expired Cotizaciones marked and Periodos generated up to this month.

/** Brings expiry and Periodo generado up to `hoy`. Idempotent; safe to run before every read. */
export function alDia(db: Db, hoy: string): void {
  expirarCotizaciones(db, hoy)
  generarPeriodos(db, hoy.slice(0, 7))
}

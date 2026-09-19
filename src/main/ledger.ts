import type { Db } from './db'
import { expirarCotizaciones } from './cotizar'
import { generarPeriodos } from './db/periodos'

// The ledger as of hoy (Al día): Finanzas and Movimientos read Ingresos and Costos through here,
// so what they see has expired Cotizaciones marked and Periodos generated up to this month.

/** Brings the ledger Al día: expires Cotizaciones, then generates Periodos up to `hoy`'s month. Idempotent. */
export function alDia(db: Db, hoy: string): void {
  expirarCotizaciones(db, hoy)
  generarPeriodos(db, hoy.slice(0, 7))
}

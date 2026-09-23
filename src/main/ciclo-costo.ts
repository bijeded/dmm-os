import { eq } from 'drizzle-orm'
import type { Db } from './db'
import { costos, definicionesCosto } from './db/schema'
import type { AccionCosto, FilaCosto } from '../shared/dominio'

export type Costo = typeof costos.$inferSelect
type Definicion = typeof definicionesCosto.$inferSelect

// The Costo lifecycle builds its own context from the Al día ledger, for many rows (Finanzas) or
// one (the commands), so what a row offers and what its command accepts come from the same reads.

/** What the Costo lifecycle needs beyond its estado. */
interface ContextoCosto {
  /** The series it belongs to, if any. */
  definicion: Definicion | undefined
  /** `YYYY-MM` of today. */
  periodoActual: string
}

export const origenCosto = (c: Costo): FilaCosto['origen'] => (c.cfdiUuid !== null ? 'cfdi' : c.definicionId !== null ? 'recurrente' : 'manual')

/** Why the action is refused, or `null` when it is allowed. */
function rechazo(accion: AccionCosto, c: Costo, ctx: ContextoCosto): string | null {
  switch (accion) {
    case 'pagar':
      return c.estado === 'pendiente' ? null : 'Solo se marca pagado un costo pendiente'
    case 'cancelar':
      return c.estado === 'pendiente' ? null : 'Solo se cancela un costo pendiente'
    // Borrar vs cancelar: only a hand-entered one-time Costo not from a Cotización.
    case 'borrar':
      return origenCosto(c) === 'manual' && c.cotizacionId === null
        ? null
        : 'Este costo tiene registros vinculados; cancélalo en lugar de borrarlo'
    // A monthly or annual series can be stopped while it still runs; MSI is already committed.
    case 'detener': {
      const d = ctx.definicion
      return d !== undefined && d.tipo !== 'msi' && (d.periodoFin === null || d.periodoFin > ctx.periodoActual)
        ? null
        : 'Este costo no pertenece a una serie que se pueda detener'
    }
  }
}

const ACCIONES: AccionCosto[] = ['pagar', 'cancelar', 'borrar', 'detener']

/**
 * The actions each of `filas` offers on its Finanzas row in `hoy`'s month: exactly those
 * `exigirCosto` accepts. Reads every series definition once for all.
 */
export function accionesCostos(db: Db, filas: Costo[], hoy: string): Map<number, AccionCosto[]> {
  const definicion = new Map(db.select().from(definicionesCosto).all().map((d) => [d.id, d]))
  const periodoActual = hoy.slice(0, 7)
  return new Map(
    filas.map((c) => {
      const ctx = { definicion: c.definicionId === null ? undefined : definicion.get(c.definicionId), periodoActual }
      return [c.id, ACCIONES.filter((a) => rechazo(a, c, ctx) === null)]
    })
  )
}

/** Costo `id`, once its lifecycle allows `accion` on it in `hoy`'s month; throws the refusal otherwise. */
export function exigirCosto(db: Db, accion: AccionCosto, id: number, hoy: string): Costo {
  const costo = db.select().from(costos).where(eq(costos.id, id)).get()
  if (!costo) throw new Error(`El costo ${id} no existe`)
  const definicion = costo.definicionId === null ? undefined : db.select().from(definicionesCosto).where(eq(definicionesCosto.id, costo.definicionId)).get()
  const mensaje = rechazo(accion, costo, { definicion, periodoActual: hoy.slice(0, 7) })
  if (mensaje) throw new Error(mensaje)
  return costo
}

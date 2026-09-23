import type { costos, definicionesCosto } from './db/schema'
import type { AccionCosto, FilaCosto } from '../shared/dominio'

export type Costo = typeof costos.$inferSelect
export type Definicion = typeof definicionesCosto.$inferSelect

/** What the Costo lifecycle needs beyond its estado. */
export interface ContextoCosto {
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

/** The actions the Finanzas row offers: exactly those `exigirCosto` accepts. */
export const accionesCosto = (c: Costo, ctx: ContextoCosto): AccionCosto[] =>
  ACCIONES.filter((a) => rechazo(a, c, ctx) === null)

export function exigirCosto(accion: AccionCosto, c: Costo, ctx: ContextoCosto): void {
  const mensaje = rechazo(accion, c, ctx)
  if (mensaje) throw new Error(mensaje)
}

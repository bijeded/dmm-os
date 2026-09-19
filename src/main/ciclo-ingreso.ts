import type { ingresos } from './db/schema'
import { monedaDe, montoEn } from './dinero'
import type { AccionIngreso, FilaIngreso } from '../shared/dominio'

export type Ingreso = typeof ingresos.$inferSelect

/** What the Ingreso lifecycle needs beyond its estado: the Reembolsos pointing at it. */
export interface ContextoIngreso {
  reembolsos: Ingreso[]
}

export const origenIngreso = (i: Ingreso): FilaIngreso['origen'] =>
  i.cfdiUuid !== null ? 'cfdi' : i.definicionId !== null ? 'periodo' : i.cotizacionId !== null ? 'cotizacion' : 'manual'

export const reembolsableIngreso = (i: Ingreso) => i.estado === 'pagado' && i.total > 0 && i.reembolsoDeId === null

/**
 * What is left to give back of an Ingreso after its Reembolsos: in pesos, its IVA, and in its own
 * currency (`original`, USD cents for a USD Ingreso, else the same as `total`).
 */
export function restante(i: Ingreso, reembolsos: Ingreso[]) {
  const moneda = monedaDe(i)
  const suma = (f: (r: Ingreso) => number) => [i, ...reembolsos].reduce((s, r) => s + f(r), 0)
  return { moneda, total: suma((r) => r.total), iva: suma((r) => r.iva), original: suma((r) => montoEn(r, moneda)) }
}

export const MENSAJE_REEMBOLSO_EXCEDIDO = 'No se puede reembolsar más de lo pagado'

/** Why the action is refused, or `null` when it is allowed. */
function rechazo(accion: AccionIngreso, i: Ingreso, ctx: ContextoIngreso): string | null {
  switch (accion) {
    case 'pagar':
      return i.estado === 'pendiente' ? null : 'Solo se marca pagado un ingreso pendiente'
    case 'cancelar':
      return i.estado === 'pendiente' ? null : 'Solo se cancela un ingreso pendiente'
    // Borrar vs cancelar: only a hand-entered Ingreso no Reembolso points at.
    case 'borrar':
      return origenIngreso(i) === 'manual' && ctx.reembolsos.length === 0
        ? null
        : 'Este ingreso tiene registros vinculados; cancélalo en lugar de borrarlo'
    case 'reembolsar':
      if (!reembolsableIngreso(i)) return 'Solo se reembolsa un ingreso pagado'
      return restante(i, ctx.reembolsos).original > 0 ? null : MENSAJE_REEMBOLSO_EXCEDIDO
  }
}

const ACCIONES: AccionIngreso[] = ['pagar', 'cancelar', 'borrar', 'reembolsar']

/** The actions the Finanzas row offers: exactly those `exigirIngreso` accepts. */
export const accionesIngreso = (i: Ingreso, ctx: ContextoIngreso): AccionIngreso[] =>
  ACCIONES.filter((a) => rechazo(a, i, ctx) === null)

export function exigirIngreso(accion: AccionIngreso, i: Ingreso, ctx: ContextoIngreso): void {
  const mensaje = rechazo(accion, i, ctx)
  if (mensaje) throw new Error(mensaje)
}

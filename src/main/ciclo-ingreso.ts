import { eq, isNotNull } from 'drizzle-orm'
import type { Db } from './db'
import { ingresos } from './db/schema'
import { MENSAJE_REEMBOLSO_EXCEDIDO, monedaDe, montoEn } from './dinero'
import type { AccionIngreso, FilaIngreso } from '../shared/dominio'

export type Ingreso = typeof ingresos.$inferSelect

// The Ingreso lifecycle builds its own context from the ledger its caller brought Al día, for many rows (Finanzas) or
// one (the commands), so what a row offers and what its command accepts are judged on the same context.

/** What the Ingreso lifecycle needs beyond its estado: the Reembolsos pointing at it. */
interface ContextoIngreso {
  reembolsos: Ingreso[]
}

export const origenIngreso = (i: Ingreso): FilaIngreso['origen'] =>
  i.cfdiUuid !== null ? 'cfdi' : i.definicionId !== null ? 'periodo' : i.cotizacionId !== null ? 'cotizacion' : 'manual'

const reembolsableIngreso = (i: Ingreso) => i.estado === 'pagado' && i.total > 0 && i.reembolsoDeId === null

/**
 * What is left to give back of an Ingreso after its Reembolsos: in pesos, its IVA and retenciones, and in its own
 * currency (`original`, USD cents for a USD Ingreso, else the same as `total`).
 */
function restante(i: Ingreso, reembolsos: Ingreso[]) {
  const moneda = monedaDe(i)
  const suma = (f: (r: Ingreso) => number) => [i, ...reembolsos].reduce((s, r) => s + f(r), 0)
  return { moneda, total: suma((r) => r.total), iva: suma((r) => r.iva), retenciones: suma((r) => r.retenciones), original: suma((r) => montoEn(r, moneda)) }
}

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

/**
 * What each of `filas` offers on its Finanzas row: exactly the actions `exigirIngreso` accepts, and
 * what is left to give back of it (0 unless it can be refunded). Reads every Reembolso once for all.
 */
export function accionesIngresos(db: Db, filas: Ingreso[]): Map<number, { acciones: AccionIngreso[]; reembolsable: number }> {
  const reembolsosDe = new Map<number, Ingreso[]>()
  for (const r of db.select().from(ingresos).where(isNotNull(ingresos.reembolsoDeId)).all())
    reembolsosDe.set(r.reembolsoDeId!, [...(reembolsosDe.get(r.reembolsoDeId!) ?? []), r])
  return new Map(
    filas.map((i) => {
      const ctx = { reembolsos: reembolsosDe.get(i.id) ?? [] }
      return [
        i.id,
        {
          acciones: ACCIONES.filter((a) => rechazo(a, i, ctx) === null),
          reembolsable: reembolsableIngreso(i) ? restante(i, ctx.reembolsos).original : 0
        }
      ]
    })
  )
}

/**
 * Ingreso `id`, once its lifecycle allows `accion` on it, and what is left to give back of it;
 * throws the refusal otherwise.
 */
export function exigirIngreso(db: Db, accion: AccionIngreso, id: number): { ingreso: Ingreso; queda: ReturnType<typeof restante> } {
  const ingreso = db.select().from(ingresos).where(eq(ingresos.id, id)).get()
  if (!ingreso) throw new Error(`El ingreso ${id} no existe`)
  const ctx = { reembolsos: db.select().from(ingresos).where(eq(ingresos.reembolsoDeId, id)).all() }
  const mensaje = rechazo(accion, ingreso, ctx)
  if (mensaje) throw new Error(mensaje)
  return { ingreso, queda: restante(ingreso, ctx.reembolsos) }
}

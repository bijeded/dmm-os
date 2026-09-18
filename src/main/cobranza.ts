import { eq, inArray } from 'drizzle-orm'
import type { Db } from './db'
import { cotizaciones, ingresos, proyectos } from './db/schema'

export interface EstadoCobro {
  /** Pending Ingresos, centavos before IVA. */
  porCobrar: number
  cobrado: number
  pagadoCompleto: boolean
  /** What stands between the Proyecto and fully paid; `null` once it is. */
  falta: { pendientes: number; faltante: number; moneda: 'MXN' | 'USD' } | null
}

/**
 * Pending and paid Ingresos of the Proyecto, before IVA, and whether it is fully paid: nothing
 * pending and, for a Proyecto from a one-off or installment Cotización, paid Ingresos (net of
 * Reembolsos) reaching the quote's total. A USD quote is compared in USD, by each Ingreso's
 * original amount. A monthly quote has no total to reach.
 */
export function estadoCobro(db: Db, proyectoId: number): EstadoCobro {
  const p = db.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()
  if (!p) throw new Error(`El proyecto ${proyectoId} no existe`)
  const suyos = db.select().from(ingresos).where(eq(ingresos.proyectoId, p.id)).all()
  const c = p.cotizacionId === null ? undefined : db.select().from(cotizaciones).where(eq(cotizaciones.id, p.cotizacionId)).get()
  return cobro(c, suyos)
}

/** `estadoCobro` for many Proyectos at once, reading their Ingresos and Cotizaciones once. */
export function estadosCobro(db: Db, ps: { id: number; cotizacionId: number | null }[]): Map<number, EstadoCobro> {
  if (ps.length === 0) return new Map()
  const porProyecto = new Map<number, Ingreso[]>()
  const ids = ps.map((p) => p.id)
  for (const i of db.select().from(ingresos).where(inArray(ingresos.proyectoId, ids)).all()) {
    porProyecto.set(i.proyectoId!, [...(porProyecto.get(i.proyectoId!) ?? []), i])
  }
  const cotIds = ps.flatMap((p) => (p.cotizacionId === null ? [] : [p.cotizacionId]))
  const cots = new Map(
    (cotIds.length ? db.select().from(cotizaciones).where(inArray(cotizaciones.id, cotIds)).all() : []).map((c) => [c.id, c])
  )
  return new Map(ps.map((p) => [p.id, cobro(p.cotizacionId === null ? undefined : cots.get(p.cotizacionId), porProyecto.get(p.id) ?? [])]))
}

type Ingreso = typeof ingresos.$inferSelect

function cobro(c: typeof cotizaciones.$inferSelect | undefined, suyos: Ingreso[]): EstadoCobro {
  const pagados = suyos.filter((i) => i.estado === 'pagado')
  const pendientes = suyos.filter((i) => i.estado === 'pendiente')
  const suma = (is: Ingreso[]) => is.reduce((s, i) => s + i.subtotal, 0)
  let faltante = 0
  const usd = c?.moneda === 'USD'
  if (c && c.facturacion !== 'mensual') {
    const pagado = pagados.reduce((s, i) => s + (usd ? (i.monedaOriginal === 'USD' ? (i.montoOriginal ?? 0) : 0) : i.total), 0)
    faltante = Math.max(0, c.total - pagado)
  }
  const pagadoCompleto = pendientes.length === 0 && faltante === 0
  return {
    porCobrar: suma(pendientes),
    cobrado: suma(pagados),
    pagadoCompleto,
    falta: pagadoCompleto ? null : { pendientes: pendientes.length, faltante, moneda: usd ? 'USD' : 'MXN' }
  }
}

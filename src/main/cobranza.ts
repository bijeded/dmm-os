import { eq } from 'drizzle-orm'
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
  const pagados = suyos.filter((i) => i.estado === 'pagado')
  const pendientes = suyos.filter((i) => i.estado === 'pendiente')
  const suma = (is: typeof suyos) => is.reduce((s, i) => s + i.subtotal, 0)
  let faltante = 0
  const c = p.cotizacionId === null ? undefined : db.select().from(cotizaciones).where(eq(cotizaciones.id, p.cotizacionId)).get()
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

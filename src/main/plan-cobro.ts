import type { cotizaciones } from './db/schema'
import { enMxn } from './dinero'
import type { CategoriaCosto } from '../shared/dominio'

export type CotizacionAPlanear = Pick<typeof cotizaciones.$inferSelect, 'moneda' | 'facturacion' | 'parcialidades' | 'subtotal' | 'iva' | 'costosEstimados'>
type Montos = ReturnType<typeof enMxn>

/** The rows an accepted Cotización produces, in MXN, before anything is written. */
export interface PlanCobro {
  /** The rate a USD quote was accepted at; `null` for one in pesos. */
  tipoCambio: number | null
  /** The month recurring definitions start in. */
  periodo: string
  /** Pending Ingresos: one, or one per parcialidad. Empty for a monthly quote. */
  ingresos: (Montos & { notas: string | null })[]
  /** The monthly Ingreso definition of a monthly quote. */
  definicionIngreso: Montos | null
  /** Estimated one-time Costos, dated today. */
  costos: (Montos & { nombre: string; fecha: string })[]
  /** Recurring and MSI cost definitions, with their price from `periodo`. */
  definicionesCosto: { nombre: string; tipo: Exclude<CategoriaCosto, 'unico'>; diaDelMes: number; numeroParcialidades: number | null; precio: Montos }[]
}

/** Splits `total` into `n` parts that add up to it, the remainder going to the first. */
const repartir = (total: number, n: number) => {
  const parte = Math.floor(total / n)
  return Array.from({ length: n }, (_, i) => (i === 0 ? total - parte * (n - 1) : parte))
}

/**
 * What accepting `c` on `hoy` records. A USD quote needs a positive `tipoCambio`; every amount is
 * converted by the dinero rule and keeps its USD amount as the original.
 */
export function planCobro(c: CotizacionAPlanear, hoy: string, tipoCambio?: number): PlanCobro {
  const usd = c.moneda === 'USD'
  if (usd && !(tipoCambio !== undefined && tipoCambio > 0)) throw new Error('Indica el tipo de cambio de la cotización en USD')
  const tasa = usd ? tipoCambio! : null
  const periodo = hoy.slice(0, 7)

  let ingresos: PlanCobro['ingresos'] = []
  if (c.facturacion !== 'mensual') {
    const n = c.facturacion === 'parcialidades' ? (c.parcialidades ?? 1) : 1
    const ivas = repartir(c.iva, n)
    ingresos = repartir(c.subtotal, n).map((subtotal, i) => ({ ...enMxn(subtotal, ivas[i], tasa), notas: n > 1 ? `Parcialidad ${i + 1} de ${n}` : null }))
  }

  const costos: PlanCobro['costos'] = []
  const definicionesCosto: PlanCobro['definicionesCosto'] = []
  for (const e of c.costosEstimados) {
    // Quotes saved before costs had a type were all one-time.
    const categoria = e.categoria ?? 'unico'
    if (categoria === 'unico') costos.push({ ...enMxn(e.monto, 0, tasa), nombre: e.concepto, fecha: hoy })
    else
      definicionesCosto.push({
        nombre: e.concepto,
        tipo: categoria,
        diaDelMes: Number(hoy.slice(8, 10)),
        numeroParcialidades: categoria === 'msi' ? e.parcialidades : null,
        precio: enMxn(e.monto, 0, tasa)
      })
  }

  return {
    tipoCambio: tasa,
    periodo,
    ingresos,
    definicionIngreso: c.facturacion === 'mensual' ? enMxn(c.subtotal, c.iva, tasa) : null,
    costos,
    definicionesCosto
  }
}

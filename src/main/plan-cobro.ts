import type { cotizaciones } from './db/schema'
import { enMxn, type MontosRegistrados } from './dinero'
import type { CategoriaCosto, Moneda } from '../shared/dominio'

export type CotizacionAPlanear = Pick<typeof cotizaciones.$inferSelect, 'moneda' | 'facturacion' | 'parcialidades' | 'subtotal' | 'iva' | 'costosEstimados'>

/**
 * The rows an accepted Cotización produces, in MXN, before anything is written. The accept
 * operation only adds the links to its Proyecto, Cotización and Contacto.
 */
export interface PlanCobro {
  /** The rate a USD quote was accepted at; `null` for one in pesos. */
  tipoCambio: number | null
  /** The month recurring definitions start in; its Periodos are generated on accepting. */
  periodo: string
  /** Pending Ingresos, por facturar: one, or one per parcialidad. Empty for a monthly quote. */
  ingresos: (MontosRegistrados & { categoria: 'factura'; estadoFacturacion: 'por_facturar'; notas: string | null })[]
  /** The monthly Ingreso definition of a monthly quote. */
  definicionIngreso: (MontosRegistrados & { tipo: 'mensual'; categoria: 'factura'; periodoInicio: string }) | null
  /** Estimated one-time Costos, dated today. */
  costos: (MontosRegistrados & { nombre: string; categoria: 'unico'; estimado: true; fecha: string })[]
  /** Recurring and MSI cost definitions, each with its price from `periodo`. */
  definicionesCosto: {
    definicion: { nombre: string; tipo: Exclude<CategoriaCosto, 'unico'>; diaDelMes: number; periodoInicio: string; numeroParcialidades: number | null }
    precio: MontosRegistrados & { desde: string }
  }[]
}

export const MENSAJE_SIN_TIPO_CAMBIO = 'Indica el tipo de cambio de la cotización en USD'

/** The rate a quote in `moneda` is accepted at: `null` for pesos; a USD quote needs a positive one. */
function tasaDe(moneda: Moneda, tipoCambio: number | undefined): number | null {
  if (moneda === 'MXN') return null
  if (tipoCambio === undefined || !(tipoCambio > 0)) throw new Error(MENSAJE_SIN_TIPO_CAMBIO)
  return tipoCambio
}

/** Splits `total` into `n` parts that add up to it, the remainder going to the first. */
const repartir = (total: number, n: number) => {
  const parte = Math.floor(total / n)
  return Array.from({ length: n }, (_, i) => (i === 0 ? total - parte * (n - 1) : parte))
}

/** What accepting `c` on `hoy` records. Every amount goes through the dinero rule (`enMxn`). */
export function planCobro(c: CotizacionAPlanear, hoy: string, tipoCambio?: number): PlanCobro {
  const tasa = tasaDe(c.moneda, tipoCambio)
  const periodo = hoy.slice(0, 7)

  let ingresos: PlanCobro['ingresos'] = []
  if (c.facturacion !== 'mensual') {
    const n = c.facturacion === 'parcialidades' ? (c.parcialidades ?? 1) : 1
    const ivas = repartir(c.iva, n)
    ingresos = repartir(c.subtotal, n).map((subtotal, i) => ({
      ...enMxn(subtotal, ivas[i], tasa),
      categoria: 'factura',
      estadoFacturacion: 'por_facturar',
      notas: n > 1 ? `Parcialidad ${i + 1} de ${n}` : null
    }))
  }

  const costos: PlanCobro['costos'] = []
  const definicionesCosto: PlanCobro['definicionesCosto'] = []
  for (const e of c.costosEstimados) {
    // Quotes saved before costs had a type were all one-time.
    const categoria = e.categoria ?? 'unico'
    if (categoria === 'unico') {
      costos.push({ ...enMxn(e.monto, 0, tasa), nombre: e.concepto, categoria, estimado: true, fecha: hoy })
      continue
    }
    definicionesCosto.push({
      definicion: {
        nombre: e.concepto,
        tipo: categoria,
        diaDelMes: Number(hoy.slice(8, 10)),
        periodoInicio: periodo,
        numeroParcialidades: categoria === 'msi' ? e.parcialidades : null
      },
      precio: { ...enMxn(e.monto, 0, tasa), desde: periodo }
    })
  }

  return {
    tipoCambio: tasa,
    periodo,
    ingresos,
    definicionIngreso: c.facturacion === 'mensual' ? { ...enMxn(c.subtotal, c.iva, tasa), tipo: 'mensual', categoria: 'factura', periodoInicio: periodo } : null,
    costos,
    definicionesCosto
  }
}

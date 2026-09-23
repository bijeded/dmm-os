import type { cotizaciones } from './db/schema'
import { montos, repartir, type MontosRegistrados } from './dinero'
import type { CategoriaCosto, Moneda } from '../shared/dominio'
import { periodoDe } from '../shared/fechas'

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
  ingresos: (MontosSinRetenciones & { categoria: 'factura'; estadoFacturacion: 'por_facturar'; notas: string | null })[]
  /** The monthly Ingreso definition of a monthly quote. */
  definicionIngreso: (MontosSinRetenciones & { tipo: 'mensual'; categoria: 'factura'; periodoInicio: string }) | null
  /** Estimated one-time Costos, dated today. */
  costos: (MontosSinRetenciones & { nombre: string; categoria: 'unico'; estimado: true; fecha: string })[]
  /** Recurring and MSI cost definitions, each with its price from `periodo`. */
  definicionesCosto: {
    definicion: { nombre: string; tipo: Exclude<CategoriaCosto, 'unico'>; diaDelMes: number; periodoInicio: string; numeroParcialidades: number | null }
    precio: MontosSinRetenciones & { desde: string }
  }[]
}

type MontosSinRetenciones = Omit<MontosRegistrados, 'retenciones'>

export const MENSAJE_SIN_TIPO_CAMBIO = 'Indica el tipo de cambio de la cotización en USD'

/** The rate a quote in `moneda` is accepted at: `null` for pesos; a USD quote needs a positive one. */
function tasaDeAceptacion(moneda: Moneda, tipoCambio: number | undefined): number | null {
  if (moneda === 'MXN') return null
  if (tipoCambio === undefined || !(tipoCambio > 0)) throw new Error(MENSAJE_SIN_TIPO_CAMBIO)
  return tipoCambio
}

/** A quote's amounts as recorded. Quotes carry no retenciones, so the row's default of zero records them. */
function registrado(subtotal: number, iva: number, tasaUsd: number | null): MontosSinRetenciones {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped: always zero on a quote
  const { retenciones, ...resto } = montos(subtotal, { iva, tasaUsd })
  return resto
}

/** What accepting `c` on `hoy` records. Every amount is built by the dinero constructor (`montos`), parcialidades by its split (`repartir`). */
export function planCobro(c: CotizacionAPlanear, hoy: string, tipoCambio?: number): PlanCobro {
  const tasa = tasaDeAceptacion(c.moneda, tipoCambio)
  const periodo = periodoDe(hoy)

  let ingresos: PlanCobro['ingresos'] = []
  if (c.facturacion !== 'mensual') {
    const n = c.facturacion === 'parcialidades' ? (c.parcialidades ?? 1) : 1
    const ivas = repartir(c.iva, n)
    ingresos = repartir(c.subtotal, n).map((subtotal, i) => ({
      ...registrado(subtotal, ivas[i], tasa),
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
      costos.push({ ...registrado(e.monto, 0, tasa), nombre: e.concepto, categoria, estimado: true, fecha: hoy })
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
      precio: { ...registrado(e.monto, 0, tasa), desde: periodo }
    })
  }

  return {
    tipoCambio: tasa,
    periodo,
    ingresos,
    definicionIngreso: c.facturacion === 'mensual' ? { ...registrado(c.subtotal, c.iva, tasa), tipo: 'mensual', categoria: 'factura', periodoInicio: periodo } : null,
    costos,
    definicionesCosto
  }
}

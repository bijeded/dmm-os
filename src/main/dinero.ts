import type { Moneda } from '../shared/dominio'
import type { ingresos } from './db/schema'

type Montos = Pick<typeof ingresos.$inferSelect, 'total' | 'montoOriginal' | 'monedaOriginal'>

/** The currency an Ingreso was paid in. */
export const monedaDe = (i: Montos): Moneda => (i.monedaOriginal === 'USD' ? 'USD' : 'MXN')

/** Pesos per USD a USD Ingreso was recorded at; `null` for one in pesos or missing its USD amount. */
export const tasaDe = (i: Montos) => (monedaDe(i) === 'USD' && i.montoOriginal ? i.total / i.montoOriginal : null)

/**
 * An Ingreso's total in `moneda`: centavos, or USD cents. A USD Ingreso is its own USD amount;
 * one paid in pesos converts at `tipoCambio`, and without one counts nothing in USD.
 */
export function montoEn(i: Montos, moneda: Moneda, tipoCambio?: number | null) {
  if (moneda === 'MXN') return i.total
  if (monedaDe(i) === 'USD') return i.montoOriginal ?? 0
  return tipoCambio ? Math.round(i.total / tipoCambio) : 0
}

/**
 * An amount as recorded: always in MXN. One in USD (`tipoCambio` given) converts subtotal and IVA
 * each at the rate and keeps its USD total as the original, which Cobros compares against.
 */
export function enMxn(subtotal: number, iva: number, tipoCambio: number | null) {
  const mxn = (n: number) => (tipoCambio === null ? n : Math.round(n * tipoCambio))
  return {
    subtotal: mxn(subtotal),
    iva: mxn(iva),
    total: mxn(subtotal) + mxn(iva),
    montoOriginal: tipoCambio === null ? null : subtotal + iva,
    monedaOriginal: tipoCambio === null ? null : ('USD' as const)
  }
}

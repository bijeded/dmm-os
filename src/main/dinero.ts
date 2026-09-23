import type { Moneda } from '../shared/dominio'
import { ivaDe } from '../shared/montos'
import type { ingresos } from './db/schema'

type Montos = Pick<typeof ingresos.$inferSelect, 'total' | 'montoOriginal' | 'monedaOriginal'>

/** The currency an Ingreso was paid in. */
export const monedaDe = (i: Montos): Moneda => (i.monedaOriginal === 'USD' ? 'USD' : 'MXN')

/** Pesos per USD a USD Ingreso was recorded at; `null` for one in pesos or missing its USD amount. */
export const tasaDe = (i: Montos) => (monedaDe(i) === 'USD' && i.montoOriginal ? i.total / i.montoOriginal : null)

/**
 * The one currency rule: `monto` in `de` expressed in `a`, at `tasa` pesos per USD, rounded to
 * the centavo (or cent). Recording a USD amount and comparing one in pesos both go through it.
 */
export function convertir(monto: number, de: Moneda, a: Moneda, tasa: number) {
  if (de === a) return monto
  return Math.round(de === 'USD' ? monto * tasa : monto / tasa)
}

/**
 * An Ingreso's total in `moneda`: centavos, or USD cents. A USD Ingreso is its own USD amount;
 * one paid in pesos converts at `tipoCambio`, and without one counts nothing in USD.
 */
export function montoEn(i: Montos, moneda: Moneda, tipoCambio?: number | null) {
  if (moneda === 'MXN') return i.total
  if (monedaDe(i) === 'USD') return i.montoOriginal ?? 0
  return tipoCambio ? convertir(i.total, 'MXN', 'USD', tipoCambio) : 0
}

/** An amount as recorded: subtotal, IVA, retenciones and total in MXN, and the USD total it came from, if any. */
export interface MontosRegistrados {
  subtotal: number
  iva: number
  retenciones: number
  total: number
  montoOriginal: number | null
  monedaOriginal: 'USD' | null
}

/**
 * The one constructor for recorded amounts. `iva` is whether 16% IVA applies on `subtotal`, or the
 * IVA itself; the total is subtotal + IVA − retenciones. With `tasaUsd` the inputs are USD cents:
 * each part converts at the rate and their USD total is kept as the original, which Cobros compares
 * against. Without one they are centavos, and `montoOriginal` is the USD total they were already
 * converted from, if any. A given `total` must balance with the inputs, or the amounts are refused.
 */
export function montos(
  subtotal: number,
  {
    iva,
    retenciones = 0,
    total,
    tasaUsd = null,
    montoOriginal = null
  }: { iva: boolean | number; retenciones?: number; total?: number; tasaUsd?: number | null; montoOriginal?: number | null }
): MontosRegistrados {
  const impuesto = typeof iva === 'number' ? iva : ivaDe(subtotal, iva)
  const suma = subtotal + impuesto - retenciones
  if (total !== undefined && total !== suma)
    throw new Error(`El total ${total} no cuadra con subtotal + IVA − retenciones (${suma})`)
  const mxn = (n: number) => (tasaUsd === null ? n : convertir(n, 'USD', 'MXN', tasaUsd))
  const original = tasaUsd === null ? montoOriginal : suma
  return {
    subtotal: mxn(subtotal),
    iva: mxn(impuesto),
    retenciones: mxn(retenciones),
    total: mxn(subtotal) + mxn(impuesto) - mxn(retenciones),
    montoOriginal: original,
    monedaOriginal: original === null ? null : 'USD'
  }
}

/** Splits `total` into `n` parts that add up to it, the remainder going to the first. */
export function repartir(total: number, n: number) {
  const parte = Math.floor(total / n)
  return Array.from({ length: n }, (_, i) => (i === 0 ? total - parte * (n - 1) : parte))
}

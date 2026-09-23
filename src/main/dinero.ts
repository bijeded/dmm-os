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
 * converted from, if any (a CFDI converts each part at its own TipoCambio). A given `total`, in the
 * inputs' units, is only checked: it must balance with them, or the amounts are refused. Each part
 * converts on its own, so the recorded total is the sum of converted parts, not the converted sum.
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

export const MENSAJE_REEMBOLSO_EXCEDIDO = 'No se puede reembolsar más de lo pagado'

type Partes = Pick<MontosRegistrados, 'total' | 'iva' | 'retenciones'>

/**
 * The Reembolso rule: the negative recorded amounts of giving back `monto`, in the Ingreso's own
 * currency, of Ingreso `de` with `queda` left of it (`original` in that currency). A USD one
 * converts at the Ingreso's own `tasaUsd` and keeps its USD amount. IVA and retenciones are in
 * `de`'s proportion; giving back all that is left takes the exact remainders. More is refused.
 */
export function reembolso(monto: number, { de, queda, tasaUsd }: { de: Partes; queda: Partes & { original: number }; tasaUsd: number | null }) {
  if (monto > queda.original) throw new Error(MENSAJE_REEMBOLSO_EXCEDIDO)
  const todo = monto === queda.original
  const total = todo ? queda.total : Math.min(queda.total, Math.round(monto * (tasaUsd ?? 1)))
  const parte = (f: keyof Partes) => (todo ? queda[f] : Math.min(queda[f], Math.round((total * de[f]) / de.total)))
  const [iva, retenciones] = [parte('iva'), parte('retenciones')]
  // 0 - n, not -n: a part with nothing to give back stays 0, never -0.
  const menos = (n: number) => 0 - n
  return montos(menos(total - iva + retenciones), {
    iva: menos(iva),
    retenciones: menos(retenciones),
    montoOriginal: tasaUsd === null ? null : menos(monto)
  })
}

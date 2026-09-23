/** The one message for an amount that is empty, not a number, zero or negative. */
export const MENSAJE_MONTO = 'Escribe un monto mayor a cero'

/**
 * `n` centavos when it is a whole number above zero (or zero too, with `cero`); otherwise throws
 * `MENSAJE_MONTO`. Both the forms and main judge amounts by this rule.
 */
export function exigirCentavos(n: number, { cero = false }: { cero?: boolean } = {}) {
  if (!Number.isInteger(n) || n < 0 || (n === 0 && !cero)) throw new Error(MENSAJE_MONTO)
  return n
}

/** Pesos typed by hand, e.g. `1,250.50`, `$1250` or `1 250`, as centavos above zero, rounded to the centavo. */
export function centavosDe(pesos: string) {
  const limpio = pesos.replace(/[,\s$]/g, '')
  return exigirCentavos(limpio === '' ? NaN : Math.round(Number(limpio) * 100))
}

/** IVA charged on top of a subtotal. */
export const TASA_IVA = 0.16

/** 16% IVA on top of a subtotal in centavos (or USD cents) when `conIva`, rounded; else none. */
export const ivaDe = (subtotal: number, conIva: boolean) => (conIva ? Math.round(subtotal * TASA_IVA) : 0)

/** A quote's subtotal (sum of cantidad × precio, rounded) and IVA on top of it when `conIva`. */
export function totalesCotizacion(partidas: readonly { cantidad: number; precio: number }[], conIva: boolean) {
  const subtotal = Math.round(partidas.reduce((s, p) => s + p.cantidad * p.precio, 0))
  const iva = ivaDe(subtotal, conIva)
  return { subtotal, iva, total: subtotal + iva }
}

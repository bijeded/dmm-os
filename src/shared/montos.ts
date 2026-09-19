/** The one message for an amount that isn't a positive number, wherever it is caught. */
export const MONTO_INVALIDO = 'Escribe un monto mayor a cero'

/** The one message for a negative IVA. */
export const IVA_NEGATIVO = 'El IVA no puede ser negativo'

/**
 * Pesos typed by hand, e.g. `1,250.50` or `$1250`, as centavos rounded to the centavo. Refuses
 * an empty, non-numeric, zero or negative amount.
 */
export function centavos(pesos: string) {
  const limpio = pesos.replace(/[,\s$]/g, '')
  // Shift the decimal point in the text, so 1.005 rounds to 101 rather than float noise's 100.
  const c = limpio === '' ? NaN : Math.round(Number(`${limpio}e2`))
  exigirMonto(c)
  return c
}

/** A subtotal in centavos must be a positive integer; its IVA may be zero, never negative. */
export function exigirMonto(subtotal: number, iva = 0) {
  if (!Number.isInteger(subtotal) || subtotal <= 0) throw new Error(MONTO_INVALIDO)
  if (!Number.isInteger(iva) || iva < 0) throw new Error(IVA_NEGATIVO)
}

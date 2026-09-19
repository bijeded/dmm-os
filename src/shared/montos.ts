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

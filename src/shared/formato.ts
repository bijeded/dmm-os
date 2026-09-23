/** A day (or timestamp) as a short date: `18 sept 2026`. */
export const dia = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

/** A day as a long date: `18 de septiembre de 2026`. */
export const fechaLarga = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })

/** Centavos (or USD cents) as money in `moneda`: `$1,250.50` in pesos, `USD 30.00` in dollars. */
export const monto = (centavos: number, moneda: 'MXN' | 'USD' = 'MXN') =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(centavos / 100)

/** Centavos as pesos with two-digit cents, e.g. `$296,000.00`. */
export const pesos = (centavos: number) => monto(centavos)

/** A Folio as shown everywhere, e.g. `DMM475a`. */
export const folioDmm = (folio: string | number) => `DMM${folio}`

// Search ignores accents and case: "clinica" finds "Clínica Sol".
export const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

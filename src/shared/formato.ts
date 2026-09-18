/** IVA charged on top of a quote's subtotal. */
export const TASA_IVA = 0.16

/** A day (or timestamp) as a short date: `18 sept 2026`. */
export const dia = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

/** A day as a long date: `18 de septiembre de 2026`. */
export const fechaLarga = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })

/** A Folio as shown everywhere, e.g. `DMM475a`. */
export const folioDmm = (folio: string | number) => `DMM${folio}`

// Search ignores accents and case: "clinica" finds "Clínica Sol".
export const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** A quote's subtotal (sum of cantidad × precio, rounded) and IVA on top of it when `conIva`. */
/** 16% IVA on top of a subtotal in centavos when `conIva`, else none. */
export const ivaDe = (subtotal: number, conIva: boolean) => (conIva ? Math.round(subtotal * TASA_IVA) : 0)

export function totalesCotizacion(partidas: readonly { cantidad: number; precio: number }[], conIva: boolean) {
  const subtotal = Math.round(partidas.reduce((s, p) => s + p.cantidad * p.precio, 0))
  const iva = ivaDe(subtotal, conIva)
  return { subtotal, iva, total: subtotal + iva }
}

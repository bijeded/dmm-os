/** IVA charged on top of a quote's subtotal. */
export const TASA_IVA = 0.16

/** The local calendar day of `d` as `YYYY-MM-DD`. */
export const diaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** A Folio as shown everywhere, e.g. `DMM475a`. */
export const folioDmm = (folio: string | number) => `DMM${folio}`

// Search ignores accents and case: "clinica" finds "Clínica Sol".
export const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** A quote's subtotal (sum of cantidad × precio, rounded) and IVA on top of it when `conIva`. */
export function totalesCotizacion(partidas: readonly { cantidad: number; precio: number }[], conIva: boolean) {
  const subtotal = Math.round(partidas.reduce((s, p) => s + p.cantidad * p.precio, 0))
  const iva = conIva ? Math.round(subtotal * TASA_IVA) : 0
  return { subtotal, iva, total: subtotal + iva }
}

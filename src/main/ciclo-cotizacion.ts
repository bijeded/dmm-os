import type { AccionCotizacion, EstadoCotizacion } from '../shared/dominio'

/** Which estados allow each action, and the refusal when the estado doesn't. */
const REGLAS: Record<AccionCotizacion, { en: readonly EstadoCotizacion[]; mensaje: string }> = {
  editar: { en: ['borrador'], mensaje: 'Solo un borrador se puede editar' },
  borrar: { en: ['borrador'], mensaje: 'Solo un borrador se puede borrar; cancélala en su lugar' },
  enviar: { en: ['borrador'], mensaje: 'Solo un borrador se puede enviar' },
  aceptar: { en: ['enviada'], mensaje: 'Solo una cotización enviada se puede aceptar' },
  rechazar: { en: ['enviada'], mensaje: 'Solo una cotización enviada se puede rechazar' },
  cancelar: { en: ['enviada', 'aceptada'], mensaje: 'Solo una cotización enviada o aceptada se puede cancelar' }
}

/** The actions the Ficha offers: exactly those `exigirCotizacion` accepts. */
export const accionesCotizacion = (estado: EstadoCotizacion): AccionCotizacion[] =>
  (Object.keys(REGLAS) as AccionCotizacion[]).filter((a) => REGLAS[a].en.includes(estado))

export function exigirCotizacion(accion: AccionCotizacion, estado: EstadoCotizacion): void {
  if (!REGLAS[accion].en.includes(estado)) throw new Error(REGLAS[accion].mensaje)
}

import { rechazoProyecto, type ContextoProyecto } from './ciclo-proyecto'
import type { AccionCotizacion, EstadoCotizacion, EstadoProyecto } from '../shared/dominio'

/** What the Cotización lifecycle needs beyond its estado: its Proyecto, which a cancel takes along. */
export interface ContextoCotizacion {
  proyecto: { estado: EstadoProyecto; cobro: ContextoProyecto } | null
}

/** Which estados allow each action, and the refusal when the estado doesn't. */
const REGLAS: Record<AccionCotizacion, { en: readonly EstadoCotizacion[]; mensaje: string }> = {
  editar: { en: ['borrador'], mensaje: 'Solo un borrador se puede editar' },
  borrar: { en: ['borrador'], mensaje: 'Solo un borrador se puede borrar; cancélala en su lugar' },
  enviar: { en: ['borrador'], mensaje: 'Solo un borrador se puede enviar' },
  aceptar: { en: ['enviada'], mensaje: 'Solo una cotización enviada se puede aceptar' },
  rechazar: { en: ['enviada'], mensaje: 'Solo una cotización enviada se puede rechazar' },
  cancelar: { en: ['enviada', 'aceptada'], mensaje: 'Solo una cotización enviada o aceptada se puede cancelar' }
}

/**
 * Why the action is refused, or `null` when it is allowed. Cancelling also cancels the Proyecto
 * (Cancelación con pagos), so it needs the Proyecto's lifecycle to allow that too.
 */
function rechazo(accion: AccionCotizacion, estado: EstadoCotizacion, ctx: ContextoCotizacion): string | null {
  if (!REGLAS[accion].en.includes(estado)) return REGLAS[accion].mensaje
  if (accion === 'cancelar' && ctx.proyecto) return rechazoProyecto('cancelar', ctx.proyecto.estado, ctx.proyecto.cobro)
  return null
}

/** The actions the Ficha offers: exactly those `exigirCotizacion` accepts. */
export const accionesCotizacion = (estado: EstadoCotizacion, ctx: ContextoCotizacion): AccionCotizacion[] =>
  (Object.keys(REGLAS) as AccionCotizacion[]).filter((a) => rechazo(a, estado, ctx) === null)

export function exigirCotizacion(accion: AccionCotizacion, estado: EstadoCotizacion, ctx: ContextoCotizacion): void {
  const mensaje = rechazo(accion, estado, ctx)
  if (mensaje) throw new Error(mensaje)
}

import { MENSAJE_SIN_PAGAR, type AccionProyecto, type Categoria, type EstadoProyecto } from '../shared/dominio'

export { MENSAJE_SIN_PAGAR }

/** What the Proyecto lifecycle needs beyond its estado. */
export interface ContextoProyecto {
  pagadoCompleto: boolean
}


/**
 * What a Proyecto takes from the Cotización linked to it: the categoría over `other`, and the
 * Cotización's fecha as a missing fecha de inicio. What the Proyecto already has stays.
 */
export function heredarDeCotizacion(
  proyecto: { categoria: Categoria; fechaInicio: string | null } | undefined,
  cotizacion: { categoria: Categoria; fecha: string }
): { categoria?: Categoria; fechaInicio?: string } {
  return {
    ...(proyecto?.categoria === 'other' && cotizacion.categoria !== 'other' && { categoria: cotizacion.categoria }),
    ...(proyecto && proyecto.fechaInicio === null && { fechaInicio: cotizacion.fecha })
  }
}

/** A Proyecto being worked on now: En curso, not paused, completed or cancelled. */
export const proyectoEnCurso = (estado: EstadoProyecto) => estado === 'en_curso'

/** Which estados allow each action, and the refusal when the estado doesn't. */
const REGLAS: Record<AccionProyecto, { en: readonly EstadoProyecto[]; mensaje: string }> = {
  editar: { en: ['en_curso', 'pausado', 'completado'], mensaje: 'Un proyecto cancelado no se edita' },
  borrar: { en: ['en_curso', 'pausado'], mensaje: 'Este proyecto no se puede borrar' },
  pausar: { en: ['en_curso'], mensaje: 'Solo un proyecto en curso se puede pausar' },
  reanudar: { en: ['pausado'], mensaje: 'Solo un proyecto pausado se puede reanudar' },
  completar: { en: ['en_curso', 'pausado'], mensaje: 'Solo un proyecto en curso o pausado se puede completar' },
  cancelar: { en: ['en_curso', 'pausado'], mensaje: 'Solo un proyecto en curso o pausado se puede cancelar' }
}

/** Whether only being unpaid stands between the Proyecto and Completar, so the Ficha shows what is unpaid. */
export const completarEsperaPago = (estado: EstadoProyecto, ctx: ContextoProyecto): boolean =>
  REGLAS.completar.en.includes(estado) && !ctx.pagadoCompleto

/** Why the action is refused, or `null` when it is allowed. A Proyecto is only completed once fully paid. */
export function rechazoProyecto(accion: AccionProyecto, estado: EstadoProyecto, ctx: ContextoProyecto): string | null {
  if (!REGLAS[accion].en.includes(estado)) return REGLAS[accion].mensaje
  if (accion === 'completar' && completarEsperaPago(estado, ctx)) return MENSAJE_SIN_PAGAR
  return null
}

/** The actions the Ficha offers: exactly those `exigirProyecto` accepts. */
export const accionesProyecto = (estado: EstadoProyecto, ctx: ContextoProyecto): AccionProyecto[] =>
  (Object.keys(REGLAS) as AccionProyecto[]).filter((a) => rechazoProyecto(a, estado, ctx) === null)

export function exigirProyecto(accion: AccionProyecto, estado: EstadoProyecto, ctx: ContextoProyecto): void {
  const mensaje = rechazoProyecto(accion, estado, ctx)
  if (mensaje) throw new Error(mensaje)
}

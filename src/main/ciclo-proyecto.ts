import type { EstadoCobro } from './cobranza'
import type { AccionProyecto, EstadoProyecto } from '../shared/dominio'

/**
 * The Proyecto lifecycle: which actions its estado and cobro allow. The Ficha's `acciones` and
 * every Proyecto command read it, so a Ficha offers exactly what the commands accept and a
 * refusal reads the same from every caller.
 */
const ACCIONES: readonly AccionProyecto[] = ['editar', 'borrar', 'pausar', 'reanudar', 'completar', 'cancelar']

const PERMITIDA_EN: Record<AccionProyecto, { en: readonly EstadoProyecto[]; mensaje: string }> = {
  editar: { en: ['en_curso', 'pausado', 'completado'], mensaje: 'Un proyecto cancelado no se edita' },
  borrar: { en: ['en_curso', 'pausado'], mensaje: 'Este proyecto no se puede borrar' },
  pausar: { en: ['en_curso'], mensaje: 'Solo un proyecto en curso se puede pausar' },
  reanudar: { en: ['pausado'], mensaje: 'Solo un proyecto pausado se puede reanudar' },
  completar: { en: ['en_curso', 'pausado'], mensaje: 'Solo un proyecto en curso o pausado se puede completar' },
  cancelar: { en: ['en_curso', 'pausado'], mensaje: 'Solo un proyecto en curso o pausado se puede cancelar' }
}

export const SIN_PAGAR = 'El proyecto se completa hasta que esté pagado por completo'

type Cobro = Pick<EstadoCobro, 'pagadoCompleto'>

/** Why the action is refused, or `null` when it is allowed. */
function negada(accion: AccionProyecto, estado: EstadoProyecto, cobro: Cobro): string | null {
  const regla = PERMITIDA_EN[accion]
  if (!regla.en.includes(estado)) return regla.mensaje
  // Delivered but unpaid, a Proyecto stays En curso.
  if (accion === 'completar' && !cobro.pagadoCompleto) return SIN_PAGAR
  return null
}

export const accionesProyecto = (estado: EstadoProyecto, cobro: Cobro): AccionProyecto[] =>
  ACCIONES.filter((a) => negada(a, estado, cobro) === null)

export function exigirProyecto(accion: AccionProyecto, estado: EstadoProyecto, cobro: Cobro): void {
  const mensaje = negada(accion, estado, cobro)
  if (mensaje !== null) throw new Error(mensaje)
}

/** What still blocks Completar, shown next to it while it is refused only for being unpaid. */
export const faltaParaCompletar = (estado: EstadoProyecto, cobro: EstadoCobro): EstadoCobro['falta'] =>
  negada('completar', estado, cobro) === SIN_PAGAR ? cobro.falta : null

import { describe, expect, it } from 'vitest'
import { accionesCotizacion, exigirCotizacion } from './ciclo-cotizacion'

const sinProyecto = { proyecto: null }

describe('el ciclo de una Cotización', () => {
  it('lets a draft be edited, deleted and sent, and nothing else', () => {
    expect(accionesCotizacion('borrador', sinProyecto)).toEqual(['editar', 'borrar', 'enviar'])
  })

  it('closes out a sent quote, and only cancels an accepted one', () => {
    expect(accionesCotizacion('enviada', sinProyecto)).toEqual(['aceptar', 'rechazar', 'cancelar'])
    expect(accionesCotizacion('aceptada', sinProyecto)).toEqual(['cancelar'])
    for (const estado of ['rechazada', 'cancelada', 'expirada'] as const) expect(accionesCotizacion(estado, sinProyecto)).toEqual([])
  })

  it('refuses with its own message', () => {
    expect(() => exigirCotizacion('editar', 'enviada', sinProyecto)).toThrow('Solo un borrador se puede editar')
    expect(() => exigirCotizacion('cancelar', 'borrador', sinProyecto)).toThrow('Solo una cotización enviada o aceptada se puede cancelar')
  })

  it('cancels only while its Proyecto can be cancelled too', () => {
    const proyecto = (estado: 'en_curso' | 'completado') => ({ proyecto: { estado, cobro: { pagadoCompleto: true } } })
    expect(accionesCotizacion('aceptada', proyecto('en_curso'))).toEqual(['cancelar'])
    expect(accionesCotizacion('aceptada', proyecto('completado'))).toEqual([])
    expect(() => exigirCotizacion('cancelar', 'aceptada', proyecto('completado'))).toThrow(/proyecto en curso o pausado/)
  })
})

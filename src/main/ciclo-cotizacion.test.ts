import { describe, expect, it } from 'vitest'
import { accionesCotizacion, exigirCotizacion } from './ciclo-cotizacion'

describe('el ciclo de una Cotización', () => {
  it('lets a draft be edited, deleted and sent, and nothing else', () => {
    expect(accionesCotizacion('borrador')).toEqual(['editar', 'borrar', 'enviar'])
  })

  it('closes out a sent quote, and only cancels an accepted one', () => {
    expect(accionesCotizacion('enviada')).toEqual(['aceptar', 'rechazar', 'cancelar'])
    expect(accionesCotizacion('aceptada')).toEqual(['cancelar'])
    for (const estado of ['rechazada', 'cancelada', 'expirada'] as const) expect(accionesCotizacion(estado)).toEqual([])
  })

  it('refuses with its own message', () => {
    expect(() => exigirCotizacion('editar', 'enviada')).toThrow('Solo un borrador se puede editar')
    expect(() => exigirCotizacion('cancelar', 'borrador')).toThrow('Solo una cotización enviada o aceptada se puede cancelar')
  })
})

import { describe, expect, it } from 'vitest'
import { accionesCotizacion, exigirCotizacion } from './ciclo-cotizacion'

const sinProyecto = { proyecto: null }

describe('el ciclo de una Cotización', () => {
  it('lets a draft be edited, deleted and sent, and nothing else', () => {
    expect(accionesCotizacion('borrador', sinProyecto)).toEqual(['editar', 'borrar', 'enviar'])
  })

  it('closes out a sent quote, and only cancels an accepted one', () => {
    expect(accionesCotizacion('enviada', sinProyecto)).toEqual(['aceptar', 'rechazar', 'cancelar', 'cambiarContacto'])
    expect(accionesCotizacion('aceptada', sinProyecto)).toEqual(['cancelar', 'cambiarContacto'])
    expect(accionesCotizacion('cancelada', sinProyecto)).toEqual(['cambiarContacto'])
  })

  it('offers the Aceptación tardía on an expirada or rechazada quote, and nowhere else', () => {
    for (const estado of ['expirada', 'rechazada'] as const) expect(accionesCotizacion(estado, sinProyecto)).toEqual(['aceptarTarde', 'cambiarContacto'])
    for (const estado of ['borrador', 'enviada', 'aceptada', 'cancelada'] as const) {
      expect(accionesCotizacion(estado, sinProyecto)).not.toContain('aceptarTarde')
      expect(() => exigirCotizacion('aceptarTarde', estado, sinProyecto)).toThrow('Solo una cotización expirada o rechazada se marca como aceptada')
    }
  })

  it('refuses the Aceptación tardía of a quote that already has a Proyecto', () => {
    const conProyecto = { proyecto: { estado: 'completado' as const, cobro: { pagadoCompleto: true } } }
    expect(accionesCotizacion('expirada', conProyecto)).toEqual(['cambiarContacto'])
    expect(() => exigirCotizacion('aceptarTarde', 'expirada', conProyecto)).toThrow('La cotización ya tiene proyecto')
  })

  it('changes a draft’s Contacto by editing it, never with Cambiar contacto', () => {
    expect(accionesCotizacion('borrador', sinProyecto)).not.toContain('cambiarContacto')
    expect(() => exigirCotizacion('cambiarContacto', 'borrador', sinProyecto)).toThrow('El contacto de un borrador se cambia al editarlo')
  })

  it('refuses with its own message', () => {
    expect(() => exigirCotizacion('editar', 'enviada', sinProyecto)).toThrow('Solo un borrador se puede editar')
    expect(() => exigirCotizacion('cancelar', 'borrador', sinProyecto)).toThrow('Solo una cotización enviada o aceptada se puede cancelar')
  })

  it('cancels only while its Proyecto can be cancelled too', () => {
    const proyecto = (estado: 'en_curso' | 'completado') => ({ proyecto: { estado, cobro: { pagadoCompleto: true } } })
    expect(accionesCotizacion('aceptada', proyecto('en_curso'))).toEqual(['cancelar', 'cambiarContacto'])
    expect(accionesCotizacion('aceptada', proyecto('completado'))).toEqual(['cambiarContacto'])
    expect(() => exigirCotizacion('cancelar', 'aceptada', proyecto('completado'))).toThrow(/proyecto en curso o pausado/)
  })
})

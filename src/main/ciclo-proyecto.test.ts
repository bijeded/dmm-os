import { describe, expect, it } from 'vitest'
import { accionesProyecto, exigirProyecto, MENSAJE_SIN_PAGAR, rechazoCambiarContacto } from './ciclo-proyecto'
import { ESTADOS_PROYECTO } from '../shared/dominio'

const deCliente = { etiqueta: 'cliente', contactoId: 1, cotizacionId: null } as const
const personal = { etiqueta: 'personal', contactoId: null, cotizacionId: null } as const
const sinContacto = { etiqueta: 'cliente', contactoId: null, cotizacionId: null } as const
// Inconsistent data the schema allows: it takes its Cotización's Contacto when moved.
const deCotizacionSinContacto = { etiqueta: 'cliente', contactoId: null, cotizacionId: 4 } as const

describe('el ciclo de un Proyecto', () => {
  it('offers Completar only once fully paid', () => {
    expect(accionesProyecto('en_curso', { pagadoCompleto: false }, personal)).toEqual(['editar', 'borrar', 'pausar', 'cancelar'])
    expect(accionesProyecto('en_curso', { pagadoCompleto: true }, personal)).toContain('completar')
  })

  it('refuses Completar unpaid with the same message from any estado that could complete', () => {
    for (const estado of ['en_curso', 'pausado'] as const)
      expect(() => exigirProyecto('completar', estado, { pagadoCompleto: false })).toThrow(MENSAJE_SIN_PAGAR)
    expect(() => exigirProyecto('completar', 'completado', { pagadoCompleto: true })).toThrow(/en curso o pausado/)
  })

  it('keeps a completed Proyecto editable only', () => {
    expect(accionesProyecto('completado', { pagadoCompleto: true }, personal)).toEqual(['editar'])
    expect(accionesProyecto('cancelado', { pagadoCompleto: true }, personal)).toEqual([])
  })

  it('offers Cambiar contacto in every estado for a client Proyecto with a Contacto, and only then', () => {
    for (const estado of ESTADOS_PROYECTO) {
      expect(accionesProyecto(estado, { pagadoCompleto: true }, deCliente)).toContain('cambiarContacto')
      expect(accionesProyecto(estado, { pagadoCompleto: true }, personal)).not.toContain('cambiarContacto')
      expect(accionesProyecto(estado, { pagadoCompleto: true }, sinContacto)).not.toContain('cambiarContacto')
      expect(accionesProyecto(estado, { pagadoCompleto: true }, deCotizacionSinContacto)).toContain('cambiarContacto')
    }
    expect(rechazoCambiarContacto(personal)).toBe('Un proyecto personal no tiene contacto')
    expect(rechazoCambiarContacto(sinContacto)).toBe('Asígnale un contacto desde Editar')
  })
})

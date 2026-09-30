import { describe, expect, it } from 'vitest'
import { accionesProyecto, exigirFechaFin, exigirProyecto, MENSAJE_SIN_PAGAR, rechazoCambiarContacto } from './ciclo-proyecto'
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
    expect(accionesProyecto('cancelado', { pagadoCompleto: true }, personal)).toEqual(['cambiarFechaFin'])
  })

  it('corrects the fecha de fin of a closed Proyecto only, within its fecha de inicio and today', () => {
    const hoy = '2026-09-29'
    const completado = { estado: 'completado', fechaInicio: '2019-01-07' } as const
    expect(exigirFechaFin(completado, '2019-03-15', hoy)).toBe('2019-03-15')
    expect(exigirFechaFin({ estado: 'cancelado', fechaInicio: null }, '2021-06-30', hoy)).toBe('2021-06-30')
    for (const estado of ['en_curso', 'pausado'] as const)
      expect(() => exigirFechaFin({ estado, fechaInicio: null }, '2019-03-15', hoy)).toThrow('Solo un proyecto completado o cancelado tiene fecha de fin')
    expect(() => exigirFechaFin(completado, '2026-09-30', hoy)).toThrow('posterior a hoy')
    expect(() => exigirFechaFin(completado, '2018-12-31', hoy)).toThrow('anterior a la fecha de inicio')
    expect(() => exigirFechaFin(completado, null, hoy)).toThrow('vacía')
    expect(() => exigirFechaFin(completado, '15/03/2019', hoy)).toThrow('Fecha inválida')
    expect(() => exigirProyecto('cambiarFechaFin', 'completado', { pagadoCompleto: true })).toThrow(/desde Editar/)
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

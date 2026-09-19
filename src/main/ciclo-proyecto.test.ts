import { describe, expect, it } from 'vitest'
import { accionesProyecto, exigirProyecto, MENSAJE_SIN_PAGAR } from './ciclo-proyecto'

describe('el ciclo de un Proyecto', () => {
  it('offers Completar only once fully paid', () => {
    expect(accionesProyecto('en_curso', { pagadoCompleto: false })).toEqual(['editar', 'borrar', 'pausar', 'cancelar'])
    expect(accionesProyecto('en_curso', { pagadoCompleto: true })).toContain('completar')
  })

  it('refuses Completar unpaid with the same message from any estado that could complete', () => {
    for (const estado of ['en_curso', 'pausado'] as const)
      expect(() => exigirProyecto('completar', estado, { pagadoCompleto: false })).toThrow(MENSAJE_SIN_PAGAR)
    expect(() => exigirProyecto('completar', 'completado', { pagadoCompleto: true })).toThrow(/en curso o pausado/)
  })

  it('keeps a completed Proyecto editable only', () => {
    expect(accionesProyecto('completado', { pagadoCompleto: true })).toEqual(['editar'])
    expect(accionesProyecto('cancelado', { pagadoCompleto: true })).toEqual([])
  })
})

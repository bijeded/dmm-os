import { describe, expect, it } from 'vitest'
import { asignacionDeCosto, type ProyectoAsignable } from './asignacion-costo'

const proyecto = (id: number, nombre: string, p: Partial<ProyectoAsignable> = {}): ProyectoAsignable => ({
  id,
  nombre,
  fechaInicio: '2026-01-10',
  fechaFin: null,
  estado: 'en_curso',
  ...p
})
const AURA = proyecto(1, 'Aura')
const NETDECKR = proyecto(2, 'Netdeckr')
const VOZ = proyecto(3, 'Voz')

describe('Asignación de costo', () => {
  it('splits the pool by tokens across the Proyectos AI with usage, the centavo left to the larger remainder', () => {
    // 36,000 × 9,100 ÷ 15,700 = 20,866.24 and 36,000 × 6,600 ÷ 15,700 = 15,133.76.
    expect(asignacionDeCosto('2026-09', 36_000, new Map([[1, 9_100], [2, 6_600]]), [AURA, NETDECKR])).toEqual({
      mes: '2026-09',
      total: 36_000,
      criterio: 'tokens',
      filas: [
        { proyectoId: 1, nombre: 'Aura', tokens: 9_100, parte: 9_100 / 15_700, monto: 20_866 },
        { proyectoId: 2, nombre: 'Netdeckr', tokens: 6_600, parte: 6_600 / 15_700, monto: 15_134 }
      ],
      sinAsignar: 0
    })
  })

  it('gives the centavos left over one each to the largest remainders, the first on a tie', () => {
    const tresIguales = new Map([[1, 500], [2, 500], [3, 500]])
    const montos = (total: number) => asignacionDeCosto('2026-09', total, tresIguales, [AURA, NETDECKR, VOZ]).filas.map((f) => f.monto)
    expect(montos(100)).toEqual([34, 33, 33])
    expect(montos(101)).toEqual([34, 34, 33])
    expect(montos(46_001)).toEqual([15_334, 15_334, 15_333])
  })

  it('splits evenly across the Proyectos AI Abiertos en el mes when none has usage in it', () => {
    const a = asignacionDeCosto('2026-09', 36_000, new Map(), [AURA, NETDECKR, VOZ])
    expect(a.criterio).toBe('partes_iguales')
    expect(a.filas.map((f) => [f.nombre, f.tokens, f.parte, f.monto])).toEqual([
      ['Aura', 0, 1 / 3, 12_000],
      ['Netdeckr', 0, 1 / 3, 12_000],
      ['Voz', 0, 1 / 3, 12_000]
    ])
    expect(a.sinAsignar).toBe(0)
  })

  it.each([
    ['a paused one started during the month', { fechaInicio: '2026-09-20', estado: 'pausado' }, true],
    ['one with no start date', { fechaInicio: null }, true],
    ['one completed on the month’s first day', { estado: 'completado', fechaFin: '2026-09-01' }, true],
    ['one cancelled during the month', { estado: 'cancelado', fechaFin: '2026-09-30' }, true],
    ['one completed before the month began', { estado: 'completado', fechaFin: '2026-08-31' }, false],
    ['an imported closed one with no end date', { estado: 'completado', fechaFin: null }, false],
    ['one that starts next month', { fechaInicio: '2026-10-01' }, false]
  ] as const)('tells whether %s is Abierto en el mes', (_, p, abierto) => {
    const a = asignacionDeCosto('2026-09', 36_000, new Map(), [proyecto(1, 'Aura', p)])
    expect(a.filas.map((f) => f.nombre)).toEqual(abierto ? ['Aura'] : [])
  })

  it('leaves the whole pool Sin asignar when no Proyecto AI has usage or is Abierto en el mes', () => {
    const cerrado = proyecto(1, 'Aura', { estado: 'cancelado', fechaFin: '2026-07-15' })
    expect(asignacionDeCosto('2026-09', 36_000, new Map(), [cerrado])).toEqual({ mes: '2026-09', total: 36_000, criterio: 'sin_proyectos', filas: [], sinAsignar: 36_000 })
    expect(asignacionDeCosto('2026-09', 36_000, new Map(), [])).toMatchObject({ criterio: 'sin_proyectos', sinAsignar: 36_000 })
  })
})

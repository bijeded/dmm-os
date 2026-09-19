import { describe, expect, it } from 'vitest'
import { accionesCosto, exigirCosto, type Costo, type Definicion } from './ciclo-costo'
import { accionesIngreso, exigirIngreso, MENSAJE_REEMBOLSO_EXCEDIDO, type Ingreso } from './ciclo-ingreso'

const ingreso = (i: Partial<Ingreso> = {}) =>
  ({ id: 1, estado: 'pagado', subtotal: 1000, iva: 0, total: 1000, montoOriginal: null, monedaOriginal: null, cfdiUuid: null, definicionId: null, cotizacionId: null, reembolsoDeId: null, ...i }) as Ingreso
const reembolso = (total: number) => ingreso({ id: 2, total: -total, subtotal: -total, reembolsoDeId: 1 })

describe('el ciclo de un Ingreso', () => {
  it('pays or cancels a pending one', () => {
    expect(accionesIngreso(ingreso({ estado: 'pendiente' }), { reembolsos: [] })).toEqual(['pagar', 'cancelar', 'borrar'])
  })

  it('refunds a paid one only while something is left to give back', () => {
    expect(accionesIngreso(ingreso(), { reembolsos: [reembolso(400)] })).toEqual(['reembolsar'])
    expect(accionesIngreso(ingreso(), { reembolsos: [reembolso(1000)] })).toEqual([])
    expect(() => exigirIngreso('reembolsar', ingreso(), { reembolsos: [reembolso(1000)] })).toThrow(MENSAJE_REEMBOLSO_EXCEDIDO)
    expect(() => exigirIngreso('reembolsar', ingreso({ estado: 'pendiente' }), { reembolsos: [] })).toThrow(/pagado/)
  })

  it('deletes only a hand-entered one, cancelled or not', () => {
    expect(accionesIngreso(ingreso({ estado: 'cancelado' }), { reembolsos: [] })).toEqual(['borrar'])
    expect(accionesIngreso(ingreso({ estado: 'cancelado', cfdiUuid: 'x' }), { reembolsos: [] })).toEqual([])
  })
})

const costo = (c: Partial<Costo> = {}) => ({ id: 1, estado: 'pendiente', cfdiUuid: null, definicionId: null, cotizacionId: null, ...c }) as Costo
const serie = (d: Partial<Definicion>) => ({ id: 7, tipo: 'mensual', periodoFin: null, ...d }) as Definicion
const ctx = { definicion: undefined, periodoActual: '2026-09', asignado: false }

describe('el ciclo de un Costo', () => {
  it('stops a series only while it runs and is not MSI', () => {
    const enSerie = costo({ definicionId: 7 })
    expect(accionesCosto(enSerie, { ...ctx, definicion: serie({}) })).toContain('detener')
    expect(accionesCosto(enSerie, { ...ctx, definicion: serie({ tipo: 'msi' }) })).not.toContain('detener')
    expect(() => exigirCosto('detener', enSerie, { ...ctx, definicion: serie({ periodoFin: '2026-09' }) })).toThrow(/detener/)
    expect(() => exigirCosto('detener', costo(), ctx)).toThrow(/detener/)
  })

  it('deletes only a hand-entered one-time Costo nothing is attributed from', () => {
    expect(accionesCosto(costo({ estado: 'cancelado' }), ctx)).toEqual(['borrar'])
    expect(accionesCosto(costo(), { ...ctx, asignado: true })).toEqual(['pagar', 'cancelar'])
  })
})

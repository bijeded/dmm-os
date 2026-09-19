import { describe, expect, it } from 'vitest'
import { planCobro, type CotizacionAPlanear } from './plan-cobro'

const hoy = '2026-09-18'
const cot = (cambios: Partial<CotizacionAPlanear> = {}): CotizacionAPlanear => ({
  moneda: 'MXN',
  facturacion: 'unica',
  parcialidades: null,
  subtotal: 10_000,
  iva: 1600,
  costosEstimados: [],
  ...cambios
})
const sinUsd = { montoOriginal: null, monedaOriginal: null }

describe('planCobro', () => {
  it('a one-off quote becomes one Ingreso for its whole amount', () => {
    const plan = planCobro(cot(), hoy)
    expect(plan.ingresos).toEqual([{ subtotal: 10_000, iva: 1600, total: 11_600, ...sinUsd, notas: null }])
    expect(plan.definicionIngreso).toBeNull()
    expect(plan.tipoCambio).toBeNull()
  })

  it('splits parcialidades so they add up exactly, the remainder on the first, each with its note', () => {
    const plan = planCobro(cot({ facturacion: 'parcialidades', parcialidades: 3, subtotal: 10_000, iva: 1600 }), hoy)
    expect(plan.ingresos.map((i) => [i.subtotal, i.iva, i.notas])).toEqual([
      [3334, 534, 'Parcialidad 1 de 3'],
      [3333, 533, 'Parcialidad 2 de 3'],
      [3333, 533, 'Parcialidad 3 de 3']
    ])
    expect(plan.ingresos.reduce((s, i) => s + i.total, 0)).toBe(11_600)
  })

  it('a monthly quote becomes a monthly definition starting this month', () => {
    const plan = planCobro(cot({ facturacion: 'mensual' }), hoy)
    expect(plan.ingresos).toEqual([])
    expect(plan.definicionIngreso).toEqual({ subtotal: 10_000, iva: 1600, total: 11_600, ...sinUsd })
    expect(plan.periodo).toBe('2026-09')
  })

  it('one-time costs become estimated Costos dated today; recurring and MSI ones definitions with their price', () => {
    const plan = planCobro(
      cot({
        costosEstimados: [
          { concepto: 'Hosting', monto: 500, categoria: 'unico', parcialidades: null },
          { concepto: 'Dominio', monto: 300, categoria: 'anual', parcialidades: null },
          { concepto: 'Laptop', monto: 2000, categoria: 'msi', parcialidades: 12 }
        ]
      }),
      hoy
    )
    expect(plan.costos).toEqual([{ nombre: 'Hosting', fecha: hoy, subtotal: 500, iva: 0, total: 500, ...sinUsd }])
    expect(plan.definicionesCosto).toEqual([
      { nombre: 'Dominio', tipo: 'anual', diaDelMes: 18, numeroParcialidades: null, precio: { subtotal: 300, iva: 0, total: 300, ...sinUsd } },
      { nombre: 'Laptop', tipo: 'msi', diaDelMes: 18, numeroParcialidades: 12, precio: { subtotal: 2000, iva: 0, total: 2000, ...sinUsd } }
    ])
  })

  it('treats a cost saved without a categoría as one-time', () => {
    const legacy = { concepto: 'Viejo', monto: 100, parcialidades: null } as unknown as CotizacionAPlanear['costosEstimados'][number]
    expect(planCobro(cot({ costosEstimados: [legacy] }), hoy).costos).toMatchObject([{ nombre: 'Viejo', total: 100 }])
  })

  it('converts a USD quote at the tipo de cambio, keeping each USD amount as the original', () => {
    const plan = planCobro(cot({ moneda: 'USD', facturacion: 'parcialidades', parcialidades: 2, subtotal: 333, iva: 53 }), hoy, 18.5)
    expect(plan.tipoCambio).toBe(18.5)
    expect(plan.ingresos).toEqual([
      { subtotal: 3090, iva: 500, total: 3590, montoOriginal: 194, monedaOriginal: 'USD', notas: 'Parcialidad 1 de 2' },
      { subtotal: 3071, iva: 481, total: 3552, montoOriginal: 192, monedaOriginal: 'USD', notas: 'Parcialidad 2 de 2' }
    ])
    expect(plan.ingresos.reduce((s, i) => s + i.montoOriginal!, 0)).toBe(386)
  })

  it.each([undefined, 0, -1])('refuses a USD quote with tipo de cambio %s', (tc) => {
    expect(() => planCobro(cot({ moneda: 'USD' }), hoy, tc)).toThrow('Indica el tipo de cambio de la cotización en USD')
  })
})

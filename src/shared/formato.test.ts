import { describe, expect, it } from 'vitest'
import { dia, fechaLarga, totalesCotizacion } from './formato'

describe('fechas en pantalla', () => {
  it('shows a day, or a timestamp by its day, in Spanish', () => {
    expect(dia('2026-09-18')).toBe(dia('2026-09-18T23:59:00.000Z'))
    expect(fechaLarga('2026-09-18')).toBe('18 de septiembre de 2026')
  })
})

describe('totalesCotizacion', () => {
  it('sums partidas and adds IVA on the rounded subtotal', () => {
    expect(totalesCotizacion([{ cantidad: 2, precio: 1000.4 }, { cantidad: 1, precio: 0.3 }], true)).toEqual({
      subtotal: 2001,
      iva: 320,
      total: 2321
    })
  })

  it('charges no IVA without conIva', () => {
    expect(totalesCotizacion([{ cantidad: 3, precio: 500 }], false)).toEqual({ subtotal: 1500, iva: 0, total: 1500 })
  })

  it('is zero with no partidas', () => {
    expect(totalesCotizacion([], true)).toEqual({ subtotal: 0, iva: 0, total: 0 })
  })
})

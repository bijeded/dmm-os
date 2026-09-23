import { describe, expect, it } from 'vitest'
import { centavosDe, exigirCentavos, MENSAJE_MONTO, totalesCotizacion } from './montos'

describe('centavosDe', () => {
  it('reads pesos typed with commas, spaces or a leading $', () => {
    expect(centavosDe('1,250.50')).toBe(125050)
    expect(centavosDe('$1250')).toBe(125000)
    expect(centavosDe(' 1 250 ')).toBe(125000)
  })

  it('rounds to the centavo', () => {
    expect(centavosDe('0.005')).toBe(1)
    expect(centavosDe('10.004')).toBe(1000)
  })

  it.each(['', '   ', 'abc', '0', '-5', '$0.00', '0.004'])('refuses %j with one message', (s) => {
    expect(() => centavosDe(s)).toThrow(MENSAJE_MONTO)
  })
})

describe('exigirCentavos', () => {
  it('accepts a positive whole number of centavos', () => {
    expect(exigirCentavos(1)).toBe(1)
  })

  it.each([0, -1, 1.5, NaN])('refuses %s with the same message', (n) => {
    expect(() => exigirCentavos(n)).toThrow(MENSAJE_MONTO)
  })

  it('takes zero when cero is allowed, never a negative', () => {
    expect(exigirCentavos(0, { cero: true })).toBe(0)
    expect(() => exigirCentavos(-1, { cero: true })).toThrow(MENSAJE_MONTO)
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

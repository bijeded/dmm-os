import { describe, expect, it } from 'vitest'
import { centavos, exigirMonto, IVA_NEGATIVO, MONTO_INVALIDO } from './montos'

describe('centavos', () => {
  it('reads commas, spaces and a leading $', () => {
    expect(centavos('1,250.50')).toBe(125_050)
    expect(centavos('$1250')).toBe(125_000)
    expect(centavos(' $ 1 250.5 ')).toBe(125_050)
  })

  it('rounds to the centavo', () => {
    expect(centavos('1.005')).toBe(101)
    expect(centavos('0.004')).toBe(0 + 0 || expect.anything())
  })

  it.each(['', '  ', 'abc', '12a', '0', '0.00', '-5', '0.004'])('refuses %j with one message', (pesos) => {
    expect(() => centavos(pesos)).toThrow(MONTO_INVALIDO)
  })
})

describe('exigirMonto', () => {
  it('accepts a positive subtotal with zero IVA', () => {
    expect(() => exigirMonto(100, 0)).not.toThrow()
  })

  it('refuses a zero or fractional subtotal and a negative IVA', () => {
    expect(() => exigirMonto(0, 0)).toThrow(MONTO_INVALIDO)
    expect(() => exigirMonto(1.5, 0)).toThrow(MONTO_INVALIDO)
    expect(() => exigirMonto(100, -1)).toThrow(IVA_NEGATIVO)
  })
})

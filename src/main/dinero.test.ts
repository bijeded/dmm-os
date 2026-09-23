import { describe, expect, it } from 'vitest'
import { monto } from '../shared/formato'
import { convertir, MENSAJE_REEMBOLSO_EXCEDIDO, monedaDe, montoEn, montos, reembolso, repartir, tasaDe } from './dinero'

const enPesos = { total: 1800, montoOriginal: null, monedaOriginal: null }
const enUsd = { total: 1800, montoOriginal: 100, monedaOriginal: 'USD' as const }

describe('dinero', () => {
  it('tells the currency an Ingreso was paid in and the rate it was recorded at', () => {
    expect([monedaDe(enPesos), monedaDe(enUsd)]).toEqual(['MXN', 'USD'])
    expect([tasaDe(enPesos), tasaDe(enUsd), tasaDe({ ...enUsd, montoOriginal: null })]).toEqual([null, 18, null])
  })

  it('reads an Ingreso in pesos or in USD, converting one paid in pesos at the tipo de cambio', () => {
    expect([montoEn(enUsd, 'MXN'), montoEn(enUsd, 'USD')]).toEqual([1800, 100])
    expect([montoEn(enPesos, 'USD', 18), montoEn(enPesos, 'USD'), montoEn(enPesos, 'USD', null)]).toEqual([100, 0, 0])
  })

  it('converts between pesos and USD by one rule, rounding to the centavo', () => {
    expect([convertir(333, 'USD', 'MXN', 18.5), convertir(6161, 'MXN', 'USD', 18.5), convertir(500, 'MXN', 'MXN', 18.5)]).toEqual([6161, 333, 500])
  })

  it('records an amount in MXN, converting one in USD at the tipo de cambio and keeping it as the original', () => {
    expect(montos(1000, { iva: 160 })).toEqual({ subtotal: 1000, iva: 160, retenciones: 0, total: 1160, montoOriginal: null, monedaOriginal: null })
    expect(montos(333, { iva: 53, tasaUsd: 18.5 })).toEqual({ subtotal: 6161, iva: 981, retenciones: 0, total: 7142, montoOriginal: 386, monedaOriginal: 'USD' })
  })

  it('adds 16% IVA on the subtotal when it applies, rounded to the centavo, and none when it does not', () => {
    expect(montos(10_000, { iva: true })).toMatchObject({ subtotal: 10_000, iva: 1600, total: 11_600 })
    expect(montos(10_000, { iva: false })).toMatchObject({ subtotal: 10_000, iva: 0, total: 10_000 })
    expect(montos(1003, { iva: true })).toMatchObject({ iva: 160, total: 1163 })
    expect(montos(1004, { iva: true })).toMatchObject({ iva: 161, total: 1165 })
  })

  it('takes IVA on a USD subtotal in USD, then converts each part', () => {
    expect(montos(333, { iva: true, tasaUsd: 18.5 })).toEqual({ subtotal: 6161, iva: 981, retenciones: 0, total: 7142, montoOriginal: 386, monedaOriginal: 'USD' })
  })

  it('subtracts retenciones from the total', () => {
    expect(montos(10_000, { iva: 1600, retenciones: 1066 })).toMatchObject({ retenciones: 1066, total: 10_534 })
    expect(montos(100, { iva: 16, retenciones: 10, tasaUsd: 18 })).toEqual({ subtotal: 1800, iva: 288, retenciones: 180, total: 1908, montoOriginal: 106, monedaOriginal: 'USD' })
  })

  it('takes a given total that balances, and refuses one that does not', () => {
    expect(montos(100_000, { iva: 16_000, retenciones: 20_667, total: 95_333 })).toMatchObject({ total: 95_333 })
    expect(() => montos(100_000, { iva: 16_000, retenciones: 20_667, total: 116_000 })).toThrow()
    expect(() => montos(100, { iva: 16, tasaUsd: 18, total: 115 })).toThrow()
  })

  it('keeps a given USD original for amounts already in pesos', () => {
    expect(montos(185_000, { iva: 29_600, retenciones: 18_500, total: 196_100, montoOriginal: 10_600 })).toEqual({
      subtotal: 185_000,
      iva: 29_600,
      retenciones: 18_500,
      total: 196_100,
      montoOriginal: 10_600,
      monedaOriginal: 'USD'
    })
  })

  describe('reembolso', () => {
    const conIva = { total: 11_600, iva: 1600, retenciones: 0 }
    const cfdi = { total: 95_333, iva: 16_000, retenciones: 20_667 }

    it('gives back a part with IVA in the Ingreso’s proportion, as negative amounts', () => {
      expect(reembolso(5800, { de: conIva, queda: { ...conIva, original: 11_600 }, tasaUsd: null })).toEqual({
        subtotal: -5000,
        iva: -800,
        retenciones: 0,
        total: -5800,
        montoOriginal: null,
        monedaOriginal: null
      })
    })

    it('gives back retenciones of an imported CFDI in proportion, and the exact remainders at the end', () => {
      const parcial = reembolso(30_000, { de: cfdi, queda: { ...cfdi, original: 95_333 }, tasaUsd: null })
      expect(parcial).toEqual({ subtotal: -31_469, iva: -5035, retenciones: -6504, total: -30_000, montoOriginal: null, monedaOriginal: null })
      const queda = { total: 65_333, iva: 10_965, retenciones: 14_163, original: 65_333 }
      const final = reembolso(65_333, { de: cfdi, queda, tasaUsd: null })
      expect(final).toEqual({ subtotal: -68_531, iva: -10_965, retenciones: -14_163, total: -65_333, montoOriginal: null, monedaOriginal: null })
    })

    it('takes a USD Ingreso’s amount in USD, converts at its own rate and keeps the USD original', () => {
      const usd = { total: 170_000, iva: 0, retenciones: 0 }
      expect(reembolso(1000, { de: usd, queda: { ...usd, original: 10_000 }, tasaUsd: 17 })).toEqual({
        subtotal: -17_000,
        iva: 0,
        retenciones: 0,
        total: -17_000,
        montoOriginal: -1000,
        monedaOriginal: 'USD'
      })
    })

    it('refuses more than what is left, in the Ingreso’s own currency', () => {
      expect(() => reembolso(3001, { de: conIva, queda: { ...conIva, total: 3000, iva: 414, original: 3000 }, tasaUsd: null })).toThrow(MENSAJE_REEMBOLSO_EXCEDIDO)
      const usd = { total: 170_000, iva: 0, retenciones: 0 }
      expect(() => reembolso(10_001, { de: usd, queda: { ...usd, original: 10_000 }, tasaUsd: 17 })).toThrow(MENSAJE_REEMBOLSO_EXCEDIDO)
    })
  })

  it('splits an amount into parts that add up exactly, the remainder on the first', () => {
    expect(repartir(10_000, 3)).toEqual([3334, 3333, 3333])
    expect(repartir(1600, 3)).toEqual([534, 533, 533])
    expect(repartir(500, 1)).toEqual([500])
    expect(repartir(9, 4).reduce((s, n) => s + n, 0)).toBe(9)
  })

  it('formats money in its currency', () => {
    expect(monto(125_050)).toBe('$1,250.50')
    expect(monto(3000, 'USD')).toBe('USD 30.00')
  })
})

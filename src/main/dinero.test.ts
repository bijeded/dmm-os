import { describe, expect, it } from 'vitest'
import { monto } from '../shared/formato'
import { monedaDe, montoEn, tasaDe } from './dinero'

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

  it('formats money in its currency', () => {
    expect(monto(125_050)).toBe('$1,250.50')
    expect(monto(3000, 'USD')).toBe('USD 30.00')
  })
})

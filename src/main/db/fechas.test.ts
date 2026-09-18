import { describe, expect, it } from 'vitest'
import { fechaEnPeriodo, sumarAnios, sumarDias, sumarMeses } from './fechas'

describe('fechas', () => {
  it('moves periods across years', () => {
    expect(sumarMeses('2026-11', 3)).toBe('2027-02')
    expect(sumarMeses('2026-01', -1)).toBe('2025-12')
  })

  it('keeps a day inside its month', () => {
    expect(fechaEnPeriodo('2026-02', 31)).toBe('2026-02-28')
  })

  it('moves days and years, a leap day landing on 28 February', () => {
    expect(sumarAnios('2028-02-29', -1)).toBe('2027-02-28')
    expect(sumarAnios('2025-03-10', 1)).toBe('2026-03-10')
    expect(sumarDias('2026-09-18', -30)).toBe('2026-08-19')
  })
})

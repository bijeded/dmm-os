import { describe, expect, it } from 'vitest'
import { dia, fechaLarga } from './formato'

describe('fechas en pantalla', () => {
  it('shows a day, or a timestamp by its day, in Spanish', () => {
    expect(dia('2026-09-18')).toBe(dia('2026-09-18T23:59:00.000Z'))
    expect(fechaLarga('2026-09-18')).toBe('18 de septiembre de 2026')
  })
})

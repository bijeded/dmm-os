import { describe, expect, it } from 'vitest'
import { toAbsolute, toRelative } from './paths'

const root = '/Users/fv/Desktop/DMM OS'

describe('stored paths (ADR 0001)', () => {
  it('stores a location relative to the DMM OS root', () => {
    expect(toRelative(root, '/Users/fv/Desktop/DMM OS/Proyectos/Aura')).toBe('Proyectos/Aura')
  })

  it('resolves a stored path against whichever root the Mac has now', () => {
    expect(toAbsolute('/Users/new/Desktop/DMM OS', 'Proyectos/Aura')).toBe('/Users/new/Desktop/DMM OS/Proyectos/Aura')
  })

  it('round-trips', () => {
    const abs = '/Users/fv/Desktop/DMM OS/Cotizaciones/2026/DMM260913120-Aura.pdf'
    expect(toAbsolute(root, toRelative(root, abs))).toBe(abs)
  })

  it('rejects locations outside the root', () => {
    expect(() => toRelative(root, '/Users/fv/Desktop/Otro/x.pdf')).toThrow()
    expect(() => toAbsolute(root, '../Otro/x.pdf')).toThrow()
    expect(() => toAbsolute(root, '/etc/passwd')).toThrow()
  })
})

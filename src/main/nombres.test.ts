import { describe, expect, it } from 'vitest'
import { clave, mejorEscrito, parecidos } from './nombres'

describe('clave de comparación', () => {
  it('ignores accents, case, punctuation and spacing', () => {
    expect(clave('Sonríeme')).toBe(clave('Sonrieme'))
    expect(clave('Círculo Medio')).toBe(clave('circulo  medio'))
    expect(clave('Dr. Román')).toBe(clave('Dr Roman'))
    expect(clave('AVC Noticias')).toBe(clave('avc-noticias'))
  })

  it('keeps different names apart', () => {
    expect(clave('Sublime')).not.toBe(clave('Sublime Inspiración'))
  })
})

describe('nombre canónico', () => {
  it('prefers the accented, correctly written spelling', () => {
    expect(mejorEscrito('Sonrieme', 'Sonríeme')).toBe('Sonríeme')
    expect(mejorEscrito('Sonríeme', 'Sonrieme')).toBe('Sonríeme')
  })

  it('prefers the spelling with punctuation when neither has accents', () => {
    expect(mejorEscrito('Dr Martinez', 'Dr. Martinez')).toBe('Dr. Martinez')
  })

  it('keeps the first spelling when nothing sets them apart', () => {
    expect(mejorEscrito('Alpes', 'ALPES')).toBe('Alpes')
  })
})

describe('parecidos', () => {
  it('flags a name that only differs by a trailing word', () => {
    expect(parecidos('Sublime', 'Sublime Inspiración')).toBe(true)
    expect(parecidos('AudioClinic', 'Audioclinic S.A.')).toBe(true)
  })

  it('flags a name one character off', () => {
    expect(parecidos('Miraos', 'Mirados')).toBe(true)
  })

  it('does not flag unrelated names', () => {
    expect(parecidos('Sublime', 'Lukka')).toBe(false)
    expect(parecidos('Ruba', 'Rita')).toBe(false)
  })

  it('does not flag a name against itself', () => {
    expect(parecidos('Sublime', 'sublime')).toBe(false)
  })
})

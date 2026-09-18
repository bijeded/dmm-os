import { describe, expect, it } from 'vitest'
import { fuentesMarca } from './plantilla-cotizacion'

describe('fuentesMarca', () => {
  it('embeds every brand face the PDF uses, so it prints the same on any machine', () => {
    const css = fuentesMarca()
    for (const [familia, peso] of [
      ['Antonio', 700],
      ['Asap', 400],
      ['Asap', 600],
      ['JetBrains Mono', 400],
      ['JetBrains Mono', 600]
    ])
      expect(css).toMatch(new RegExp(`font-family: '${familia}'; font-weight: ${peso}; src: url\\(data:font/woff2;base64,[A-Za-z0-9+/]{100,}`))
  })
})

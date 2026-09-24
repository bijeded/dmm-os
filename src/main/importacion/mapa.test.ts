import { describe, expect, it } from 'vitest'
import { esErrorMapa, leerMapa, type Mapa } from './mapa'

const mapa = (texto: string): Mapa => {
  const m = leerMapa(texto)
  if (esErrorMapa(m)) throw new Error(m.error)
  return m
}
const sinLinea = ({ enDisco, contacto, proyecto, clienteFinal, rfc }: Mapa['filas'][number]) => ({
  enDisco,
  contacto,
  proyecto,
  clienteFinal,
  rfc
})

describe('leer el Mapa de nombres', () => {
  it('reads a comma-separated file', () => {
    const m = mapa('en disco,contacto,proyecto,cliente final,rfc\nAppleseed Plataforma,Appleseed,Plataforma,,\n')
    expect(m.filas.map(sinLinea)).toEqual([
      { enDisco: 'Appleseed Plataforma', contacto: 'Appleseed', proyecto: 'Plataforma', clienteFinal: null, rfc: null }
    ])
    expect(m.filas[0].linea).toBe(2)
  })

  it('reads a map exported from Numbers with semicolons', () => {
    const m = mapa('en disco;contacto;proyecto;cliente final\r\nFrida Comunicacion;Frida;;\r\n')
    expect(m.filas.map(sinLinea)).toEqual([
      { enDisco: 'Frida Comunicacion', contacto: 'Frida', proyecto: null, clienteFinal: null, rfc: null }
    ])
  })

  it('keeps the delimiter inside a quoted field, and "" as a quote', () => {
    const m = mapa('en disco,contacto,proyecto\n"Clicme, Branding",Clicme,"Sitio ""nuevo"""\n')
    expect(m.filas[0]).toMatchObject({ enDisco: 'Clicme, Branding', proyecto: 'Sitio "nuevo"' })
  })

  it('strips the BOM Numbers and Excel write', () => {
    expect(mapa('\u{FEFF}en disco,contacto\nVersa,Versa\n').filas[0].enDisco).toBe('Versa')
  })

  it('reads the columns in any order, by name, whatever the case and accents', () => {
    const m = mapa('RFC,Contacto,Cliente Final,En disco\nVCO900213R94,Versa,Ácido,Versa Web\n')
    expect(m.filas.map(sinLinea)).toEqual([
      { enDisco: 'Versa Web', contacto: 'Versa', proyecto: null, clienteFinal: 'Ácido', rfc: 'VCO900213R94' }
    ])
  })

  it('ignores a notes column', () => {
    const m = mapa('en disco,nota,contacto\nVersa,ojo: es la agencia,Versa\n')
    expect(m.filas.map(sinLinea)).toEqual([
      { enDisco: 'Versa', contacto: 'Versa', proyecto: null, clienteFinal: null, rfc: null }
    ])
  })

  it('reads the missing fields of a short row as empty', () => {
    expect(mapa('en disco,contacto,proyecto,cliente final,rfc\nVersa,Versa\n').filas.map(sinLinea)).toEqual([
      { enDisco: 'Versa', contacto: 'Versa', proyecto: null, clienteFinal: null, rfc: null }
    ])
  })

  it('refuses a header with no "en disco" or "contacto" column', () => {
    const m = leerMapa('nombre,cliente\nVersa,Versa\n')
    expect(esErrorMapa(m) && m.error).toContain('Clientes/_nombres.csv')
    expect(esErrorMapa(leerMapa(''))).toBe(true)
  })

  it('skips blank rows and rows holding only a note', () => {
    const m = mapa('en disco,contacto,nota\n\n,,solo una nota\nVersa,Versa,\n')
    expect(m.filas.map((f) => f.linea)).toEqual([4])
    expect(m.descartadas).toEqual([])
  })

  it('counts lines from the row a multi-line quoted field starts on', () => {
    const m = mapa('en disco,contacto,nota\nVersa,Versa,"dos\nlíneas"\nFrida,Frida,\n')
    expect(m.filas.map((f) => f.linea)).toEqual([2, 4])
  })
})

describe('filas con problemas', () => {
  it('reports a row with no contacto, or with neither en disco nor rfc, as incompleta', () => {
    const m = mapa('en disco,contacto,rfc\nVersa,,\n,Frida,\n,Umanut,UMA2311072G4\n')
    expect(m.descartadas).toEqual([
      { linea: 2, problema: 'incompleta', enDisco: 'Versa' },
      { linea: 3, problema: 'incompleta', enDisco: '' }
    ])
    expect(m.filas.map((f) => f.contacto)).toEqual(['Umanut'])
  })

  it('keeps the first row of a repeated key and reports the later line', () => {
    const m = mapa('en disco,contacto\nx,x\ny,y\nFrida,Frida\nz,z\nw,w\nv,v\nu,u\nfrida,Frida Communication\n')
    expect(m.descartadas).toEqual([{ linea: 9, problema: 'duplicada', enDisco: 'frida' }])
    expect(m.buscar('Frida')?.linea).toBe(4)
  })
})

describe('buscar en el Mapa de nombres', () => {
  it('matches a name on disk regardless of case, accents and punctuation', () => {
    const m = mapa('en disco,contacto\nSonrieme,Sonríeme\n')
    expect(m.buscar('Sonríeme')?.contacto).toBe('Sonríeme')
    expect(m.buscar('SONRIEME!')?.contacto).toBe('Sonríeme')
  })

  it('lists the declared subfolders of a folder', () => {
    const m = mapa('en disco,contacto\nDMM Studios/Web 2023,DMM Studios\nDMM Studios/Web 2027,DMM Studios\nDMM Studios,DMM\n')
    expect(m.subcarpetas('DMM Studios').map((f) => f.enDisco)).toEqual(['DMM Studios/Web 2023', 'DMM Studios/Web 2027'])
    expect(m.subcarpetas('Versa')).toEqual([])
    expect(m.buscar('DMM Studios/Web 2023')?.linea).toBe(2)
    expect(m.buscar('DMM Studios')?.contacto).toBe('DMM')
  })

  it('lists the rows no name found as sin uso, never an RFC-only row', () => {
    const m = mapa('en disco,contacto,rfc\nVersa,Versa,\nAppleseed Plataformma,Appleseed,\n,Umanut,UMA2311072G4\n')
    m.buscar('Versa')
    m.consultar('Appleseed Plataformma')
    expect(m.sinUso().map((f) => f.enDisco)).toEqual(['Appleseed Plataformma'])
  })

  it('remembers which Contacto a found row resolved to', () => {
    const m = mapa('en disco,contacto\nVersa,Versa\n')
    const fila = m.buscar('Versa')!
    m.anotar(fila, 7)
    expect(m.contactoDe(fila)).toBe(7)
  })
})

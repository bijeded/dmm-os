import { describe, expect, it } from 'vitest'
import { leerNombreArchivo, nombresDeProyecto } from './cotizaciones'

describe('formato antiguo `DMM - <folio> - <Nombre>.pdf`', () => {
  it('reads the Folio and the name', () => {
    expect(leerNombreArchivo('DMM - 134 - Versa.pdf')).toEqual({
      folio: 134,
      sufijo: null,
      nombre: 'Versa',
      fecha: null
    })
  })

  it('reads the letter that distinguishes two quotes sharing a Folio', () => {
    expect(leerNombreArchivo('DMM - 475a- SMPP.pdf')).toMatchObject({ folio: 475, sufijo: 'a' })
    expect(leerNombreArchivo('DMM - 485b - PROCRECE.pdf')).toMatchObject({ folio: 485, sufijo: 'b' })
  })

  it('tolerates the missing spaces around the separator', () => {
    expect(leerNombreArchivo('DMM - 472- Mercedes.pdf')).toMatchObject({
      folio: 472,
      nombre: 'Mercedes'
    })
  })

  it('keeps accents and dots in the name', () => {
    expect(leerNombreArchivo('DMM - 164 - Dr. Eduardo Roman.pdf')).toMatchObject({
      nombre: 'Dr. Eduardo Roman'
    })
    expect(leerNombreArchivo('DMM - 138 - Etérea Editorial.pdf')).toMatchObject({
      nombre: 'Etérea Editorial'
    })
  })
})

describe('formato nuevo `<YYMMDD>-DMM<folio>-<Proyecto>.pdf`', () => {
  it('reads the Folio, the name and the date', () => {
    expect(leerNombreArchivo('260114-DMM520-Hospital Jardín.pdf')).toEqual({
      folio: 520,
      sufijo: null,
      nombre: 'Hospital Jardín',
      fecha: '2026-01-14'
    })
  })

  it('reads its letter suffix too', () => {
    expect(leerNombreArchivo('260114-DMM520b-Hospital Jardín.pdf')).toMatchObject({
      folio: 520,
      sufijo: 'b'
    })
  })
})

describe('what is not a Cotización', () => {
  it('ignores a file with no Folio', () => {
    expect(leerNombreArchivo('Plantilla.pdf')).toBeNull()
    expect(leerNombreArchivo('DMM - Clicme Google Workspace.pdf')).toBeNull()
  })

  it('ignores anything that is not a PDF', () => {
    expect(leerNombreArchivo('DMM - 134 - Versa.docx')).toBeNull()
    expect(leerNombreArchivo('.DS_Store')).toBeNull()
  })
})

describe('cotización antigua que lista varios proyectos', () => {
  it('splits the names it lists, first one first', () => {
    expect(nombresDeProyecto('Web + Branding')).toEqual(['Web', 'Branding'])
    expect(nombresDeProyecto('Web, Branding y Hosting')).toEqual(['Web', 'Branding', 'Hosting'])
    expect(nombresDeProyecto('Web / Branding')).toEqual(['Web', 'Branding'])
  })

  it('leaves a single name alone', () => {
    expect(nombresDeProyecto('Sublime Inspiración')).toEqual(['Sublime Inspiración'])
    expect(nombresDeProyecto('Amigos de Teresa')).toEqual(['Amigos de Teresa'])
  })
})

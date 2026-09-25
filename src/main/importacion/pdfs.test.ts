import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { contactos, cotizaciones } from '../db/schema'
import { db, reiniciarDb } from '../db/test-db'
import { pdfDeTexto } from './pdf-prueba'
import { leerPdfsCotizaciones, TAMANO_MAXIMO_PDF, textoDePdf } from './pdfs'

describe('textoDePdf', () => {
  it('extracts a Cotización PDF line by line, accents and curly quotes included', async () => {
    const texto = await textoDePdf(
      pdfDeTexto(['Ciudad de México, 29 de octubre, 2021.', 'Video “Curso” : Elaboración de video:', 'Costo: $ 3,000.00'])
    )
    expect(texto?.split('\n')).toEqual([
      'Ciudad de México, 29 de octubre, 2021.',
      'Video “Curso” : Elaboración de video:',
      'Costo: $ 3,000.00'
    ])
  })

  it('is null for a file that is not a PDF', async () => {
    expect(await textoDePdf(new TextEncoder().encode('no soy un pdf'))).toBeNull()
  })

  it('is null for a PDF with no text', async () => {
    expect(await textoDePdf(pdfDeTexto([]))).toBeNull()
  })
})

describe('leerPdfsCotizaciones', () => {
  let root: string
  beforeEach(() => {
    reiniciarDb()
    root = mkdtempSync(join(tmpdir(), 'dmm-pdfs-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const archivo = (anio: string, nombre: string, datos: Uint8Array | string) => {
    mkdirSync(join(root, 'Cotizaciones', anio), { recursive: true })
    writeFileSync(join(root, 'Cotizaciones', anio, nombre), datos)
  }

  it('reads each legacy quote not imported yet, by its path', async () => {
    archivo('2021', 'DMM - 250 - Flor de Letras.pdf', pdfDeTexto(['Costo: $ 3,000.00']))
    archivo('2021', 'DMM - 251a - Sublime.pdf', pdfDeTexto(['Costo: $ 1,000.00']))
    const leidos = await leerPdfsCotizaciones(root, db)
    expect([...leidos.keys()].sort()).toEqual(['Cotizaciones/2021/DMM - 250 - Flor de Letras.pdf', 'Cotizaciones/2021/DMM - 251a - Sublime.pdf'])
    expect(leidos.get('Cotizaciones/2021/DMM - 250 - Flor de Letras.pdf')).toBe('Costo: $ 3,000.00')
  })

  it('does not read a Folio already imported, letter included', async () => {
    const [c] = db.insert(contactos).values({ nombre: 'Sublime' }).returning().all()
    db.insert(cotizaciones).values({ folio: 251, folioSufijo: 'a', contactoId: c.id, categoria: 'other', estado: 'enviada', fecha: '2021-01-01' }).run()
    archivo('2021', 'DMM - 251a - Sublime.pdf', pdfDeTexto(['Costo: $ 1,000.00']))
    archivo('2021', 'DMM - 251b - Sublime.pdf', pdfDeTexto(['Costo: $ 2,000.00']))
    expect([...(await leerPdfsCotizaciones(root, db)).keys()]).toEqual(['Cotizaciones/2021/DMM - 251b - Sublime.pdf'])
  })

  it('reads imported Folios too without a database, as a reimport needs', async () => {
    const [c] = db.insert(contactos).values({ nombre: 'Sublime' }).returning().all()
    db.insert(cotizaciones).values({ folio: 251, contactoId: c.id, categoria: 'other', estado: 'enviada', fecha: '2021-01-01' }).run()
    archivo('2021', 'DMM - 251 - Sublime.pdf', pdfDeTexto(['Costo: $ 1,000.00']))
    expect([...(await leerPdfsCotizaciones(root)).keys()]).toEqual(['Cotizaciones/2021/DMM - 251 - Sublime.pdf'])
  })

  it('gives null for a corrupt file, without throwing', async () => {
    archivo('2019', 'DMM - 200 - Roto.pdf', '%PDF-1.4 roto')
    expect((await leerPdfsCotizaciones(root, db)).get('Cotizaciones/2019/DMM - 200 - Roto.pdf')).toBeNull()
  })

  it('gives null for a file too large to be a quote, without opening it', async () => {
    archivo('2019', 'DMM - 201 - Enorme.pdf', new Uint8Array(TAMANO_MAXIMO_PDF + 1))
    expect((await leerPdfsCotizaciones(root, db)).get('Cotizaciones/2019/DMM - 201 - Enorme.pdf')).toBeNull()
  })

  it('does not read new-format quotes, or files that are not quotes', async () => {
    archivo('2026', '260114-DMM520b-Hospital Jardín.pdf', pdfDeTexto(['Costo: $ 1.00']))
    archivo('2026', 'notas.txt', 'hola')
    expect((await leerPdfsCotizaciones(root, db)).size).toBe(0)
  })

  it('reads nothing when there is no Cotizaciones folder', async () => {
    expect((await leerPdfsCotizaciones(root, db)).size).toBe(0)
  })
})

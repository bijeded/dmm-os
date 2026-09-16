import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importarFacturas } from './facturas'
import { costos, ingresos } from './db/schema'
import { db, reiniciarDb } from './db/test-db'
import { cfdiXml } from './test-cfdi'

let root: string

const cfdi = (uuid: string) => cfdiXml({ uuid })

function escribir(rutaRelativa: string, contenido: string) {
  const file = join(root, rutaRelativa)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, contenido)
}

beforeEach(() => {
  reiniciarDb()
  root = mkdtempSync(join(tmpdir(), 'dmm-facturas-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('importarFacturas', () => {
  it('reads Emitidas as Ingresos and Recibidas as Costos, at any depth', () => {
    escribir('Facturas/Emitidas/2026/02/a.xml', cfdi('11111111-0000-4444-8888-99AABBCCDDEE'))
    escribir('Facturas/Recibidas/2026/b.xml', cfdi('22222222-0000-4444-8888-99AABBCCDDEE'))
    const log = importarFacturas(db, root)
    expect(log.importados).toBe(2)
    expect(db.select().from(ingresos).all()).toHaveLength(1)
    expect(db.select().from(costos).all()).toHaveLength(1)
  })

  it('ignores files that are not XML', () => {
    escribir('Facturas/Emitidas/2026/a.pdf', 'not xml')
    expect(importarFacturas(db, root).importados).toBe(0)
  })

  it('changes nothing on a second run', () => {
    escribir('Facturas/Emitidas/2026/a.xml', cfdi('11111111-0000-4444-8888-99AABBCCDDEE'))
    importarFacturas(db, root)
    const segunda = importarFacturas(db, root)
    expect(segunda).toMatchObject({ importados: 0, duplicados: 1 })
    expect(db.select().from(ingresos).all()).toHaveLength(1)
  })

  it('reports an unreadable CFDI and keeps going', () => {
    escribir('Facturas/Emitidas/2026/roto.xml', '<html>no</html>')
    escribir('Facturas/Emitidas/2026/b.xml', cfdi('33333333-0000-4444-8888-99AABBCCDDEE'))
    const log = importarFacturas(db, root)
    expect(log.importados).toBe(1)
    expect(log.errores).toEqual([
      { archivo: 'Facturas/Emitidas/2026/roto.xml', error: 'El archivo no es un CFDI' }
    ])
  })

  it('reports the RFCs no Contacto claims, once each', () => {
    escribir('Facturas/Emitidas/2026/a.xml', cfdi('11111111-0000-4444-8888-99AABBCCDDEE'))
    escribir('Facturas/Emitidas/2026/b.xml', cfdi('22222222-0000-4444-8888-99AABBCCDDEE'))
    expect(importarFacturas(db, root).rfcsDesconocidos).toEqual(['EOC180202XY9'])
  })

  it('reports a missing Facturas folder as No disponible rather than failing', () => {
    expect(importarFacturas(db, root)).toMatchObject({ importados: 0, noDisponibles: ['Facturas/Emitidas', 'Facturas/Recibidas'] })
  })
})

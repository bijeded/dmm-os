import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { escanearCarpetas } from './escaneo'
import { contactos, cotizaciones, proyectos, sugerenciasImportacion, ubicacionesArchivo } from './db/schema'
import { db, reiniciarDb } from './db/test-db'

let root: string
let hdd: string

beforeEach(() => {
  reiniciarDb()
  root = mkdtempSync(join(tmpdir(), 'dmm-root-'))
  hdd = mkdtempSync(join(tmpdir(), 'dmm-hdd-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(hdd, { recursive: true, force: true })
})

const carpeta = (base: string, ...partes: string[]) => {
  const ruta = join(base, ...partes)
  mkdirSync(ruta, { recursive: true })
  return ruta
}
const pdf = (base: string, anio: string, nombre: string) => {
  writeFileSync(join(carpeta(base, 'Cotizaciones', anio), nombre), '%PDF-1.4')
}

describe('escanear Cotizaciones/', () => {
  it('imports every quote PDF, year by year', () => {
    pdf(root, '2017', 'DMM - 134 - Versa.pdf')
    pdf(root, '2025', 'DMM - 475a- SMPP.pdf')
    pdf(root, '2025', 'DMM - 475b- SMPP.pdf')

    const log = escanearCarpetas(db, root)
    expect(log.cotizaciones.importadas).toBe(3)
    expect(db.select().from(cotizaciones).all()).toHaveLength(3)
  })

  it('ignores files that are not quotes', () => {
    pdf(root, '2025', 'DMM - Clicme Google Workspace.pdf')
    writeFileSync(join(carpeta(root, 'Cotizaciones', '2025'), 'notas.txt'), 'x')
    expect(escanearCarpetas(db, root).cotizaciones.importadas).toBe(0)
  })

  it('changes nothing on a second run', () => {
    pdf(root, '2017', 'DMM - 134 - Versa.pdf')
    escanearCarpetas(db, root)
    const log = escanearCarpetas(db, root)
    expect(log.cotizaciones).toEqual({ importadas: 0, duplicadas: 1 })
    expect(db.select().from(cotizaciones).all()).toHaveLength(1)
  })

  it('reports the folder as No disponible when it cannot be read', () => {
    expect(escanearCarpetas(db, root).noDisponibles).toContain('Cotizaciones')
  })
})

describe('escanear Clientes/ y Proyectos/', () => {
  it('creates a Contacto for every folder under Clientes/', () => {
    carpeta(root, 'Clientes', 'Estudio Ocho')
    carpeta(root, 'Clientes', 'Sonríeme')
    escanearCarpetas(db, root)
    expect(db.select().from(contactos).all().map((c) => c.nombre).sort()).toEqual([
      'Estudio Ocho',
      'Sonríeme'
    ])
  })

  it('creates an En curso Proyecto for every folder under Proyectos/', () => {
    carpeta(root, 'Proyectos', 'Clicme')
    const log = escanearCarpetas(db, root)
    expect(log.proyectos.creados).toBe(1)
    expect(db.select().from(proyectos).get()).toMatchObject({ nombre: 'Clicme', estado: 'en_curso' })
  })

  it('marks a folder found under Archivo/ as completed', () => {
    carpeta(root, 'Archivo', 'Proyectos', 'Versa')
    escanearCarpetas(db, root)
    expect(db.select().from(proyectos).get()!.estado).toBe('completado')
  })

  it('ignores hidden entries and loose files', () => {
    carpeta(root, 'Proyectos', 'Clicme')
    writeFileSync(join(root, 'Proyectos', '.DS_Store'), 'x')
    writeFileSync(join(root, 'Proyectos', 'notas.txt'), 'x')
    expect(escanearCarpetas(db, root).proyectos.creados).toBe(1)
  })

  it('ties a quote and a folder of the same name together', () => {
    pdf(root, '2025', 'DMM - 475 - Clicme.pdf')
    carpeta(root, 'Proyectos', 'Clicme')
    escanearCarpetas(db, root)
    expect(db.select().from(cotizaciones).get()!.estado).toBe('aceptada')
    expect(db.select().from(proyectos).get()!.cotizacionId).toBe(db.select().from(cotizaciones).get()!.id)
  })
})

describe('el HDD externo como fuente secundaria', () => {
  it('records its folders as a second location', () => {
    carpeta(root, 'Proyectos', 'Clicme')
    carpeta(hdd, 'Proyectos', 'Clicme')
    const log = escanearCarpetas(db, root, hdd)
    expect(log.hddConectado).toBe(true)
    expect(db.select().from(proyectos).all()).toHaveLength(1)
    expect(db.select().from(ubicacionesArchivo).all().map((u) => u.tipo).sort()).toEqual([
      'hdd_externo',
      'proyectos'
    ])
  })

  it('keeps a Proyecto that lives only on the HDD when the drive is gone', () => {
    carpeta(hdd, 'Proyectos', 'Versa')
    escanearCarpetas(db, root, hdd)
    rmSync(hdd, { recursive: true, force: true })

    const log = escanearCarpetas(db, root, hdd)
    expect(log.hddConectado).toBe(false)
    expect(db.select().from(proyectos).all()).toHaveLength(1)
    expect(db.select().from(ubicacionesArchivo).get()!.disponible).toBe(false)
  })

  it('brings the location back when the drive returns', () => {
    carpeta(hdd, 'Proyectos', 'Versa')
    escanearCarpetas(db, root, hdd)
    escanearCarpetas(db, root)
    escanearCarpetas(db, root, hdd)
    expect(db.select().from(ubicacionesArchivo).get()!.disponible).toBe(true)
  })
})

describe('cotización aceptada sin carpeta', () => {
  it('gets a completed Proyecto and a one-time question in Logs', () => {
    pdf(root, '2025', 'DMM - 475 - Clicme.pdf')
    carpeta(root, 'Proyectos', 'Clicme')
    escanearCarpetas(db, root)

    // The folder moved away between runs; the quote stays aceptada, the Proyecto stays.
    rmSync(join(root, 'Proyectos', 'Clicme'), { recursive: true })
    const log = escanearCarpetas(db, root)
    expect(log.proyectosSinCarpeta).toBe(0)
    expect(db.select().from(proyectos).all()).toHaveLength(1)
  })

  it('asks once for a quote accepted with no folder anywhere', () => {
    pdf(root, '2025', 'DMM - 475 - Versa.pdf')
    escanearCarpetas(db, root)
    db.update(cotizaciones).set({ estado: 'aceptada' }).run()

    expect(escanearCarpetas(db, root).proyectosSinCarpeta).toBe(1)
    expect(escanearCarpetas(db, root).proyectosSinCarpeta).toBe(0)
    const s = db.select().from(sugerenciasImportacion).all().filter((x) => x.accion === 'ubicacion')
    expect(s).toHaveLength(1)
  })
})

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { escanearCarpetas } from '.'
import {
  contactos,
  costos,
  cotizaciones,
  definicionesCosto,
  definicionesIngreso,
  ingresos,
  proyectos,
  sugerenciasImportacion,
  ubicacionesArchivo
} from '../db/schema'
import { db, reiniciarDb } from '../db/test-db'

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

/** A known Proyecto, Hospital Jardín, for the agency Grupo Ángeles; returns the agency. */
const hospitalJardin = () => {
  const [cliente] = db.insert(contactos).values({ nombre: 'Grupo Ángeles' }).returning().all()
  db.insert(proyectos).values({ nombre: 'Hospital Jardín', contactoId: cliente.id, categoria: 'other', estado: 'en_curso' }).run()
  return cliente
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

  it('files a new-format quote under the Contacto of the Proyecto it names', () => {
    const cliente = hospitalJardin()
    pdf(root, '2026', '260114-DMM520-Hospital Jardin.pdf')

    const log = escanearCarpetas(db, root)
    expect(log.cotizaciones.importadas).toBe(1)
    expect(db.select().from(cotizaciones).get()?.contactoId).toBe(cliente.id)
    expect(db.select().from(contactos).all().map((c) => c.nombre)).toEqual(['Grupo Ángeles'])
  })

  it('files a new-format quote under a Proyecto folder found in the same scan', () => {
    pdf(root, '2026', '260114-DMM520-Clicme.pdf')
    carpeta(root, 'Proyectos', 'Clicme')

    const log = escanearCarpetas(db, root)
    expect(log.errores).toEqual([])
    expect(db.select().from(cotizaciones).get()?.contactoId).toBe(db.select().from(proyectos).get()?.contactoId)
  })

  it('refuses a new-format quote whose Proyecto it does not know, rather than invent a Contacto', () => {
    pdf(root, '2026', '260114-DMM520-Hospital Jardín.pdf')

    const log = escanearCarpetas(db, root)
    expect(log.cotizaciones.importadas).toBe(0)
    expect(log.errores).toEqual([
      { archivo: 'Cotizaciones/2026/260114-DMM520-Hospital Jardín.pdf', error: expect.stringContaining('Hospital Jardín') }
    ])
    expect(db.select().from(cotizaciones).all()).toHaveLength(0)
    expect(db.select().from(contactos).all()).toHaveLength(0)
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

// ADR-0002: imported history is exempt from the lifecycle guards.
describe('la historia importada no pasa por el ciclo de vida', () => {
  it('completes an archived Proyecto with no Ingresos behind it', () => {
    carpeta(root, 'Archivo', 'Proyectos', 'Versa')
    escanearCarpetas(db, root)
    expect(db.select().from(proyectos).get()!.estado).toBe('completado')
    expect(db.select().from(ingresos).all()).toHaveLength(0)
  })

  it('accepts a quote tied to a folder without creating Ingresos or Costos', () => {
    pdf(root, '2025', 'DMM - 475 - Clicme.pdf')
    carpeta(root, 'Proyectos', 'Clicme')
    escanearCarpetas(db, root)
    expect(db.select().from(cotizaciones).get()!.estado).toBe('aceptada')
    expect(db.select().from(ingresos).all()).toHaveLength(0)
    expect(db.select().from(definicionesIngreso).all()).toHaveLength(0)
    expect(db.select().from(costos).all()).toHaveLength(0)
    expect(db.select().from(definicionesCosto).all()).toHaveLength(0)
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

describe('el Contacto por nombre canónico', () => {
  it('upgrades the stored name to the better-written spelling', () => {
    carpeta(root, 'Clientes', 'Sonrieme')
    escanearCarpetas(db, root)
    carpeta(hdd, 'Proyectos', 'Sonríeme')
    const log = escanearCarpetas(db, root, hdd)
    expect(log.contactos.creados).toBe(0)
    expect(db.select().from(contactos).all().map((c) => c.nombre)).toEqual(['Sonríeme'])
  })

  it('leaves a near-duplicate as its own Contacto and suggests the merge once', () => {
    carpeta(root, 'Clientes', 'Sublime')
    carpeta(root, 'Clientes', 'Sublime Inspiración')
    const log = escanearCarpetas(db, root)
    expect(log.contactos.creados).toBe(2)
    expect(log.sugerencias).toBe(1)
    expect(db.select().from(sugerenciasImportacion).get()).toMatchObject({ entidad: 'contacto', accion: 'fusionar', estado: 'pendiente' })

    expect(escanearCarpetas(db, root)).toMatchObject({ sugerencias: 0, contactos: { creados: 0 } })
    expect(db.select().from(sugerenciasImportacion).all()).toHaveLength(1)
  })
})

describe('una Cotización desde su PDF', () => {
  it('records it as enviada, with its Folio and its PDF, dated from the folder year', () => {
    pdf(root, '2025', 'DMM - 475 - Sonrieme.pdf')
    escanearCarpetas(db, root)
    expect(db.select().from(cotizaciones).get()).toMatchObject({
      folio: 475,
      folioSufijo: '',
      estado: 'enviada',
      fecha: '2025-01-01',
      pdfRutaRelativa: 'Cotizaciones/2025/DMM - 475 - Sonrieme.pdf'
    })
  })

  it('dates it from the filename when the new format carries a date', () => {
    hospitalJardin()
    pdf(root, '2026', '260114-DMM520-Hospital Jardín.pdf')
    escanearCarpetas(db, root)
    expect(db.select().from(cotizaciones).get()!.fecha).toBe('2026-01-14')
  })

  it('keeps two quotes sharing a Folio apart by their letter', () => {
    pdf(root, '2025', 'DMM - 475a- SMPP.pdf')
    pdf(root, '2025', 'DMM - 475b- SMPP.pdf')
    escanearCarpetas(db, root)
    expect(db.select().from(cotizaciones).all().map((c) => c.folioSufijo).sort()).toEqual(['a', 'b'])
  })
})

describe('la carpeta de un Proyecto', () => {
  it('records where it was found', () => {
    carpeta(root, 'Archivo', 'Proyectos', 'Versa')
    escanearCarpetas(db, root)
    expect(db.select().from(ubicacionesArchivo).get()).toMatchObject({
      tipo: 'archivo',
      rutaRelativa: 'Archivo/Proyectos/Versa',
      disponible: true
    })
  })

  it('is one Proyecto when the two roots spell its folder differently', () => {
    carpeta(root, 'Proyectos', 'Sonríeme')
    carpeta(hdd, 'Proyectos', 'Sonrieme')
    escanearCarpetas(db, root, hdd)
    expect(db.select().from(proyectos).all()).toHaveLength(1)
    expect(db.select().from(ubicacionesArchivo).all()).toHaveLength(2)
  })

  it('changes nothing when the same folder is scanned again', () => {
    carpeta(root, 'Proyectos', 'Clicme')
    escanearCarpetas(db, root)
    expect(escanearCarpetas(db, root).proyectos).toEqual({ creados: 0, actualizados: 1 })
    expect(db.select().from(ubicacionesArchivo).all()).toHaveLength(1)
  })

  it('suggests the link to the Cotización of the same name, once', () => {
    pdf(root, '2025', 'DMM - 475 - Clicme.pdf')
    carpeta(root, 'Proyectos', 'Clicme')
    expect(escanearCarpetas(db, root).sugerencias).toBe(1)
    expect(db.select().from(sugerenciasImportacion).get()).toMatchObject({
      entidad: 'cotizacion',
      entidadId: db.select().from(cotizaciones).get()!.id,
      accion: 'vincular',
      proyectoId: db.select().from(proyectos).get()!.id
    })
    expect(escanearCarpetas(db, root).sugerencias).toBe(0)
  })

  it('keeps the extra names of a legacy multi-project quote in the notes', () => {
    pdf(root, '2025', 'DMM - 475 - Clicme + Branding.pdf')
    carpeta(root, 'Proyectos', 'Clicme')
    escanearCarpetas(db, root)
    expect(db.select().from(proyectos).get()!.notas).toContain('Branding')
  })

  it('links one Proyecto only, leaving a second matching quote alone', () => {
    pdf(root, '2025', 'DMM - 1 - Clicme.pdf')
    pdf(root, '2025', 'DMM - 2 - Clicme.pdf')
    escanearCarpetas(db, root)
    carpeta(root, 'Proyectos', 'Clicme')
    escanearCarpetas(db, root)
    expect(db.select().from(cotizaciones).all().filter((c) => c.estado === 'aceptada')).toHaveLength(1)
  })
})

describe('el log cuenta lo que la corrida agregó', () => {
  it('ignores Sugerencias left pending by earlier runs', () => {
    carpeta(root, 'Clientes', 'Sublime')
    carpeta(root, 'Clientes', 'Sublime Inspiración')
    escanearCarpetas(db, root)
    carpeta(root, 'Proyectos', 'Clicme')
    expect(escanearCarpetas(db, root)).toMatchObject({ sugerencias: 0, contactos: { creados: 1 } })
  })

  it('counts the one-time location question for a quote accepted with no folder', () => {
    pdf(root, '2025', 'DMM - 475 - Versa.pdf')
    escanearCarpetas(db, root)
    db.update(cotizaciones).set({ estado: 'aceptada' }).run()
    const log = escanearCarpetas(db, root)
    expect(log.sugerencias).toBe(1)
    expect(db.select().from(proyectos).get()).toMatchObject({ nombre: 'Versa', estado: 'completado' })
  })
})

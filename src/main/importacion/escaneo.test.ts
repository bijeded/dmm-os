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
import { responder } from '../sugerencias'

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

// The Mapa de nombres: `Clientes/_nombres.csv`, read once per run.
const mapa = (base: string, texto: string) => {
  writeFileSync(join(carpeta(base, 'Clientes'), '_nombres.csv'), texto)
}
const CABECERA = 'en disco,contacto,proyecto,cliente final,rfc\n'
const nombresDeContactos = () =>
  db
    .select()
    .from(contactos)
    .all()
    .map((c) => c.nombre)
    .sort()
const contactoDe = (id: number | null) => db.select().from(contactos).all().find((c) => c.id === id)?.nombre
const cotizacion = (folio: number) => db.select().from(cotizaciones).all().find((c) => c.folio === folio)!

describe('leer el Mapa de nombres', () => {
  it('imports as it always has when there is no map, and says so', () => {
    carpeta(root, 'Clientes', 'Estudio Ocho')
    pdf(root, '2017', 'DMM - 134 - Versa.pdf')
    const log = escanearCarpetas(db, root)
    expect(log.mapa).toBe('ausente')
    expect(nombresDeContactos()).toEqual(['Estudio Ocho', 'Versa'])
  })

  it('imports nothing when the header is broken, and names the file', () => {
    mapa(root, 'nombre,cliente\nVersa,Versa\n')
    carpeta(root, 'Clientes', 'Estudio Ocho')
    carpeta(root, 'Proyectos', 'Clicme')
    pdf(root, '2017', 'DMM - 134 - Versa.pdf')

    const log = escanearCarpetas(db, root)
    expect(log.mapa).toEqual({ error: expect.stringContaining('Clientes/_nombres.csv') })
    expect(log.cotizaciones.importadas).toBe(0)
    expect(db.select().from(contactos).all()).toHaveLength(0)
    expect(db.select().from(cotizaciones).all()).toHaveLength(0)
    expect(db.select().from(proyectos).all()).toHaveLength(0)
  })

  it('imports nothing when the map cannot be read', () => {
    carpeta(root, 'Clientes', '_nombres.csv')
    carpeta(root, 'Proyectos', 'Clicme')
    const log = escanearCarpetas(db, root)
    expect(log.mapa).toEqual({ error: expect.stringContaining('Clientes/_nombres.csv') })
    expect(db.select().from(proyectos).all()).toHaveLength(0)
  })

  it('never takes the map file for a Contacto', () => {
    mapa(root, CABECERA)
    carpeta(root, 'Clientes', 'Estudio Ocho')
    const log = escanearCarpetas(db, root)
    expect(log.mapa).toBe('leido')
    expect(nombresDeContactos()).toEqual(['Estudio Ocho'])
  })
})

describe('un nombre del mapa se importa bajo su Contacto', () => {
  it('Map spelling wins', () => {
    mapa(root, `${CABECERA}Audio Clinic,Audioclinic,,\n`)
    pdf(root, '2019', 'DMM - 201 - Audio Clinic.pdf')
    carpeta(root, 'Clientes', 'Audioclinic')

    escanearCarpetas(db, root)
    expect(nombresDeContactos()).toEqual(['Audioclinic'])
    expect(cotizacion(201).nombre).toBe('Audio Clinic')
  })

  it('takes the map spelling over a better-accented name on disk', () => {
    mapa(root, `${CABECERA}Sonrieme Web,Sonrieme,,\n`)
    pdf(root, '2019', 'DMM - 201 - Sonrieme Web.pdf')
    carpeta(root, 'Clientes', 'Sonríeme')
    escanearCarpetas(db, root)
    expect(nombresDeContactos()).toEqual(['Sonrieme'])
  })

  it('does not split a name without a spaced dash', () => {
    pdf(root, '2019', 'DMM - 202 - Anarco-guadalupano.pdf')
    escanearCarpetas(db, root)
    expect(nombresDeContactos()).toEqual(['Anarco-guadalupano'])
    expect(cotizacion(202).nombre).toBe('Anarco-guadalupano')
  })

  it('Quote named after a project', () => {
    mapa(root, `${CABECERA}Appleseed Plataforma,Appleseed,Plataforma,\n`)
    pdf(root, '2023', 'DMM - 312 - Appleseed Plataforma.pdf')

    escanearCarpetas(db, root)
    expect(contactoDe(cotizacion(312).contactoId)).toBe('Appleseed')
    expect(cotizacion(312)).toMatchObject({
      nombre: 'Plataforma',
      pdfRutaRelativa: 'Cotizaciones/2023/DMM - 312 - Appleseed Plataforma.pdf'
    })
    expect(nombresDeContactos()).toEqual(['Appleseed'])
  })

  it('Agency quote without a map row', () => {
    pdf(root, '2022', 'DMM - 377 - Korova - Blog.pdf')
    escanearCarpetas(db, root)
    expect(contactoDe(cotizacion(377).contactoId)).toBe('Korova')
    expect(cotizacion(377).nombre).toBe('Blog')
    expect(nombresDeContactos()).toEqual(['Korova'])
  })

  it('The Contacto part is mapped too', () => {
    mapa(root, `${CABECERA}Sublime,Sublime Inspiración,,\n`)
    pdf(root, '2024', 'DMM - 401 - Sublime - Citli Tours.pdf')
    const log = escanearCarpetas(db, root)
    expect(contactoDe(cotizacion(401).contactoId)).toBe('Sublime Inspiración')
    expect(cotizacion(401).nombre).toBe('Citli Tours')
    expect(log.filasMapa).toEqual([])
  })

  it('Row overrides the split', () => {
    mapa(root, `${CABECERA}Marketing Dojo - Cursos,Marketing Dojo,Cursos online,\n`)
    pdf(root, '2021', 'DMM - 350 - Marketing Dojo - Cursos.pdf')
    escanearCarpetas(db, root)
    expect(contactoDe(cotizacion(350).contactoId)).toBe('Marketing Dojo')
    expect(cotizacion(350).nombre).toBe('Cursos online')
  })

  it('Project folder with no Clientes folder', () => {
    mapa(root, `${CABECERA}Zamora USA,Zamora Live,,\n`)
    pdf(root, '2022', 'DMM - 290 - Zamora USA.pdf')
    carpeta(root, 'Proyectos', 'Zamora Live')

    escanearCarpetas(db, root)
    expect(nombresDeContactos()).toEqual(['Zamora Live'])
    const proyecto = db.select().from(proyectos).get()!
    expect(proyecto.nombre).toBe('Zamora Live')
    expect(proyecto.contactoId).toBe(cotizacion(290).contactoId)
  })

  it('Agency quote linked to its end client’s folder', () => {
    mapa(root, `${CABECERA}Sublime - Citli Tours,Sublime,Citli Tours,Citli Tours\nCitli Tours,Sublime,,Citli Tours\n`)
    pdf(root, '2024', 'DMM - 401 - Sublime - Citli Tours.pdf')
    carpeta(root, 'Proyectos', 'Citli Tours')

    escanearCarpetas(db, root)
    expect(nombresDeContactos()).toEqual(['Sublime'])
    const [proyecto] = db.select().from(proyectos).all()
    expect(proyecto).toMatchObject({ nombre: 'Citli Tours', clienteFinal: 'Citli Tours', cotizacionId: cotizacion(401).id })
    expect(contactoDe(proyecto.contactoId)).toBe('Sublime')
    expect(db.select().from(sugerenciasImportacion).all()).toEqual([
      expect.objectContaining({ entidad: 'cotizacion', entidadId: cotizacion(401).id, accion: 'vincular', proyectoId: proyecto.id })
    ])
  })

  it('carries the quote’s Cliente final onto a linked folder that has none, until the link is rejected', () => {
    mapa(root, `${CABECERA}Sublime - Citli Tours,Sublime,Citli Tours,Citli Tours SA\nCitli Tours,Sublime,,\n`)
    pdf(root, '2024', 'DMM - 401 - Sublime - Citli Tours.pdf')
    carpeta(root, 'Proyectos', 'Citli Tours')

    escanearCarpetas(db, root)
    expect(db.select().from(proyectos).get()).toMatchObject({ nombre: 'Citli Tours', clienteFinal: 'Citli Tours SA' })
    responder(db, db.select().from(sugerenciasImportacion).get()!.id, 'rechazada', '2026-09-23')
    expect(db.select().from(proyectos).get()).toMatchObject({ cotizacionId: null, clienteFinal: null })
  })

  it('keeps the folder’s own Cliente final over the quote’s', () => {
    mapa(root, `${CABECERA}Sublime - Citli Tours,Sublime,Citli Tours,Citli Tours SA\nCitli Tours,Sublime,,Citli\n`)
    pdf(root, '2024', 'DMM - 401 - Sublime - Citli Tours.pdf')
    carpeta(root, 'Proyectos', 'Citli Tours')
    escanearCarpetas(db, root)
    expect(db.select().from(proyectos).get()).toMatchObject({ cotizacionId: cotizacion(401).id, clienteFinal: 'Citli' })
  })

  it('Accepted mapped quote with no folder', () => {
    mapa(root, `${CABECERA}Appleseed Plataforma,Appleseed,Plataforma,Appleseed Bank\n`)
    pdf(root, '2023', 'DMM - 312 - Appleseed Plataforma.pdf')
    escanearCarpetas(db, root)
    db.update(cotizaciones).set({ estado: 'aceptada' }).run()

    const log = escanearCarpetas(db, root)
    expect(log.proyectosSinCarpeta).toBe(1)
    expect(db.select().from(proyectos).get()).toMatchObject({
      nombre: 'Plataforma',
      estado: 'completado',
      clienteFinal: 'Appleseed Bank'
    })
    expect(db.select().from(sugerenciasImportacion).all().map((s) => s.accion)).toEqual(['ubicacion'])
    // ADR-0002: imported history is exempt from the lifecycle guards.
    expect(db.select().from(ingresos).all()).toHaveLength(0)
    expect(db.select().from(definicionesIngreso).all()).toHaveLength(0)
    expect(db.select().from(costos).all()).toHaveLength(0)
    expect(db.select().from(definicionesCosto).all()).toHaveLength(0)
  })

  it('names a mapped folder’s Proyecto after the row, with its Cliente final', () => {
    mapa(root, `${CABECERA}Sonrieme,Sonríeme,Sitio web,Clínica Sol\n`)
    carpeta(root, 'Proyectos', 'Sonríeme')
    escanearCarpetas(db, root)
    expect(db.select().from(proyectos).get()).toMatchObject({ nombre: 'Sitio web', clienteFinal: 'Clínica Sol' })
  })

  it('ignores a row’s Proyecto and Cliente final for a Clientes folder', () => {
    mapa(root, `${CABECERA}Audio Clinic,Audioclinic,Podcast,Radio\n`)
    carpeta(root, 'Clientes', 'Audio Clinic')
    escanearCarpetas(db, root)
    expect(nombresDeContactos()).toEqual(['Audioclinic'])
    expect(db.select().from(proyectos).all()).toHaveLength(0)
  })
})

describe('subcarpetas declaradas como Proyectos', () => {
  const dosSitios = `${CABECERA}DMM Studios/Web 2023,DMM Studios,,\nDMM Studios/Web 2027,DMM Studios,,\n`

  it('Two websites in one folder', () => {
    mapa(root, dosSitios)
    carpeta(root, 'Proyectos', 'DMM Studios', 'Multisite')
    carpeta(root, 'Proyectos', 'DMM Studios', 'Web 2023')
    carpeta(root, 'Proyectos', 'DMM Studios', 'Web 2027')

    const log = escanearCarpetas(db, root)
    expect(nombresDeContactos()).toEqual(['DMM Studios'])
    expect(db.select().from(proyectos).all().map((p) => p.nombre).sort()).toEqual(['Web 2023', 'Web 2027'])
    expect(db.select().from(ubicacionesArchivo).all().map((u) => u.rutaRelativa).sort()).toEqual([
      'Proyectos/DMM Studios/Web 2023',
      'Proyectos/DMM Studios/Web 2027'
    ])
    expect(log.subcarpetasSinProyecto).toEqual(['Proyectos/DMM Studios/Multisite'])
    expect(log.filasMapa).toEqual([])
  })

  it('Declared Proyecto moved to Archivo', () => {
    mapa(root, dosSitios)
    carpeta(root, 'Proyectos', 'DMM Studios', 'Web 2023')
    escanearCarpetas(db, root)
    carpeta(root, 'Archivo', 'Proyectos', 'DMM Studios', 'Web 2023')

    escanearCarpetas(db, root)
    expect(db.select().from(proyectos).all()).toHaveLength(1)
    expect(db.select().from(ubicacionesArchivo).all().map((u) => u.rutaRelativa).sort()).toEqual([
      'Archivo/Proyectos/DMM Studios/Web 2023',
      'Proyectos/DMM Studios/Web 2023'
    ])
  })

  it('lists an undeclared subfolder on the HDD as such', () => {
    mapa(root, dosSitios)
    carpeta(hdd, 'Proyectos', 'DMM Studios', 'Multisite')
    expect(escanearCarpetas(db, root, hdd).subcarpetasSinProyecto).toEqual(['Proyectos/DMM Studios/Multisite (HDD externo)'])
  })
})

describe('el log del Mapa de nombres', () => {
  it('Typo in a key', () => {
    mapa(root, `${CABECERA}Appleseed Plataformma,Appleseed,Plataforma,\n`)
    pdf(root, '2023', 'DMM - 312 - Appleseed Plataforma.pdf')
    const log = escanearCarpetas(db, root)
    expect(log.filasMapa).toEqual([{ linea: 2, problema: 'sin uso', enDisco: 'Appleseed Plataformma' }])
    expect(nombresDeContactos()).toEqual(['Appleseed Plataforma'])
  })

  it('Duplicate key', () => {
    mapa(root, `${CABECERA}a,a,,\nb,b,,\nFrida,Frida,,\nc,c,,\nd,d,,\ne,e,,\nf,f,,\nFrida,Frida Communication,,\n`)
    pdf(root, '2020', 'DMM - 150 - Frida.pdf')
    const log = escanearCarpetas(db, root)
    expect(log.filasMapa.filter((f) => f.problema !== 'sin uso')).toEqual([{ linea: 9, problema: 'duplicada', enDisco: 'Frida' }])
    expect(contactoDe(cotizacion(150).contactoId)).toBe('Frida')
  })

  it('reports an incomplete row and goes on', () => {
    mapa(root, `${CABECERA}Versa,,,\n`)
    pdf(root, '2017', 'DMM - 134 - Versa.pdf')
    const log = escanearCarpetas(db, root)
    expect(log.filasMapa).toEqual([{ linea: 2, problema: 'incompleta', enDisco: 'Versa' }])
    expect(log.cotizaciones.importadas).toBe(1)
  })

  it('names what it created, tagged with where each came from', () => {
    mapa(root, `${CABECERA}Sonrieme Web,Sonríeme,Web,\n`)
    carpeta(root, 'Clientes', 'Estudio Ocho')
    carpeta(root, 'Proyectos', 'Clicme')
    pdf(root, '2019', 'DMM - 201 - Sonrieme Web.pdf')
    pdf(root, '2019', 'DMM - 202 - Versa.pdf')
    carpeta(root, 'Clientes', 'Sonrieme')

    const log = escanearCarpetas(db, root)
    expect(log.nuevos.contactos).toEqual([
      { nombre: 'Sonríeme', origen: 'cotizacion' },
      { nombre: 'Versa', origen: 'cotizacion' },
      { nombre: 'Estudio Ocho', origen: 'clientes' },
      { nombre: 'Clicme', origen: 'proyectos' }
    ])
    expect(log.nuevos.proyectos).toEqual([{ nombre: 'Clicme', contacto: 'Clicme', origen: 'proyectos' }])
    expect(log.contactos.creados).toBe(4)
  })

  it('reports nothing new on a second run', () => {
    carpeta(root, 'Proyectos', 'Clicme')
    escanearCarpetas(db, root)
    expect(escanearCarpetas(db, root).nuevos).toEqual({ contactos: [], proyectos: [], rfcs: [] })
  })
})

describe('el mapa aplica solo al importar por primera vez', () => {
  it('Map edited after the real scan', () => {
    pdf(root, '2020', 'DMM - 150 - Frida Comunicacion.pdf')
    escanearCarpetas(db, root)
    mapa(root, `${CABECERA}Frida Comunicacion,Frida,,\n`)

    const log = escanearCarpetas(db, root)
    expect(contactoDe(cotizacion(150).contactoId)).toBe('Frida Comunicacion')
    expect(log.cotizaciones).toEqual({ importadas: 0, duplicadas: 1 })
    expect(nombresDeContactos()).toEqual(['Frida Comunicacion'])
    expect(log.filasMapa).toEqual([])
  })

  it('keeps a Clientes folder on the Contacto it was imported as', () => {
    carpeta(root, 'Clientes', 'Frida Comunicacion')
    escanearCarpetas(db, root)
    mapa(root, `${CABECERA}Frida Comunicacion,Frida,,\n`)

    const log = escanearCarpetas(db, root)
    expect(nombresDeContactos()).toEqual(['Frida Comunicacion'])
    expect(log.nuevos.contactos).toEqual([])
    expect(log.filasMapa).toEqual([])
  })

  it('records a Proyecto folder found in a new place on the Proyecto it was imported as', () => {
    carpeta(root, 'Proyectos', 'Frida Comunicacion')
    escanearCarpetas(db, root)
    mapa(root, `${CABECERA}Frida Comunicacion,Frida,Sitio,\n`)
    carpeta(hdd, 'Proyectos', 'Frida Comunicacion')

    const log = escanearCarpetas(db, root, hdd)
    expect(nombresDeContactos()).toEqual(['Frida Comunicacion'])
    expect(db.select().from(proyectos).all().map((p) => p.nombre)).toEqual(['Frida Comunicacion'])
    expect(db.select().from(ubicacionesArchivo).all().map((u) => u.tipo).sort()).toEqual(['hdd_externo', 'proyectos'])
    expect(log.nuevos).toEqual({ contactos: [], proyectos: [], rfcs: [] })
  })
})

describe('el RFC desde el mapa', () => {
  const rfcDe = (nombre: string) => db.select().from(contactos).all().find((c) => c.nombre === nombre)?.rfc

  it('Contacto known only from its invoices', () => {
    mapa(root, `${CABECERA},Umanut,,,UMA2311072G4\n`)
    const log = escanearCarpetas(db, root)
    expect(rfcDe('Umanut')).toBe('UMA2311072G4')
    expect(log.filasMapa).toEqual([])
    expect(log.nuevos.contactos).toEqual([{ nombre: 'Umanut', origen: 'mapa' }])
    expect(log.nuevos.rfcs).toEqual([{ contacto: 'Umanut', rfc: 'UMA2311072G4' }])
  })

  it('gives a found name’s Contacto its RFC, uppercased and without spaces', () => {
    mapa(root, `${CABECERA}Sublime - Citli Tours,Sublime Inspiración,Citli Tours,,sia 161024 h91\n`)
    pdf(root, '2024', 'DMM - 401 - Sublime - Citli Tours.pdf')
    escanearCarpetas(db, root)
    expect(rfcDe('Sublime Inspiración')).toBe('SIA161024H91')
  })

  it('gives nothing for a name never found', () => {
    mapa(root, `${CABECERA}Versa,Versa,,,VCO900213R94\n`)
    const log = escanearCarpetas(db, root)
    expect(db.select().from(contactos).all()).toHaveLength(0)
    expect(log.filasMapa).toEqual([{ linea: 2, problema: 'sin uso', enDisco: 'Versa' }])
  })

  it('RFC added after the real scan', () => {
    pdf(root, '2017', 'DMM - 134 - Versa.pdf')
    escanearCarpetas(db, root)
    const antes = db.select().from(contactos).get()!
    mapa(root, `${CABECERA},Versa,,,VCO900213R94\n`)

    const log = escanearCarpetas(db, root)
    expect(db.select().from(contactos).all()).toEqual([{ ...antes, rfc: 'VCO900213R94' }])
    expect(cotizacion(134).contactoId).toBe(antes.id)
    expect(log.nuevos.rfcs).toEqual([{ contacto: 'Versa', rfc: 'VCO900213R94' }])
    expect(escanearCarpetas(db, root).nuevos.rfcs).toEqual([])
  })

  it('gives an already-imported name’s RFC to the Contacto it was imported under', () => {
    pdf(root, '2017', 'DMM - 134 - Versa.pdf')
    escanearCarpetas(db, root)
    mapa(root, `${CABECERA}Versa,Versa,,,VCO900213R94\n`)
    escanearCarpetas(db, root)
    expect(rfcDe('Versa')).toBe('VCO900213R94')
  })

  it('Generic RFC', () => {
    mapa(root, `${CABECERA}Frida Communication,Frida Communication,,,XEXX010101000\n`)
    carpeta(root, 'Clientes', 'Frida Communication')
    const log = escanearCarpetas(db, root)
    expect(rfcDe('Frida Communication')).toBeNull()
    expect(log.filasMapa).toEqual([{ linea: 2, problema: 'rfc generico', enDisco: 'Frida Communication' }])
  })

  it('refuses an RFC that is not of RFC form', () => {
    mapa(root, `${CABECERA},Umanut,,,UMA-2311\n`)
    const log = escanearCarpetas(db, root)
    expect(db.select().from(contactos).all()).toHaveLength(0)
    expect(log.filasMapa).toEqual([{ linea: 2, problema: 'rfc invalido', enDisco: '' }])
  })

  it('Second RFC for one Contacto', () => {
    mapa(root, `${CABECERA},Walden Dos,,,CWD720712MX0\n,Walden Dos,,,WDO191108BY8\n`)
    const log = escanearCarpetas(db, root)
    expect(rfcDe('Walden Dos')).toBe('CWD720712MX0')
    expect(log.filasMapa).toEqual([{ linea: 3, problema: 'contacto con otro rfc', enDisco: '' }])
  })

  it('refuses an RFC another Contacto already holds', () => {
    db.insert(contactos).values({ nombre: 'Versa', rfc: 'VCO900213R94' }).run()
    mapa(root, `${CABECERA},Umanut,,,VCO900213R94\n`)
    const log = escanearCarpetas(db, root)
    expect(nombresDeContactos()).toEqual(['Versa'])
    expect(log.filasMapa).toEqual([{ linea: 2, problema: 'rfc de otro contacto', enDisco: '' }])
  })

  it('refuses an RFC another row gives a different Contacto', () => {
    mapa(root, `${CABECERA},Umanut,,,UMA2311072G4\n,Versa,,,UMA2311072G4\n`)
    const log = escanearCarpetas(db, root)
    expect(rfcDe('Umanut')).toBe('UMA2311072G4')
    expect(nombresDeContactos()).toEqual(['Umanut'])
    expect(log.filasMapa).toEqual([{ linea: 3, problema: 'rfc de otro contacto', enDisco: '' }])
  })

  it('never replaces a Contacto’s RFC', () => {
    db.insert(contactos).values({ nombre: 'Versa', rfc: 'VCO900213R94' }).run()
    mapa(root, `${CABECERA},Versa,,,VER010101AB1\n`)
    const log = escanearCarpetas(db, root)
    expect(rfcDe('Versa')).toBe('VCO900213R94')
    expect(log.filasMapa).toEqual([{ linea: 2, problema: 'contacto con otro rfc', enDisco: '' }])
  })
})

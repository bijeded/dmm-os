import { eq } from 'drizzle-orm'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { escanear, escanearCarpetas } from '.'
import { pdfDeTexto } from './pdf-prueba'
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
import { guardarContacto, listarContactos } from '../contactos'
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
    carpeta(root, 'Clientes', 'Clicme')
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

  it('does not ask again once the link was corrected to another Proyecto', () => {
    pdf(root, '2025', 'DMM - 475 - Clicme.pdf')
    carpeta(root, 'Proyectos', 'Clicme')
    escanearCarpetas(db, root)
    const cotizacion = db.select().from(cotizaciones).get()!
    const elegido = db.insert(proyectos).values({ nombre: 'Clicme Web', contactoId: cotizacion.contactoId, categoria: 'website' }).returning().get().id
    const s = db.select().from(sugerenciasImportacion).get()!
    responder(db, s.id, { elegidas: [elegido] })

    expect(escanearCarpetas(db, root).sugerencias).toBe(0)
    expect(db.select().from(sugerenciasImportacion).all()).toEqual([{ ...s, estado: 'corregida' }])
    expect(db.select().from(proyectos).where(eq(proyectos.id, elegido)).get()!.cotizacionId).toBe(cotizacion.id)
    expect(db.select().from(proyectos).where(eq(proyectos.id, s.proyectoId!)).get()!.cotizacionId).toBe(null)
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
    expect(escanearCarpetas(db, root)).toMatchObject({ sugerencias: 0, proyectos: { creados: 1 } })
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
    mapa(root, `${CABECERA}Sonrieme Web,Sonríeme,Web,\nClicme,Clicme,,\n`)
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
    expect(escanearCarpetas(db, root).nuevos).toEqual({ contactos: [], proyectos: [], rfcs: [], cotizaciones: [] })
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
    carpeta(root, 'Clientes', 'Frida Comunicacion')
    carpeta(root, 'Proyectos', 'Frida Comunicacion')
    escanearCarpetas(db, root)
    mapa(root, `${CABECERA}Frida Comunicacion,Frida,Sitio,\n`)
    carpeta(hdd, 'Proyectos', 'Frida Comunicacion')

    const log = escanearCarpetas(db, root, hdd)
    expect(nombresDeContactos()).toEqual(['Frida Comunicacion'])
    expect(db.select().from(proyectos).all().map((p) => p.nombre)).toEqual(['Frida Comunicacion'])
    expect(db.select().from(ubicacionesArchivo).all().map((u) => u.tipo).sort()).toEqual(['hdd_externo', 'proyectos'])
    expect(log.nuevos).toEqual({ contactos: [], proyectos: [], rfcs: [], cotizaciones: [] })
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

describe('lo que la Importación crea queda marcado como importado', () => {
  it('marks every Contacto, Cotización and Proyecto a scan creates', () => {
    mapa(root, `${CABECERA},Rocío Bistro,,,RBI010101AB1\n`)
    carpeta(root, 'Clientes', 'Estudio Ocho')
    carpeta(root, 'Proyectos', 'Clicme')
    carpeta(root, 'Archivo', 'Proyectos', 'Versa')
    carpeta(hdd, 'Proyectos', 'Aura')
    pdf(root, '2025', 'DMM - 475 - Clicme.pdf')
    pdf(root, '2017', 'DMM - 134 - Sublime.pdf')
    escanearCarpetas(db, root, hdd)
    // An accepted quote with no folder gets its Proyecto on the next scan.
    db.update(cotizaciones).set({ estado: 'aceptada' }).where(eq(cotizaciones.folio, 134)).run()
    escanearCarpetas(db, root, hdd)

    expect(db.select().from(proyectos).all().map((p) => p.nombre).sort()).toEqual(['Aura', 'Clicme', 'Sublime', 'Versa'])
    expect(nombresDeContactos()).toContain('Rocío Bistro')
    for (const tabla of [contactos, cotizaciones, proyectos]) {
      const filas = db.select().from(tabla).all()
      expect(filas.length).toBeGreaterThan(0)
      expect(filas.every((r) => r.importado)).toBe(true)
    }
  })

  it('leaves a Contacto made in the app hand-made when it receives an imported quote', () => {
    const id = guardarContacto(db, { nombre: 'Versa', empresa: null, email: 'hola@versa.mx', telefono: null, direccion: null, notas: null })
    pdf(root, '2017', 'DMM - 134 - Versa.pdf')
    escanearCarpetas(db, root)

    expect(cotizacion(134)).toMatchObject({ contactoId: id, importado: true })
    expect(db.select().from(contactos).all()).toEqual([expect.objectContaining({ id, importado: false })])
  })
})

/** A legacy quote whose PDF holds `lineas`, in the template's layout. */
const pdfConTexto = (anio: string, nombre: string, lineas: string[]) => {
  writeFileSync(join(carpeta(root, 'Cotizaciones', anio), nombre), pdfDeTexto(lineas))
}
const flor = [
  'Ciudad de México, 29 de octubre, 2021.',
  'presentar la siguiente información:',
  'Video “Curso” : Elaboración de video:',
  '• Guion.',
  'Costo: $ 3,000.00',
  '• No incluye IVA.',
  'Asunto:',
  'Video “Curso”.'
]

describe('una Cotización antigua desde el texto de su PDF', () => {
  it('takes its fecha, items, Monto before IVA, categoría and project name from the PDF', async () => {
    pdfConTexto('2021', 'DMM - 250 - Flor de Letras.pdf', flor)
    const log = await escanear(db, root)
    expect(cotizacion(250)).toMatchObject({
      fecha: '2021-10-29',
      items: [{ concepto: 'Video “Curso” : Elaboración de video', categoria: 'other', cantidad: 1, precio: 300000 }],
      subtotal: 300000,
      iva: 0,
      total: 300000,
      facturacion: 'unica',
      moneda: 'MXN',
      tipoCambio: null,
      categoria: 'other',
      nombre: 'Curso',
      estado: 'enviada'
    })
    expect(log.nuevos.cotizaciones).toEqual([{ folio: '250', fecha: '2021-10-29', monto: 300000, moneda: 'MXN', categoria: 'other' }])
    expect(log.cotizacionesIncompletas).toEqual([])
  })

  it("keeps the day and month of last year's date in the folder's year, and lists it", async () => {
    pdfConTexto('2022', 'DMM - 346 - Casa Linda.pdf', ['Ciudad de México, 21 de enero, 2021.', 'Sitio web: sitio:', 'Costo: $ 8,000.00'])
    const log = await escanear(db, root)
    expect(cotizacion(346).fecha).toBe('2022-01-21')
    expect(log.cotizacionesIncompletas).toEqual([{ folio: '346', archivo: 'Cotizaciones/2022/DMM - 346 - Casa Linda.pdf', falta: ['año'] }])
  })

  it('lists a quote whose PDF gives no fecha or no price, dated from its folder', async () => {
    pdfConTexto('2020', 'DMM - 260 - Sublime.pdf', ['Presupuesto', 'Sitio web: sitio:'])
    const log = await escanear(db, root)
    expect(cotizacion(260)).toMatchObject({ fecha: '2020-01-01', items: [], total: 0 })
    expect(log.cotizacionesIncompletas).toEqual([{ folio: '260', archivo: 'Cotizaciones/2020/DMM - 260 - Sublime.pdf', falta: ['fecha', 'precio'] }])
  })

  it('imports a quote whose PDF cannot be read from its name, and every other file too', async () => {
    pdf(root, '2019', 'DMM - 211 - La Z App.pdf')
    pdfConTexto('2019', 'DMM - 212 - Sublime.pdf', ['Ciudad de México, 3 de marzo, 2019.', 'Sitio web: sitio:', 'Costo: $ 1,000.00'])
    const log = await escanear(db, root)
    expect(cotizacion(211)).toMatchObject({ fecha: '2019-01-01', items: [], total: 0, categoria: 'other', nombre: 'La Z App' })
    expect(cotizacion(212).total).toBe(100000)
    expect(log.cotizaciones.importadas).toBe(2)
    expect(log.cotizacionesIncompletas).toEqual([{ folio: '211', archivo: 'Cotizaciones/2019/DMM - 211 - La Z App.pdf', falta: ['pdf'] }])
  })

  it('imports a USD quote in USD, its rate from the pesos it prints', async () => {
    pdfConTexto('2019', 'DMM - 207 - Noticias Zero.pdf', ['Ciudad de México, 7 de enero, 2019.', 'Sitio: sitio:', 'Costo especial: $ 260.00 USD ($5,000.00 MXN)'])
    await escanear(db, root)
    expect(cotizacion(207)).toMatchObject({ moneda: 'USD', tipoCambio: 19.2308, subtotal: 26000, iva: 0, total: 26000 })
  })

  it('bills a quote with only recurring prices monthly', async () => {
    pdfConTexto('2021', 'DMM - 300 - Zamora USA.pdf', ['Ciudad de México, 3 de marzo, 2021.', 'Webmaster: soporte:', 'Costo: $ 2,000.00 mensuales'])
    await escanear(db, root)
    expect(cotizacion(300)).toMatchObject({ facturacion: 'mensual', total: 200000, items: [expect.objectContaining({ recurrente: true })] })
  })

  it('leaves a Cotización already imported as it is, even after it was edited', async () => {
    pdfConTexto('2021', 'DMM - 250 - Flor de Letras.pdf', flor)
    await escanear(db, root)
    db.update(cotizaciones).set({ total: 999, fecha: '2021-12-01' }).where(eq(cotizaciones.folio, 250)).run()
    const log = await escanear(db, root)
    expect(cotizacion(250)).toMatchObject({ total: 999, fecha: '2021-12-01' })
    expect(log.cotizaciones).toEqual({ importadas: 0, duplicadas: 1 })
    expect(log.nuevos.cotizaciones).toEqual([])
  })
})

describe('el Proyecto que nombra el PDF', () => {
  it('links the older of two quotes naming the same project to its folder', async () => {
    mapa(root, `${CABECERA}3 Moon Wishes,Sublime,,\n`)
    pdfConTexto('2021', 'DMM - 308 - Sublime.pdf', ['Ciudad de México, 3 de marzo, 2021.', 'eCommerce “3 Moon Wishes” : tienda en línea:', 'Costo: $ 30,000.00'])
    pdfConTexto('2021', 'DMM - 320 - Sublime.pdf', ['Ciudad de México, 3 de mayo, 2021.', 'Landing page “3 Moon Wishes” : landing:', 'Costo: $ 9,000.00'])
    carpeta(root, 'Proyectos', '3 Moon Wishes')
    await escanear(db, root)

    const moon = db.select().from(proyectos).where(eq(proyectos.nombre, '3 Moon Wishes')).get()!
    expect(moon.cotizacionId).toBe(cotizacion(308).id)
    expect(cotizacion(308)).toMatchObject({ estado: 'aceptada', nombre: '3 Moon Wishes', categoria: 'ecommerce' })
    expect(cotizacion(320)).toMatchObject({ estado: 'enviada', nombre: '3 Moon Wishes' })
    expect(db.select().from(sugerenciasImportacion).where(eq(sugerenciasImportacion.accion, 'vincular')).all()).toEqual([
      expect.objectContaining({ entidadId: cotizacion(308).id, proyectoId: moon.id })
    ])
  })

  it("lets a map row's proyecto win over the quoted name", async () => {
    mapa(root, `${CABECERA}Appleseed Plataforma,Appleseed,Plataforma,\n`)
    pdfConTexto('2023', 'DMM - 312 - Appleseed Plataforma.pdf', ['Web App “Reservas Appleseed”: app:', 'Costo: $ 1,000.00'])
    await escanear(db, root)
    expect(cotizacion(312).nombre).toBe('Plataforma')
  })

  it('takes the quoted name over the Cliente - Proyecto split, the Contacto still from the split', async () => {
    pdfConTexto('2023', 'DMM - 377 - Korova - Blog.pdf', ['Sitio web “Blog Korova”: sitio:', 'Costo: $ 1,000.00'])
    await escanear(db, root)
    expect(cotizacion(377).nombre).toBe('Blog Korova')
    expect(nombresDeContactos()).toEqual(['Korova'])
  })

  it('keeps the split when the PDF quotes no name', async () => {
    pdfConTexto('2023', 'DMM - 377 - Korova - Blog.pdf', ['Sitio web: sitio:', 'Costo: $ 1,000.00'])
    await escanear(db, root)
    expect(cotizacion(377).nombre).toBe('Blog')
  })

  it('links a quoted name holding " y " to the folder of that whole name', async () => {
    mapa(root, `${CABECERA}Diseño y Desarrollo,Sublime,,\n`)
    pdfConTexto('2021', 'DMM - 330 - Sublime.pdf', ['Sitio web “Diseño y Desarrollo”: sitio:', 'Costo: $ 1,000.00'])
    carpeta(root, 'Proyectos', 'Diseño y Desarrollo')
    await escanear(db, root)
    const p = db.select().from(proyectos).where(eq(proyectos.nombre, 'Diseño y Desarrollo')).get()!
    expect(p).toMatchObject({ cotizacionId: cotizacion(330).id, notas: null })
  })
})

describe('¿Qué aceptó? al aceptar una Cotización con varios precios', () => {
  const entregada = async (precios: string[]) => {
    pdfConTexto('2021', 'DMM - 308 - Sublime.pdf', ['Ciudad de México, 3 de marzo, 2021.', ...precios.flatMap((p, i) => [`Servicio ${i + 1}: parte:`, p])])
    carpeta(root, 'Proyectos', 'Sublime')
    return escanear(db, root)
  }
  const preguntas = () => db.select().from(sugerenciasImportacion).where(eq(sugerenciasImportacion.accion, 'partidas')).all()

  it('asks it when the accepted quote has two prices, and counts it in the log', async () => {
    const log = await entregada(['Costo: $ 10,000.00', 'Costo: $ 4,000.00'])
    expect(preguntas()).toEqual([
      expect.objectContaining({ entidad: 'cotizacion', entidadId: cotizacion(308).id, estado: 'pendiente', proyectoId: null, contactoId: null })
    ])
    expect(log.sugerencias).toBe(2)
  })

  it('does not ask it for one price', async () => {
    await entregada(['Costo: $ 3,000.00'])
    expect(cotizacion(308)).toMatchObject({ estado: 'aceptada', total: 300000 })
    expect(preguntas()).toEqual([])
  })

  it('does not ask it for one one-off price with a recurring one', async () => {
    await entregada(['Costo: $ 10,000.00', 'Costo: $ 2,000.00 mensuales'])
    expect(preguntas()).toEqual([])
  })

  it('does not ask it twice on a second scan', async () => {
    await entregada(['Costo: $ 10,000.00', 'Costo: $ 4,000.00'])
    await escanear(db, root)
    expect(preguntas()).toHaveLength(1)
  })

  it('does not ask it for a quote made in the app, whose Monto is its own', async () => {
    const sublime = db.insert(contactos).values({ nombre: 'Sublime' }).returning().get()
    const partida = (concepto: string, precio: number) => ({ concepto, categoria: 'website' as const, cantidad: 1, precio })
    db.insert(cotizaciones)
      .values({ folio: 530, contactoId: sublime.id, nombre: 'Sublime', categoria: 'website', estado: 'enviada', fecha: '2026-01-10', items: [partida('Sitio', 100000), partida('Logo', 50000)], subtotal: 150000, iva: 24000, total: 174000 })
      .run()
    carpeta(root, 'Proyectos', 'Sublime')
    await escanear(db, root)
    expect(cotizacion(530)).toMatchObject({ estado: 'aceptada', iva: 24000, total: 174000 })
    expect(preguntas()).toEqual([])
  })

  it('does not ask it for a quote no folder delivers', async () => {
    pdfConTexto('2021', 'DMM - 308 - Sublime.pdf', ['Servicio: a:', 'Costo: $ 10,000.00', 'Servicio: b:', 'Costo: $ 4,000.00'])
    await escanear(db, root)
    expect(preguntas()).toEqual([])
  })
})

describe('la carpeta de Proyecto se atribuye por la Cotización que la nombra', () => {
  const proyecto = (nombre: string) => db.select().from(proyectos).all().find((p) => p.nombre === nombre)!
  const vincular = () => db.select().from(sugerenciasImportacion).where(eq(sugerenciasImportacion.accion, 'vincular')).all()
  const sublime = () => {
    mapa(root, `${CABECERA}Sublime,Sublime Inspiración,,\n`)
    pdfConTexto('2021', 'DMM - 308 - Sublime.pdf', ['Ciudad de México, 10 de marzo, 2021.', 'eCommerce “3 Moon Wishes” : tienda en línea:', 'Costo: $ 30,000.00'])
    pdfConTexto('2021', 'DMM - 320 - Sublime.pdf', ['Ciudad de México, 3 de mayo, 2021.', 'Landing page “3 Moon Wishes” : landing:', 'Costo: $ 9,000.00'])
  }

  it('Agency project folder: the Proyecto goes to the Contacto whose quotes name it', async () => {
    sublime()
    carpeta(root, 'Proyectos', '3 Moon Wishes')
    await escanear(db, root)

    const moon = proyecto('3 Moon Wishes')
    expect(contactoDe(moon.contactoId)).toBe('Sublime Inspiración')
    expect(moon).toMatchObject({ clienteFinal: '3 Moon Wishes', estado: 'en_curso', cotizacionId: cotizacion(308).id })
    expect(vincular()).toEqual([expect.objectContaining({ entidadId: cotizacion(308).id, proyectoId: moon.id })])
    expect(cotizacion(320).estado).toBe('enviada')
    expect(nombresDeContactos()).toEqual(['Sublime Inspiración'])
  })

  it('takes the categoría and fecha de inicio of the linked Cotización, and no fecha de fin or entrega', async () => {
    sublime()
    carpeta(root, 'Proyectos', '3 Moon Wishes')
    await escanear(db, root)
    expect(proyecto('3 Moon Wishes')).toMatchObject({ categoria: 'ecommerce', fechaInicio: '2021-03-10', fechaFin: null, fechaEntrega: null })
  })

  it('creates no Ingreso or Costo for the Cotización the link accepts', async () => {
    sublime()
    carpeta(root, 'Proyectos', '3 Moon Wishes')
    await escanear(db, root)
    expect(cotizacion(308).estado).toBe('aceptada')
    expect(db.select().from(ingresos).all()).toEqual([])
    expect(db.select().from(costos).all()).toEqual([])
  })

  it("counts the Proyecto in the Contacto's Estado de Contacto", async () => {
    sublime()
    await escanear(db, root)
    const estado = () => listarContactos(db).contactos.find((c) => c.nombre === 'Sublime Inspiración')?.estado
    expect(estado()).toBe('lead_caliente')
    carpeta(root, 'Proyectos', '3 Moon Wishes')
    await escanear(db, root)
    expect(estado()).toBe('cliente_activo')
  })

  it("gives the map's Cliente final for the quote over the folder's name, and completes an archived folder", () => {
    mapa(root, `${CABECERA}Lukka - Ruba,Lukka,Ruba,Ruba Café\n`)
    pdf(root, '2022', 'DMM - 330 - Lukka - Ruba.pdf')
    carpeta(root, 'Archivo', 'Proyectos', 'Ruba')
    escanearCarpetas(db, root)

    const ruba = proyecto('Ruba')
    expect(contactoDe(ruba.contactoId)).toBe('Lukka')
    expect(ruba).toMatchObject({ clienteFinal: 'Ruba Café', estado: 'completado' })
  })

  it('attributes a folder through the Cliente - Proyecto split of a quote', () => {
    pdf(root, '2022', 'DMM - 331 - Lukka - Tingo.pdf')
    carpeta(root, 'Proyectos', 'Tingo')
    escanearCarpetas(db, root)
    expect(contactoDe(proyecto('Tingo').contactoId)).toBe('Lukka')
    expect(proyecto('Tingo').clienteFinal).toBe('Tingo')
  })

  it('keeps one Proyecto for the same folder in two roots', async () => {
    sublime()
    carpeta(root, 'Proyectos', '3 Moon Wishes')
    carpeta(hdd, 'Proyectos', '3 Moon Wishes')
    await escanear(db, root, hdd)

    expect(db.select().from(proyectos).all()).toHaveLength(1)
    expect(db.select().from(ubicacionesArchivo).where(eq(ubicacionesArchivo.proyectoId, proyecto('3 Moon Wishes').id)).all()).toHaveLength(2)
  })

  it('lets a map row win over a Contacto of the folder name and over a quote naming it', () => {
    mapa(root, `${CABECERA}AVC Noticias,Frida,,\n`)
    carpeta(root, 'Clientes', 'AVC Noticias')
    pdf(root, '2022', 'DMM - 332 - Sublime - AVC Noticias.pdf')
    carpeta(root, 'Proyectos', 'AVC Noticias')
    escanearCarpetas(db, root)
    expect(contactoDe(proyecto('AVC Noticias').contactoId)).toBe('Frida')
  })

  it('matches the Contacto from a Clientes folder of the same name', () => {
    carpeta(root, 'Clientes', 'AVC Noticias')
    carpeta(root, 'Proyectos', 'AVC Noticias')
    escanearCarpetas(db, root)
    expect(contactoDe(proyecto('AVC Noticias').contactoId)).toBe('AVC Noticias')
    expect(nombresDeContactos()).toEqual(['AVC Noticias'])
  })

  it('prefers an existing Contacto of the folder name over another Contacto quoting it', () => {
    carpeta(root, 'Clientes', 'AVC Noticias')
    pdf(root, '2022', 'DMM - 332 - Sublime - AVC Noticias.pdf')
    carpeta(root, 'Proyectos', 'AVC Noticias')
    escanearCarpetas(db, root)
    expect(contactoDe(proyecto('AVC Noticias').contactoId)).toBe('AVC Noticias')
  })

  it('creates no Contacto and no fusionar for a folder merely close to a Contacto', () => {
    carpeta(root, 'Clientes', 'Avansa')
    carpeta(root, 'Proyectos', 'Avanza')
    escanearCarpetas(db, root)
    expect(nombresDeContactos()).toEqual(['Avansa'])
    expect(db.select().from(sugerenciasImportacion).where(eq(sugerenciasImportacion.accion, 'fusionar')).all()).toEqual([])
  })

  it('keeps a quote-only lead a Contacto', () => {
    pdf(root, '2020', 'DMM - 280 - Alisha.pdf')
    escanearCarpetas(db, root)
    expect(nombresDeContactos()).toEqual(['Alisha'])
    expect(contactoDe(cotizacion(280).contactoId)).toBe('Alisha')
  })

  it('leaves a folder imported under its own name before this change where it was', () => {
    const [previo] = db.insert(contactos).values({ nombre: '3 Moon Wishes', importado: true }).returning().all()
    const [p] = db.insert(proyectos).values({ nombre: '3 Moon Wishes', contactoId: previo.id, categoria: 'other', importado: true }).returning().all()
    db.insert(ubicacionesArchivo).values({ proyectoId: p.id, tipo: 'proyectos', rutaRelativa: 'Proyectos/3 Moon Wishes', disponible: true }).run()
    pdf(root, '2021', 'DMM - 308 - Sublime - 3 Moon Wishes.pdf')
    carpeta(root, 'Proyectos', '3 Moon Wishes')
    carpeta(hdd, 'Proyectos', '3 Moon Wishes')

    const log = escanearCarpetas(db, root, hdd)
    expect(contactoDe(proyecto('3 Moon Wishes').contactoId)).toBe('3 Moon Wishes')
    expect(db.select().from(proyectos).all()).toHaveLength(1)
    expect(log.proyectos).toEqual({ creados: 0, actualizados: 2 })
  })
})

describe('Proyecto sin Contacto', () => {
  const proyecto = (nombre: string) => db.select().from(proyectos).all().find((p) => p.nombre === nombre)!

  it('imports a folder nothing names with no Contacto, and lists it', () => {
    carpeta(root, 'Proyectos', 'Activista')
    const log = escanearCarpetas(db, root)

    expect(proyecto('Activista')).toMatchObject({ contactoId: null, etiqueta: 'cliente', estado: 'en_curso', importado: true })
    expect(db.select().from(ubicacionesArchivo).get()?.rutaRelativa).toBe('Proyectos/Activista')
    expect(nombresDeContactos()).toEqual([])
    expect(db.select().from(sugerenciasImportacion).all()).toEqual([])
    expect(log.proyectosSinContacto).toEqual([{ nombre: 'Activista', ruta: 'Proyectos/Activista', contactos: [] }])
    expect(log.nuevos.proyectos).toEqual([{ nombre: 'Activista', contacto: '', origen: 'proyectos' }])
  })

  it('leaves a project quoted by several Contactos without one, naming them', () => {
    pdf(root, '2022', 'DMM - 331 - Lukka - Tingo.pdf')
    pdf(root, '2023', 'DMM - 402 - Sublime - Tingo.pdf')
    carpeta(root, 'Proyectos', 'Tingo')
    const log = escanearCarpetas(db, root)

    expect(proyecto('Tingo')).toMatchObject({ contactoId: null, cotizacionId: null })
    expect(db.select().from(cotizaciones).all().map((c) => c.estado)).toEqual(['enviada', 'enviada'])
    expect(log.proyectosSinContacto).toEqual([{ nombre: 'Tingo', ruta: 'Proyectos/Tingo', contactos: ['Lukka', 'Sublime'] }])
  })

  it('completes an archived folder with no Contacto', () => {
    carpeta(root, 'Archivo', 'Proyectos', 'Art Insights')
    escanearCarpetas(db, root)
    expect(proyecto('Art Insights')).toMatchObject({ contactoId: null, estado: 'completado' })
  })

  it('keeps one Proyecto sin Contacto for the same folder in two roots, and lists it once', () => {
    carpeta(root, 'Proyectos', 'Activista')
    carpeta(hdd, 'Proyectos', 'Activista')
    const log = escanearCarpetas(db, root, hdd)

    expect(db.select().from(proyectos).all()).toHaveLength(1)
    expect(db.select().from(ubicacionesArchivo).all()).toHaveLength(2)
    expect(log.proyectosSinContacto).toHaveLength(1)
  })

  it('finds it again from another root after a map row is added, the map applying on first import only', () => {
    carpeta(root, 'Proyectos', 'Activista')
    escanearCarpetas(db, root)
    mapa(root, `${CABECERA}Activista,Frida,,\n`)
    carpeta(hdd, 'Proyectos', 'Activista')
    escanearCarpetas(db, root, hdd)

    expect(db.select().from(proyectos).all()).toHaveLength(1)
    expect(proyecto('Activista').contactoId).toBeNull()
  })

  it('never reuses a personal Proyecto of the same name', () => {
    db.insert(proyectos).values({ nombre: 'Portafolio', etiqueta: 'personal', categoria: 'other' }).run()
    carpeta(root, 'Proyectos', 'Portafolio')
    escanearCarpetas(db, root)
    expect(db.select().from(proyectos).all().map((p) => p.etiqueta).sort()).toEqual(['cliente', 'personal'])
  })

  it('keeps a Contacto assigned by hand on the next scan', () => {
    carpeta(root, 'Proyectos', 'Activista')
    escanearCarpetas(db, root)
    const [frida] = db.insert(contactos).values({ nombre: 'Frida' }).returning().all()
    db.update(proyectos).set({ contactoId: frida.id }).run()

    const log = escanearCarpetas(db, root)
    expect(contactoDe(proyecto('Activista').contactoId)).toBe('Frida')
    expect(log.proyectosSinContacto).toEqual([])
  })

  it('reports nothing new on a second run', () => {
    carpeta(root, 'Proyectos', 'Activista')
    escanearCarpetas(db, root)
    expect(escanearCarpetas(db, root).proyectosSinContacto).toEqual([])
  })

  it('still refuses a new-format quote naming a Proyecto sin Contacto', () => {
    carpeta(root, 'Proyectos', 'Activista')
    pdf(root, '2026', '260114-DMM520-Activista.pdf')
    const log = escanearCarpetas(db, root)
    expect(log.errores).toEqual([{ archivo: 'Cotizaciones/2026/260114-DMM520-Activista.pdf', error: expect.stringContaining('Activista') }])
  })
})

describe('el Proyecto toma categoría y fecha de inicio de su Cotización', () => {
  it('Accepted quote with no folder', async () => {
    pdfConTexto('2019', 'DMM - 250 - Versa.pdf', ['Ciudad de México, 3 de junio, 2019.', 'Sitio web “Versa”: sitio:', 'Costo: $ 1,000.00'])
    await escanear(db, root)
    db.update(cotizaciones).set({ estado: 'aceptada' }).run()
    await escanear(db, root)
    expect(db.select().from(proyectos).get()).toMatchObject({ fechaInicio: '2019-06-03', categoria: 'website', fechaFin: null })
  })
})

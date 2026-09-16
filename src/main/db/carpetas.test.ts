import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  importarCarpetaProyecto,
  importarCotizacion,
  proyectosDeCotizacionesAceptadas,
  resolverContacto
} from './carpetas'
import { contactos, cotizaciones, proyectos, sugerenciasImportacion, ubicacionesArchivo } from './schema'
import { db, reiniciarDb } from './test-db'

beforeEach(reiniciarDb)

const cotizacion = (over: Partial<Parameters<typeof importarCotizacion>[1]> = {}) =>
  importarCotizacion(db, {
    folio: 475,
    sufijo: null,
    nombre: 'Sonrieme',
    fecha: null,
    anio: 2025,
    rutaRelativa: 'Cotizaciones/2025/DMM - 475 - Sonrieme.pdf',
    ...over
  })

describe('resolver el Contacto por nombre canónico', () => {
  it('creates the Contacto the first time the name is seen', () => {
    const r = resolverContacto(db, 'Sonríeme')
    expect(r.creado).toBe(true)
    expect(db.select().from(contactos).get()!.nombre).toBe('Sonríeme')
  })

  it('matches an existing Contacto through missing accents', () => {
    const primero = resolverContacto(db, 'Sonríeme')
    const segundo = resolverContacto(db, 'Sonrieme')
    expect(segundo.contactoId).toBe(primero.contactoId)
    expect(segundo.creado).toBe(false)
    expect(db.select().from(contactos).all()).toHaveLength(1)
  })

  it('upgrades the stored name to the better-written spelling', () => {
    resolverContacto(db, 'Sonrieme')
    resolverContacto(db, 'Sonríeme')
    expect(db.select().from(contactos).get()!.nombre).toBe('Sonríeme')
  })

  it('leaves a near-duplicate as its own Contacto and suggests the merge', () => {
    const sublime = resolverContacto(db, 'Sublime')
    const largo = resolverContacto(db, 'Sublime Inspiración')
    expect(largo.contactoId).not.toBe(sublime.contactoId)
    expect(db.select().from(contactos).all()).toHaveLength(2)

    const s = db.select().from(sugerenciasImportacion).get()!
    expect(s).toMatchObject({
      entidad: 'contacto',
      entidadId: largo.contactoId,
      accion: 'fusionar',
      contactoId: sublime.contactoId,
      estado: 'pendiente'
    })
  })

  it('suggests a merge only once, however often the importer runs', () => {
    resolverContacto(db, 'Sublime')
    resolverContacto(db, 'Sublime Inspiración')
    resolverContacto(db, 'Sublime Inspiración')
    expect(db.select().from(sugerenciasImportacion).all()).toHaveLength(1)
  })
})

describe('importar una Cotización desde su PDF', () => {
  it('records it as enviada, with its Folio, its Contacto and its PDF', () => {
    const r = cotizacion()
    expect(r.resultado).toBe('importado')
    expect(db.select().from(cotizaciones).get()).toMatchObject({
      folio: 475,
      folioSufijo: '',
      estado: 'enviada',
      pdfRutaRelativa: 'Cotizaciones/2025/DMM - 475 - Sonrieme.pdf'
    })
  })

  it('dates it from the filename when the new format carries a date', () => {
    cotizacion({ fecha: '2026-01-14' })
    expect(db.select().from(cotizaciones).get()!.fecha).toBe('2026-01-14')
  })

  it('falls back to the first day of the folder year', () => {
    cotizacion()
    expect(db.select().from(cotizaciones).get()!.fecha).toBe('2025-01-01')
  })

  it('changes nothing when the same Folio is imported again', () => {
    cotizacion()
    const otra = cotizacion({ rutaRelativa: 'Cotizaciones/2025/copia.pdf' })
    expect(otra.resultado).toBe('duplicado')
    expect(db.select().from(cotizaciones).all()).toHaveLength(1)
  })

  it('tells two quotes sharing a Folio apart by their letter', () => {
    cotizacion({ sufijo: 'a' })
    cotizacion({ sufijo: 'b' })
    expect(db.select().from(cotizaciones).all().map((c) => c.folioSufijo)).toEqual(['a', 'b'])
  })
})

describe('importar la carpeta de un Proyecto', () => {
  it('creates an En curso Proyecto for a folder under Proyectos/', () => {
    const r = importarCarpetaProyecto(db, { nombre: 'Clicme', tipo: 'proyectos', rutaRelativa: 'Proyectos/Clicme' })
    expect(db.select().from(proyectos).get()).toMatchObject({ nombre: 'Clicme', estado: 'en_curso' })
    expect(db.select().from(ubicacionesArchivo).get()).toMatchObject({
      proyectoId: r.proyectoId,
      tipo: 'proyectos',
      rutaRelativa: 'Proyectos/Clicme',
      disponible: true
    })
  })

  it('marks a folder found only in Archivo/ as a completed Proyecto', () => {
    importarCarpetaProyecto(db, { nombre: 'Versa', tipo: 'archivo', rutaRelativa: 'Archivo/Proyectos/Versa' })
    expect(db.select().from(proyectos).get()!.estado).toBe('completado')
  })

  it('records the external HDD as a second location for the same Proyecto', () => {
    const a = importarCarpetaProyecto(db, { nombre: 'Clicme', tipo: 'proyectos', rutaRelativa: 'Proyectos/Clicme' })
    const b = importarCarpetaProyecto(db, { nombre: 'Clicme', tipo: 'hdd_externo', rutaRelativa: 'Proyectos/Clicme' })
    expect(b.proyectoId).toBe(a.proyectoId)
    expect(db.select().from(proyectos).all()).toHaveLength(1)
    expect(db.select().from(ubicacionesArchivo).all().map((u) => u.tipo).sort()).toEqual([
      'hdd_externo',
      'proyectos'
    ])
  })

  it('is one Proyecto when the two roots spell its folder differently', () => {
    const a = importarCarpetaProyecto(db, { nombre: 'Sonríeme', tipo: 'proyectos', rutaRelativa: 'Proyectos/Sonríeme' })
    const b = importarCarpetaProyecto(db, { nombre: 'Sonrieme', tipo: 'hdd_externo', rutaRelativa: 'Proyectos/Sonrieme' })
    expect(b.proyectoId).toBe(a.proyectoId)
    expect(db.select().from(proyectos).all()).toHaveLength(1)
  })

  it('changes nothing when the same folder is scanned again', () => {
    importarCarpetaProyecto(db, { nombre: 'Clicme', tipo: 'proyectos', rutaRelativa: 'Proyectos/Clicme' })
    const otra = importarCarpetaProyecto(db, { nombre: 'Clicme', tipo: 'proyectos', rutaRelativa: 'Proyectos/Clicme' })
    expect(otra.creado).toBe(false)
    expect(db.select().from(ubicacionesArchivo).all()).toHaveLength(1)
  })

  it('accepts the Cotización whose name matches, and suggests the link', () => {
    const c = cotizacion({ nombre: 'Clicme' })
    const r = importarCarpetaProyecto(db, { nombre: 'Clicme', tipo: 'proyectos', rutaRelativa: 'Proyectos/Clicme' })

    expect(db.select().from(cotizaciones).get()!.estado).toBe('aceptada')
    expect(db.select().from(proyectos).get()!.cotizacionId).toBe(c.cotizacionId)
    expect(db.select().from(sugerenciasImportacion).get()).toMatchObject({
      entidad: 'cotizacion',
      entidadId: c.cotizacionId,
      accion: 'vincular',
      proyectoId: r.proyectoId
    })
  })

  it('keeps the extra names of a legacy multi-project quote in the notes', () => {
    cotizacion({ nombre: 'Clicme + Branding' })
    importarCarpetaProyecto(db, { nombre: 'Clicme', tipo: 'proyectos', rutaRelativa: 'Proyectos/Clicme' })
    expect(db.select().from(proyectos).get()!.notas).toContain('Branding')
  })

  it('links one Proyecto only, leaving a second matching quote alone', () => {
    cotizacion({ folio: 1, nombre: 'Clicme' })
    cotizacion({ folio: 2, nombre: 'Clicme' })
    importarCarpetaProyecto(db, { nombre: 'Clicme', tipo: 'proyectos', rutaRelativa: 'Proyectos/Clicme' })
    expect(db.select().from(cotizaciones).all().filter((c) => c.estado === 'aceptada')).toHaveLength(1)
  })
})

describe('cotización aceptada sin carpeta', () => {
  const aceptada = () => {
    const c = cotizacion({ nombre: 'Versa' })
    db.update(cotizaciones).set({ estado: 'aceptada' }).where(eq(cotizaciones.id, c.cotizacionId!)).run()
    return c
  }

  it('creates a completed Proyecto and asks once whether it is Archivado or No disponible', () => {
    const c = aceptada()
    const creados = proyectosDeCotizacionesAceptadas(db)
    expect(creados).toHaveLength(1)

    const p = db.select().from(proyectos).get()!
    expect(p).toMatchObject({ nombre: 'Versa', estado: 'completado', cotizacionId: c.cotizacionId })
    expect(db.select().from(sugerenciasImportacion).get()).toMatchObject({
      entidad: 'proyecto',
      entidadId: p.id,
      accion: 'ubicacion',
      proyectoId: null,
      contactoId: null
    })
  })

  it('asks only once, however often the importer runs', () => {
    aceptada()
    proyectosDeCotizacionesAceptadas(db)
    expect(proyectosDeCotizacionesAceptadas(db)).toHaveLength(0)
    expect(db.select().from(sugerenciasImportacion).all()).toHaveLength(1)
  })

  it('leaves a quote that already has its Proyecto alone', () => {
    cotizacion({ nombre: 'Clicme' })
    importarCarpetaProyecto(db, { nombre: 'Clicme', tipo: 'proyectos', rutaRelativa: 'Proyectos/Clicme' })
    expect(proyectosDeCotizacionesAceptadas(db)).toHaveLength(0)
  })
})

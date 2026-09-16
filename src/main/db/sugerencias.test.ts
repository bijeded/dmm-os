import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { importarCarpetaProyecto, importarCotizacion, proyectosDeCotizacionesAceptadas, resolverContacto } from './carpetas'
import { pendientes, responder } from './sugerencias'
import { contactos, costos, cotizaciones, ingresos, proyectos, sugerenciasImportacion, ubicacionesArchivo } from './schema'
import { db, ingresoBase, reiniciarDb } from './test-db'

beforeEach(reiniciarDb)

const cotizacionEnDisco = (nombre = 'Sonrieme', folio = 475) =>
  importarCotizacion(db, {
    folio,
    sufijo: null,
    nombre,
    fecha: null,
    anio: 2025,
    rutaRelativa: `Cotizaciones/2025/DMM - ${folio} - ${nombre}.pdf`
  })

const unaSugerencia = () => {
  const [s] = pendientes(db)
  expect(s).toBeTruthy()
  return s
}

const contacto = (nombre: string) => db.insert(contactos).values({ nombre }).returning().get()

describe('listar las sugerencias pendientes', () => {
  it('names the record and what accepting it would link to', () => {
    cotizacionEnDisco()
    importarCarpetaProyecto(db, { nombre: 'Sonrieme', tipo: 'proyectos', rutaRelativa: 'Proyectos/Sonrieme' })
    const s = unaSugerencia()
    expect(s.accion).toBe('vincular')
    expect(s.registro).toContain('475')
    expect(s.destino).toContain('Sonrieme')
    expect(s.motivo).toBeTruthy()
  })

  it('leaves out the ones already answered', () => {
    cotizacionEnDisco()
    importarCarpetaProyecto(db, { nombre: 'Sonrieme', tipo: 'proyectos', rutaRelativa: 'Proyectos/Sonrieme' })
    responder(db, unaSugerencia().id, 'aceptada')
    expect(pendientes(db)).toHaveLength(0)
  })
})

describe('vincular', () => {
  const ingresoAdivinado = () => {
    const c = contacto('Estudio Ocho')
    const p = db.insert(proyectos).values({ nombre: 'Hospital Jardín', contactoId: c.id, categoria: 'website' }).returning().get()
    const i = db.insert(ingresos).values({ categoria: 'sin_factura', ...ingresoBase, contactoId: c.id }).returning().get()
    db.insert(sugerenciasImportacion)
      .values({ entidad: 'ingreso', entidadId: i.id, accion: 'vincular', proyectoId: p.id, motivo: 'monto y fecha' })
      .run()
    return p.id
  }

  it('attaches an Ingreso to the guessed Proyecto when accepted', () => {
    const proyectoId = ingresoAdivinado()
    responder(db, unaSugerencia().id, 'aceptada')
    expect(db.select().from(ingresos).get()!.proyectoId).toBe(proyectoId)
  })

  it('leaves the Ingreso unlinked when rejected', () => {
    ingresoAdivinado()
    responder(db, unaSugerencia().id, 'rechazada')
    expect(db.select().from(ingresos).get()!.proyectoId).toBe(null)
  })

  it('attaches a Costo to the guessed Proyecto when accepted', () => {
    const c = contacto('Estudio Ocho')
    const p = db.insert(proyectos).values({ nombre: 'Hospital Jardín', contactoId: c.id, categoria: 'website' }).returning().get()
    const k = db
      .insert(costos)
      .values({ nombre: 'Hosting', categoria: 'unico', subtotal: 100, iva: 16, total: 116, fecha: '2026-02-01' })
      .returning()
      .get()
    db.insert(sugerenciasImportacion)
      .values({ entidad: 'costo', entidadId: k.id, accion: 'vincular', proyectoId: p.id, motivo: 'fecha' })
      .run()

    responder(db, unaSugerencia().id, 'aceptada')
    expect(db.select().from(costos).get()!.proyectoId).toBe(p.id)
  })

  it('undoes the inferred link and the inferred aceptada when a Cotización link is rejected', () => {
    const { cotizacionId } = cotizacionEnDisco()
    const { proyectoId } = importarCarpetaProyecto(db, { nombre: 'Sonrieme', tipo: 'proyectos', rutaRelativa: 'Proyectos/Sonrieme' })
    expect(db.select().from(cotizaciones).get()!.estado).toBe('aceptada')

    responder(db, unaSugerencia().id, 'rechazada')
    expect(db.select().from(cotizaciones).where(eq(cotizaciones.id, cotizacionId)).get()!.estado).toBe('enviada')
    expect(db.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()!.cotizacionId).toBe(null)
  })

  it('keeps the link when a Cotización link is accepted', () => {
    const { cotizacionId } = cotizacionEnDisco()
    const { proyectoId } = importarCarpetaProyecto(db, { nombre: 'Sonrieme', tipo: 'proyectos', rutaRelativa: 'Proyectos/Sonrieme' })
    responder(db, unaSugerencia().id, 'aceptada')
    expect(db.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()!.cotizacionId).toBe(cotizacionId)
    expect(db.select().from(cotizaciones).get()!.estado).toBe('aceptada')
  })
})

describe('fusionar', () => {
  const dosParecidos = () => {
    const original = resolverContacto(db, 'Círculo Medio')
    const duplicado = resolverContacto(db, 'Circulo Media')
    expect(duplicado.creado).toBe(true)
    return { original: original.contactoId, duplicado: duplicado.contactoId }
  }

  it('moves everything to the Contacto it resembles and keeps the Nombre canónico', () => {
    const { original, duplicado } = dosParecidos()
    const cot = db
      .insert(cotizaciones)
      .values({ contactoId: duplicado, folio: 9, categoria: 'other', estado: 'enviada', fecha: '2026-01-01' })
      .returning()
      .get()
    const p = db.insert(proyectos).values({ nombre: 'Sitio', contactoId: duplicado, categoria: 'other' }).returning().get()
    const i = db.insert(ingresos).values({ categoria: 'sin_factura', ...ingresoBase, contactoId: duplicado }).returning().get()

    responder(db, unaSugerencia().id, 'aceptada')

    expect(db.select().from(contactos).all()).toHaveLength(1)
    expect(db.select().from(contactos).get()!.nombre).toBe('Círculo Medio')
    expect(db.select().from(cotizaciones).where(eq(cotizaciones.id, cot.id)).get()!.contactoId).toBe(original)
    expect(db.select().from(proyectos).where(eq(proyectos.id, p.id)).get()!.contactoId).toBe(original)
    expect(db.select().from(ingresos).where(eq(ingresos.id, i.id)).get()!.contactoId).toBe(original)
  })

  it('keeps the RFC the duplicate carried', () => {
    const { original, duplicado } = dosParecidos()
    db.update(contactos).set({ rfc: 'CME010101AAA' }).where(eq(contactos.id, duplicado)).run()
    responder(db, unaSugerencia().id, 'aceptada')
    expect(db.select().from(contactos).where(eq(contactos.id, original)).get()!.rfc).toBe('CME010101AAA')
  })

  it('keeps both Contactos when rejected', () => {
    dosParecidos()
    responder(db, unaSugerencia().id, 'rechazada')
    expect(db.select().from(contactos).all()).toHaveLength(2)
    expect(pendientes(db)).toHaveLength(0)
  })
})

describe('ubicación', () => {
  const sinCarpeta = () => {
    cotizacionEnDisco('Hotel Aura', 300)
    db.update(cotizaciones).set({ estado: 'aceptada' }).run()
    const [proyectoId] = proyectosDeCotizacionesAceptadas(db)
    return proyectoId
  }

  it('records an archive location when answered Archivado', () => {
    const proyectoId = sinCarpeta()
    responder(db, unaSugerencia().id, 'aceptada')
    const u = db.select().from(ubicacionesArchivo).where(eq(ubicacionesArchivo.proyectoId, proyectoId)).get()!
    expect(u.tipo).toBe('archivo')
    expect(u.disponible).toBe(false)
  })

  it('records the missing working folder when answered No disponible', () => {
    const proyectoId = sinCarpeta()
    responder(db, unaSugerencia().id, 'rechazada')
    const u = db.select().from(ubicacionesArchivo).where(eq(ubicacionesArchivo.proyectoId, proyectoId)).get()!
    expect(u.tipo).toBe('proyectos')
    expect(u.disponible).toBe(false)
  })
})

describe('answering twice', () => {
  it('refuses a Sugerencia that was already answered', () => {
    cotizacionEnDisco()
    importarCarpetaProyecto(db, { nombre: 'Sonrieme', tipo: 'proyectos', rutaRelativa: 'Proyectos/Sonrieme' })
    const { id } = unaSugerencia()
    responder(db, id, 'aceptada')
    expect(() => responder(db, id, 'rechazada')).toThrow()
  })
})

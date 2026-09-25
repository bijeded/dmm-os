import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { escanearCarpetas } from './importacion'
import { aceptarVincular, pendientes, responder } from './sugerencias'
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
} from './db/schema'
import { leerPdfsCotizaciones } from './importacion/pdfs'
import { pdfDeTexto } from './importacion/pdf-prueba'
import { db, ingresoBase, reiniciarDb } from './db/test-db'
import { estadoCobro } from './cobranza'
import { listarContactos } from './contactos'
import { resumenFinanzas } from './finanzas'
import type { RespuestaSugerencia } from '../shared/dominio'

let root: string

beforeEach(() => {
  reiniciarDb()
  root = mkdtempSync(join(tmpdir(), 'dmm-sugerencias-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const escanear = () => escanearCarpetas(db, root)

const cotizacionEnDisco = (nombre = 'Sonrieme', folio = 475) => {
  mkdirSync(join(root, 'Cotizaciones', '2025'), { recursive: true })
  writeFileSync(join(root, 'Cotizaciones', '2025', `DMM - ${folio} - ${nombre}.pdf`), '%PDF-1.4')
  escanear()
  return { cotizacionId: db.select().from(cotizaciones).where(eq(cotizaciones.folio, folio)).get()!.id }
}

const proyectoLlamado = (nombre: string) => db.select().from(proyectos).where(eq(proyectos.nombre, nombre)).get()!.id

const carpetaEnDisco = (nombre = 'Sonrieme') => {
  mkdirSync(join(root, 'Proyectos', nombre), { recursive: true })
  escanear()
  return { proyectoId: proyectoLlamado(nombre) }
}

const unaSugerencia = () => {
  const [s] = pendientes(db)
  expect(s).toBeTruthy()
  return s
}

const contacto = (nombre: string) => db.insert(contactos).values({ nombre }).returning().get()

describe('listar las sugerencias pendientes', () => {
  it('names the record and what accepting it would link to', () => {
    cotizacionEnDisco()
    carpetaEnDisco()
    const s = unaSugerencia()
    expect(s.accion).toBe('vincular')
    expect(s.registro).toContain('475')
    expect(s.destino).toContain('Sonrieme')
    expect(s.motivo).toBeTruthy()
  })

  it('leaves out the ones already answered', () => {
    cotizacionEnDisco()
    carpetaEnDisco()
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
    const { proyectoId } = carpetaEnDisco()
    expect(db.select().from(cotizaciones).get()!.estado).toBe('aceptada')

    responder(db, unaSugerencia().id, 'rechazada')
    expect(db.select().from(cotizaciones).where(eq(cotizaciones.id, cotizacionId)).get()!.estado).toBe('enviada')
    expect(db.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()!.cotizacionId).toBe(null)
  })

  it('keeps notas written after the import when a Cotización link is rejected', () => {
    cotizacionEnDisco()
    const { proyectoId } = carpetaEnDisco()
    db.update(proyectos).set({ notas: 'Pendiente de entrega final' }).where(eq(proyectos.id, proyectoId)).run()

    responder(db, unaSugerencia().id, 'rechazada')
    expect(db.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()!.notas).toBe('Pendiente de entrega final')
  })

  it('keeps a user note that starts with "Cotización " when a link that wrote no note is rejected', () => {
    cotizacionEnDisco()
    const { proyectoId } = carpetaEnDisco()
    db.update(proyectos).set({ notas: 'Cotización revisada con el cliente' }).where(eq(proyectos.id, proyectoId)).run()

    responder(db, unaSugerencia().id, 'rechazada')
    expect(db.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()!.notas).toBe('Cotización revisada con el cliente')
  })

  it('removes the note the link wrote when it is rejected', () => {
    cotizacionEnDisco('Sonrieme, Casa Luna')
    const { proyectoId } = carpetaEnDisco()
    expect(db.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()!.notas).toContain('Casa Luna')

    responder(db, unaSugerencia().id, 'rechazada')
    expect(db.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()!.notas).toBe(null)
  })

  it('leaves notas untouched when rejecting a Sugerencia recorded without an undo', () => {
    cotizacionEnDisco('Sonrieme, Casa Luna')
    const { proyectoId } = carpetaEnDisco()
    db.update(sugerenciasImportacion).set({ deshacer: null }).run()

    responder(db, unaSugerencia().id, 'rechazada')
    expect(db.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()!.notas).toContain('Casa Luna')
    expect(db.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()!.cotizacionId).toBe(null)
  })

  it('keeps the link when a Cotización link is accepted', () => {
    const { cotizacionId } = cotizacionEnDisco()
    const { proyectoId } = carpetaEnDisco()
    responder(db, unaSugerencia().id, 'aceptada')
    expect(db.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()!.cotizacionId).toBe(cotizacionId)
    expect(db.select().from(cotizaciones).get()!.estado).toBe('aceptada')
  })
})

describe('fusionar', () => {
  const dosParecidos = () => {
    mkdirSync(join(root, 'Clientes', 'Círculo Medio'), { recursive: true })
    escanear()
    mkdirSync(join(root, 'Clientes', 'Circulo Media'), { recursive: true })
    expect(escanear().contactos.creados).toBe(1)
    const id = (nombre: string) => db.select().from(contactos).where(eq(contactos.nombre, nombre)).get()!.id
    return { original: id('Círculo Medio'), duplicado: id('Circulo Media') }
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

  it('keeps another pending merge that pointed at the duplicate', () => {
    const { original, duplicado } = dosParecidos()
    const tercero = db.insert(contactos).values({ nombre: 'Circulo Medios' }).returning().get()
    db.insert(sugerenciasImportacion)
      .values({ entidad: 'contacto', entidadId: tercero.id, accion: 'fusionar', contactoId: duplicado, motivo: 'nombre parecido' })
      .run()

    responder(db, unaSugerencia().id, 'aceptada')

    const restante = pendientes(db)
    expect(restante).toHaveLength(1)
    expect(restante[0].destino).toBe('Círculo Medio')
    expect(db.select().from(contactos).all()).toHaveLength(2)
    expect(original).toBeGreaterThan(0)
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
    escanear()
    return proyectoLlamado('Hotel Aura')
  }

  it('records an archive location when answered Archivado', () => {
    const proyectoId = sinCarpeta()
    responder(db, unaSugerencia().id, 'aceptada', '2026-09-18')
    const u = db.select().from(ubicacionesArchivo).where(eq(ubicacionesArchivo.proyectoId, proyectoId)).get()!
    expect(u).toMatchObject({ tipo: 'archivo', disponible: false, verificadoEn: '2026-09-18' })
  })

  it('keeps the answer even when the Proyecto already had that location', () => {
    const proyectoId = sinCarpeta()
    db.insert(ubicacionesArchivo)
      .values({ proyectoId, tipo: 'archivo', rutaRelativa: 'Archivo/Proyectos/Hotel Aura', disponible: true })
      .run()
    responder(db, unaSugerencia().id, 'aceptada')
    expect(db.select().from(ubicacionesArchivo).where(eq(ubicacionesArchivo.proyectoId, proyectoId)).get()!.disponible).toBe(false)
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
    carpetaEnDisco()
    const { id } = unaSugerencia()
    responder(db, id, 'aceptada')
    expect(() => responder(db, id, 'rechazada')).toThrow()
  })
})

describe('Aceptar todas', () => {
  /** Two guessed Ingresos, a near-duplicate Contacto and a Proyecto with no folder, all pending. */
  const mezcla = () => {
    const c = contacto('Estudio Ocho')
    const p = db.insert(proyectos).values({ nombre: 'Hospital Jardín', contactoId: c.id, categoria: 'website' }).returning().get()
    const [a, b] = [1, 2].map(() => db.insert(ingresos).values({ categoria: 'sin_factura', ...ingresoBase, contactoId: c.id }).returning().get())
    for (const i of [a, b])
      db.insert(sugerenciasImportacion).values({ entidad: 'ingreso', entidadId: i.id, accion: 'vincular', proyectoId: p.id, motivo: 'fecha' }).run()
    const duplicado = contacto('Estudio 8')
    db.insert(sugerenciasImportacion)
      .values({ entidad: 'contacto', entidadId: duplicado.id, accion: 'fusionar', contactoId: c.id, motivo: 'nombre parecido' })
      .run()
    db.insert(sugerenciasImportacion).values({ entidad: 'proyecto', entidadId: p.id, accion: 'ubicacion', motivo: 'sin carpeta' }).run()
    return { proyectoId: p.id, ingresos: [a.id, b.id] }
  }

  it('accepts every pending vincular and leaves fusionar and ubicación waiting', () => {
    const { proyectoId } = mezcla()
    const quedan = aceptarVincular(db, '2026-09-24')
    expect(quedan.map((s) => s.accion)).toEqual(['fusionar', 'ubicacion'])
    expect(db.select().from(ingresos).all().map((i) => i.proyectoId)).toEqual([proyectoId, proyectoId])
    expect(db.select().from(contactos).all()).toHaveLength(2)
  })

  it('accepts none when one of them fails', () => {
    const [, segundo] = mezcla().ingresos
    db.run(sql.raw(`create trigger falla before update of proyecto_id on ingresos when new.id = ${segundo} begin select raise(abort, 'falla'); end`))
    expect(() => aceptarVincular(db)).toThrow('falla')
    expect(pendientes(db).map((s) => s.accion)).toEqual(['vincular', 'vincular', 'fusionar', 'ubicacion'])
    expect(db.select().from(ingresos).all().map((i) => i.proyectoId)).toEqual([null, null])
  })

  it('accepts the guesses even when each offers other Proyectos', () => {
    const { citliTours, cotizacion } = cotizacionAdivinada()
    const { web2023, ingresoId } = ingresoAdivinado()
    aceptarVincular(db)
    expect(db.select().from(proyectos).where(eq(proyectos.id, citliTours)).get()!.cotizacionId).toBe(cotizacion)
    expect(db.select().from(ingresos).where(eq(ingresos.id, ingresoId)).get()!.proyectoId).toBe(web2023)
    expect(db.select().from(sugerenciasImportacion).all().map((s) => s.estado)).toEqual(['aceptada', 'aceptada', 'aceptada'])
  })
})

/** Everything an answer could touch, to check that a refused one changed nothing. */
const foto = () =>
  JSON.stringify([contactos, cotizaciones, proyectos, ingresos, costos, sugerenciasImportacion].map((t) => db.select().from(t).all()))

const estadoDe = (id: number) => db.select().from(sugerenciasImportacion).where(eq(sugerenciasImportacion.id, id)).get()!.estado

const proyecto = (nombre: string, contactoId: number, extra: Partial<typeof proyectos.$inferInsert> = {}) =>
  db.insert(proyectos).values({ nombre, contactoId, categoria: 'website', ...extra }).returning().get().id

/**
 * Cotización 401 of Sublime, guessed for "Citli Tours" at scan time with a note and a Cliente
 * final, and Cotización 308 linked to "3 Moon Wishes" by its own pending guess. "Citli Tours 2"
 * is free and carries the user's own notes; "Casa Frida" belongs to another Contacto.
 */
const cotizacionAdivinada = () => {
  const sublime = contacto('Sublime').id
  const nota = 'Cotización 401 también incluye: Casa Luna'
  const cotizar = (folio: number) =>
    db.insert(cotizaciones).values({ contactoId: sublime, folio, categoria: 'website', estado: 'aceptada', fecha: '2025-03-01', total: 50_000 }).returning().get().id
  const cotizacion = cotizar(401)
  const otra = cotizar(308)
  const citliTours = proyecto('Citli Tours', sublime, { cotizacionId: cotizacion, notas: nota, clienteFinal: 'Casa Luna' })
  const citliTours2 = proyecto('Citli Tours 2', sublime, { notas: 'Entrega en dos fases', clienteFinal: 'Hotel Xcaret' })
  const moonWishes = proyecto('3 Moon Wishes', sublime, { cotizacionId: otra })
  const deOtro = proyecto('Casa Frida', contacto('Frida').id)
  db.insert(sugerenciasImportacion)
    .values({
      entidad: 'cotizacion',
      entidadId: cotizacion,
      accion: 'vincular',
      proyectoId: citliTours,
      motivo: 'carpeta con el mismo nombre',
      deshacer: { cotizacion: { estado: 'enviada' }, proyecto: { notasAntes: 'Antes', notasEscritas: nota, clienteFinalEscrito: 'Casa Luna' } }
    })
    .run()
  db.insert(sugerenciasImportacion)
    .values({ entidad: 'cotizacion', entidadId: otra, accion: 'vincular', proyectoId: moonWishes, motivo: 'carpeta', deshacer: { cotizacion: { estado: 'enviada' } } })
    .run()
  return { sublime, cotizacion, otra, citliTours, citliTours2, moonWishes, deOtro }
}

/** An MXN Ingreso of Frida of $11,600.00, guessed for "Web 2023"; "Web 2027" has a quote it covers. */
const ingresoAdivinado = (extra: Partial<typeof ingresos.$inferInsert> = {}) => {
  const frida = contacto('Frida Estudio').id
  const cot = db
    .insert(cotizaciones)
    .values({ contactoId: frida, folio: 900, categoria: 'website', estado: 'aceptada', fecha: '2027-01-01', total: 1_160_000 })
    .returning()
    .get().id
  const web2023 = proyecto('Web 2023', frida)
  const web2027 = proyecto('Web 2027', frida, { cotizacionId: cot, estado: 'completado' })
  const ajeno = proyecto('Web ajena', contacto('Otro Cliente').id)
  const ingresoId = db
    .insert(ingresos)
    .values({ categoria: 'sin_factura', contactoId: frida, fechaRegistro: '2026-09-10', subtotal: 1_000_000, iva: 160_000, total: 1_160_000, ...extra })
    .returning()
    .get().id
  db.insert(sugerenciasImportacion).values({ entidad: 'ingreso', entidadId: ingresoId, accion: 'vincular', proyectoId: web2023, motivo: 'monto y fecha' }).run()
  return { frida, web2023, web2027, ajeno, ingresoId }
}

/** "Frida Comunicacion", guessed to duplicate "Frida Kahlo"; "Frida" is a cold lead. */
const fusionAdivinada = () => {
  const kahlo = contacto('Frida Kahlo').id
  const frida = contacto('Frida').id
  const duplicado = contacto('Frida Comunicacion').id
  db.insert(sugerenciasImportacion).values({ entidad: 'contacto', entidadId: duplicado, accion: 'fusionar', contactoId: kahlo, motivo: 'nombre parecido' }).run()
  return { kahlo, frida, duplicado }
}

/** The pending Sugerencia about Cotización `cotizacionId`, as Logs reads it. */
const sugerenciaDe = (cotizacionId: number) => {
  const { id } = db.select().from(sugerenciasImportacion).where(and(eq(sugerenciasImportacion.entidad, 'cotizacion'), eq(sugerenciasImportacion.entidadId, cotizacionId))).get()!
  return pendientes(db).find((s) => s.id === id)!
}

describe('opciones', () => {
  it('offers a Cotización its Contacto’s Proyectos with no Cotización, plus the guess', () => {
    const { cotizacion, citliTours, citliTours2 } = cotizacionAdivinada()
    const s = sugerenciaDe(cotizacion)
    expect(s.opciones).toEqual([
      { id: citliTours, nombre: 'Citli Tours', sugerida: true },
      { id: citliTours2, nombre: 'Citli Tours 2', sugerida: false }
    ])
    expect(s.varias).toBe(false)
  })

  it('offers an Ingreso every Proyecto of its Contacto and none of another', () => {
    const { web2023, web2027 } = ingresoAdivinado()
    expect(unaSugerencia().opciones).toEqual([
      { id: web2023, nombre: 'Web 2023', sugerida: true },
      { id: web2027, nombre: 'Web 2027', sugerida: false }
    ])
  })

  it('offers a fusionar every Contacto but the duplicate', () => {
    const { kahlo, frida } = fusionAdivinada()
    expect(unaSugerencia().opciones).toEqual([
      { id: frida, nombre: 'Frida', sugerida: false },
      { id: kahlo, nombre: 'Frida Kahlo', sugerida: true }
    ])
  })

  it('offers nothing for an ubicación or a Costo', () => {
    const c = contacto('Estudio Ocho')
    const p = proyecto('Hospital Jardín', c.id)
    proyecto('Clínica Norte', c.id)
    const k = db.insert(costos).values({ nombre: 'Hosting', categoria: 'unico', subtotal: 100, iva: 16, total: 116, fecha: '2026-02-01' }).returning().get()
    db.insert(sugerenciasImportacion).values({ entidad: 'costo', entidadId: k.id, accion: 'vincular', proyectoId: p, motivo: 'fecha' }).run()
    db.insert(sugerenciasImportacion).values({ entidad: 'proyecto', entidadId: p, accion: 'ubicacion', motivo: 'sin carpeta' }).run()
    expect(pendientes(db).map((s) => s.opciones)).toEqual([[], []])
  })

  it('offers "3 Moon Wishes" once the Sugerencia that held it is rejected', () => {
    const { cotizacion, otra, moonWishes } = cotizacionAdivinada()
    expect(sugerenciaDe(cotizacion).opciones.map((o) => o.id)).not.toContain(moonWishes)
    responder(db, sugerenciaDe(otra).id, 'rechazada')
    expect(sugerenciaDe(cotizacion).opciones).toContainEqual({ id: moonWishes, nombre: '3 Moon Wishes', sugerida: false })
  })
})

describe('an answer is checked before anything changes', () => {
  /** Answers Sugerencia `id` with `respuesta`, expecting a refusal that leaves everything as it was. */
  const rechazada = (id: number, respuesta: unknown, mensaje?: string) => {
    const antes = foto()
    expect(() => responder(db, id, respuesta as RespuestaSugerencia)).toThrow(mensaje)
    expect(foto()).toBe(antes)
    expect(estadoDe(id)).toBe('pendiente')
  }

  it('refuses a Proyecto it does not offer', () => {
    const c = cotizacionAdivinada()
    rechazada(sugerenciaDe(c.cotizacion).id, { elegidas: [c.deOtro] }, 'Ese Proyecto ya no se puede elegir')
    rechazada(sugerenciaDe(c.cotizacion).id, { elegidas: [c.moonWishes] }, 'Ese Proyecto ya no se puede elegir')
  })

  it('refuses no choice, the same choice twice, and two choices where one is asked', () => {
    const c = cotizacionAdivinada()
    const { id } = sugerenciaDe(c.cotizacion)
    rechazada(id, { elegidas: [] })
    rechazada(id, { elegidas: [c.citliTours2, c.citliTours2] })
    rechazada(id, { elegidas: [c.citliTours, c.citliTours2] })
  })

  it('refuses a choice for an ubicación', () => {
    const p = proyecto('Hotel Aura', contacto('Aura').id)
    db.insert(sugerenciasImportacion).values({ entidad: 'proyecto', entidadId: p, accion: 'ubicacion', motivo: 'sin carpeta' }).run()
    rechazada(unaSugerencia().id, { elegidas: [p] })
  })

  it.each([['aceptar'], [null], [undefined], [{ elegidas: [1.5] }], [{ elegidas: '1' }], [{}], [[1]]])('refuses the malformed answer %j', (respuesta) => {
    rechazada(sugerenciaDe(cotizacionAdivinada().cotizacion).id, respuesta, 'Respuesta no válida')
  })

  it('records choosing the guess as accepting it', () => {
    const { cotizacion, citliTours } = cotizacionAdivinada()
    const { id } = sugerenciaDe(cotizacion)
    responder(db, id, { elegidas: [citliTours] })
    expect(estadoDe(id)).toBe('aceptada')
    expect(db.select().from(proyectos).where(eq(proyectos.id, citliTours)).get()!.cotizacionId).toBe(cotizacion)
  })
})

describe('correcting a Cotización', () => {
  it('undoes the guess and links the chosen Proyecto, leaving its notes alone', () => {
    const { cotizacion, citliTours, citliTours2 } = cotizacionAdivinada()
    const { id } = sugerenciaDe(cotizacion)
    responder(db, id, { elegidas: [citliTours2] })

    expect(db.select().from(proyectos).where(eq(proyectos.id, citliTours)).get()).toMatchObject({ cotizacionId: null, notas: 'Antes', clienteFinal: null })
    expect(db.select().from(proyectos).where(eq(proyectos.id, citliTours2)).get()).toMatchObject({
      cotizacionId: cotizacion,
      notas: 'Entrega en dos fases',
      clienteFinal: 'Hotel Xcaret'
    })
    expect(db.select().from(cotizaciones).where(eq(cotizaciones.id, cotizacion)).get()!.estado).toBe('aceptada')
    expect(db.select().from(ingresos).all()).toHaveLength(0)
    expect(db.select().from(costos).all()).toHaveLength(0)
    expect(estadoDe(id)).toBe('corregida')
    expect(pendientes(db).map((s) => s.id)).not.toContain(id)
  })

  it('keeps a Cotización the user linked to the guessed Proyecto by hand', () => {
    const { cotizacion, otra, citliTours, citliTours2, moonWishes } = cotizacionAdivinada()
    db.update(proyectos).set({ cotizacionId: null }).where(eq(proyectos.id, moonWishes)).run()
    db.update(proyectos).set({ cotizacionId: otra }).where(eq(proyectos.id, citliTours)).run()

    responder(db, sugerenciaDe(cotizacion).id, { elegidas: [citliTours2] })
    expect(db.select().from(proyectos).where(eq(proyectos.id, citliTours)).get()!.cotizacionId).toBe(otra)
    expect(db.select().from(proyectos).where(eq(proyectos.id, citliTours2)).get()!.cotizacionId).toBe(cotizacion)
  })

  it('refuses a Proyecto that got a Cotización after the list was read', () => {
    const { sublime, cotizacion, citliTours2 } = cotizacionAdivinada()
    const { id } = sugerenciaDe(cotizacion)
    const nueva = db.insert(cotizaciones).values({ contactoId: sublime, folio: 402, categoria: 'website', estado: 'aceptada', fecha: '2025-04-01' }).returning().get().id
    db.update(proyectos).set({ cotizacionId: nueva }).where(eq(proyectos.id, citliTours2)).run()
    const antes = foto()

    expect(() => responder(db, id, { elegidas: [citliTours2] })).toThrow('Ese Proyecto ya no se puede elegir')
    expect(foto()).toBe(antes)
    expect(estadoDe(id)).toBe('pendiente')
  })
})

describe('correcting an Ingreso', () => {
  const corregir = (extra: Partial<typeof ingresos.$inferInsert> = {}) => {
    const r = ingresoAdivinado(extra)
    const antes = db.select().from(ingresos).where(eq(ingresos.id, r.ingresoId)).get()!
    const { id } = unaSugerencia()
    responder(db, id, { elegidas: [r.web2027] })
    return { ...r, id, antes, despues: db.select().from(ingresos).where(eq(ingresos.id, r.ingresoId)).get()! }
  }

  it('moves an MXN Ingreso to the chosen Proyecto with its amounts', () => {
    const { id, web2023, web2027, antes, despues } = corregir()
    expect(despues).toEqual({ ...antes, proyectoId: web2027 })
    expect(despues.total).toBe(1_160_000)
    expect(db.select().from(ingresos).where(eq(ingresos.proyectoId, web2023)).all()).toHaveLength(0)
    expect(estadoDe(id)).toBe('corregida')
  })

  it('keeps a USD Ingreso’s original amount and peso amounts', () => {
    const { web2027, antes, despues } = corregir({ montoOriginal: 60_000, monedaOriginal: 'USD' })
    expect(despues).toEqual({ ...antes, proyectoId: web2027 })
    expect(despues).toMatchObject({ montoOriginal: 60_000, monedaOriginal: 'USD', subtotal: 1_000_000, total: 1_160_000 })
  })

  it('keeps a cancelled Ingreso cancelled', () => {
    const { web2027, despues } = corregir({ estado: 'cancelado' })
    expect(despues).toMatchObject({ estado: 'cancelado', proyectoId: web2027 })
  })

  it('clears Sin ingresos registrados on the chosen Proyecto when a paid Ingreso covers its quote', () => {
    const r = ingresoAdivinado({ estado: 'pagado', fechaPago: '2026-09-12' })
    expect(estadoCobro(db, r.web2027).falta).toMatchObject({ faltante: 1_160_000 })
    responder(db, unaSugerencia().id, { elegidas: [r.web2027] })
    expect(estadoCobro(db, r.web2027).falta).toBe(null)
  })

  it('shows the chosen Proyecto in Cobros', () => {
    const r = ingresoAdivinado()
    responder(db, unaSugerencia().id, { elegidas: [r.web2027] })
    const { cobros } = resumenFinanzas(db, 'todo', '2026-09-24', 30)
    const fila = [...cobros.mes, ...cobros.vencidos, ...cobros.porFacturar].find((i) => i.id === r.ingresoId)
    expect(fila?.proyecto).toBe('Web 2027')
  })
})

describe('correcting a fusionar', () => {
  it('merges the duplicate into the chosen Contacto and leaves the guess alone', () => {
    const { kahlo, frida, duplicado } = fusionAdivinada()
    const cot = db.insert(cotizaciones).values({ contactoId: duplicado, folio: 12, categoria: 'other', estado: 'aceptada', fecha: '2026-01-01' }).returning().get().id
    const p = proyecto('Sitio', duplicado)
    const i = db.insert(ingresos).values({ categoria: 'sin_factura', ...ingresoBase, contactoId: duplicado }).returning().get().id
    const tercero = contacto('Frida Comunicación Web').id
    db.insert(sugerenciasImportacion).values({ entidad: 'contacto', entidadId: tercero, accion: 'fusionar', contactoId: duplicado, motivo: 'nombre parecido' }).run()
    const kahloAntes = db.select().from(contactos).where(eq(contactos.id, kahlo)).get()
    const { id } = pendientes(db)[0]

    responder(db, id, { elegidas: [frida] })

    expect(db.select().from(contactos).where(eq(contactos.id, duplicado)).get()).toBeUndefined()
    expect(db.select().from(cotizaciones).where(eq(cotizaciones.id, cot)).get()!.contactoId).toBe(frida)
    expect(db.select().from(proyectos).where(eq(proyectos.id, p)).get()!.contactoId).toBe(frida)
    expect(db.select().from(ingresos).where(eq(ingresos.id, i)).get()!.contactoId).toBe(frida)
    expect(db.select().from(contactos).where(eq(contactos.id, kahlo)).get()).toEqual(kahloAntes)
    expect(estadoDe(id)).toBe('corregida')
    expect(pendientes(db)).toHaveLength(1)
    expect(db.select().from(sugerenciasImportacion).where(eq(sugerenciasImportacion.entidadId, tercero)).get()!.contactoId).toBe(frida)
  })

  it('makes the chosen Contacto stop being a cold lead', () => {
    const { frida, duplicado } = fusionAdivinada()
    db.insert(cotizaciones).values({ contactoId: duplicado, folio: 12, categoria: 'other', estado: 'aceptada', fecha: '2026-01-01' }).run()
    const estadoFrida = () => listarContactos(db).contactos.find((c) => c.id === frida)!.estado
    expect(estadoFrida()).toBe('lead_frio')
    responder(db, unaSugerencia().id, { elegidas: [frida] })
    expect(estadoFrida()).not.toBe('lead_frio')
  })

  it('settles a pending merge into the duplicate once the duplicate is merged into that Contacto', () => {
    const { kahlo, frida, duplicado } = fusionAdivinada()
    const otro = contacto('Frida Comunicación').id
    db.insert(sugerenciasImportacion).values({ entidad: 'contacto', entidadId: otro, accion: 'fusionar', contactoId: duplicado, motivo: 'nombre parecido' }).run()
    const [corregida, pendiente] = pendientes(db)

    responder(db, corregida.id, { elegidas: [otro] })

    expect(estadoDe(pendiente.id)).toBe('aceptada')
    expect(pendientes(db)).toHaveLength(0)
    expect(db.select().from(contactos).all().map((c) => c.id).sort()).toEqual([kahlo, frida, otro].sort())
  })

  it('refuses a Contacto merged away after the list was read', () => {
    const { kahlo, frida } = fusionAdivinada()
    const { id } = unaSugerencia()
    db.insert(sugerenciasImportacion).values({ entidad: 'contacto', entidadId: frida, accion: 'fusionar', contactoId: kahlo, motivo: 'nombre parecido' }).run()
    responder(db, pendientes(db)[1].id, 'aceptada')
    const antes = foto()

    expect(() => responder(db, id, { elegidas: [frida] })).toThrow('Ese Contacto ya no se puede elegir')
    expect(foto()).toBe(antes)
    expect(estadoDe(id)).toBe('pendiente')
  })
})

describe('¿Qué aceptó?', () => {
  /**
   * Sublime's quote 308, dated 2021-03-03, with these price lines, delivered by `Proyectos/Sublime`:
   * the scan accepts it and asks which prices were taken.
   */
  const aceptadaConPrecios = async (precios: string[]) => {
    mkdirSync(join(root, 'Cotizaciones', '2021'), { recursive: true })
    writeFileSync(
      join(root, 'Cotizaciones', '2021', 'DMM - 308 - Sublime.pdf'),
      pdfDeTexto(['Ciudad de México, 3 de marzo, 2021.', ...precios.flatMap((p, i) => [`Servicio ${i + 1}: parte ${i + 1}:`, p])])
    )
    mkdirSync(join(root, 'Proyectos', 'Sublime'), { recursive: true })
    escanearCarpetas(db, root, undefined, '2026-09-01', await leerPdfsCotizaciones(root, db))
    const c = db.select().from(cotizaciones).where(eq(cotizaciones.folio, 308)).get()!
    expect(c.estado).toBe('aceptada')
    return c
  }
  const partidas = () => pendientes(db).find((s) => s.accion === 'partidas')
  const marcadas = () => partidas()!.opciones.filter((o) => o.sugerida).map((o) => o.id)
  const cotizacion = () => db.select().from(cotizaciones).where(eq(cotizaciones.folio, 308)).get()!
  /** An issued invoice to the quote's Contacto; `partes` splits it into Parcialidades. */
  const factura = (
    uuid: string,
    subtotal: number,
    { fecha = '2021-04-01', estado = 'pagado' as 'pagado' | 'cancelado', partes = 1, usd = null as number | null } = {}
  ) => {
    const contactoId = cotizacion().contactoId
    for (let i = 0; i < partes; i++) {
      const parte = subtotal / partes
      db.insert(ingresos)
        .values({
          categoria: 'factura',
          estadoFacturacion: 'facturado',
          estado,
          contactoId,
          cfdiUuid: uuid,
          ...(partes > 1 && { cfdiParcialidad: i + 1 }),
          fechaRegistro: fecha,
          subtotal: parte,
          iva: Math.round(parte * 0.16),
          total: parte + Math.round(parte * 0.16),
          ...(usd !== null && { montoOriginal: usd / partes, monedaOriginal: 'USD' as const })
        })
        .run()
    }
  }
  const TRES = ['Costo: $ 10,000.00', 'Costo: $ 4,000.00', 'Costo: $ 2,500.00']

  describe('its opciones', () => {
    it('offers each price, several at once, with its amount, and keeps the sum as the Monto meanwhile', async () => {
      await aceptadaConPrecios(TRES)
      expect(partidas()).toMatchObject({ entidad: 'cotizacion', varias: true, registro: expect.stringContaining('308') })
      expect(partidas()!.opciones.map((o) => [o.id, o.nombre])).toEqual([
        [0, expect.stringMatching(/Servicio 1: parte 1 · \$10,000\.00/)],
        [1, expect.stringMatching(/\$4,000\.00/)],
        [2, expect.stringMatching(/\$2,500\.00/)]
      ])
      expect(marcadas()).toEqual([])
      expect(cotizacion()).toMatchObject({ subtotal: 1650000, iva: 0, total: 1650000 })
    })

    it('pre-checks the price an invoice equals', async () => {
      await aceptadaConPrecios(TRES)
      factura('A', 400000)
      expect(marcadas()).toEqual([1])
    })

    it('pre-checks the set of prices an invoice adds up to', async () => {
      await aceptadaConPrecios(TRES)
      factura('A', 1250000)
      expect(marcadas()).toEqual([0, 2])
    })

    it('adds up the Parcialidades of one invoice', async () => {
      await aceptadaConPrecios(TRES)
      factura('A', 1400000, { partes: 2 })
      expect(marcadas()).toEqual([0, 1])
    })

    it('ignores invoices dated before the quote, and cancelled ones', async () => {
      await aceptadaConPrecios(TRES)
      factura('ANTES', 400000, { fecha: '2021-01-15' })
      factura('CANCELADA', 250000, { estado: 'cancelado' })
      expect(marcadas()).toEqual([])
    })

    it('lets the earliest matching invoice decide', async () => {
      await aceptadaConPrecios(TRES)
      factura('DESPUES', 250000, { fecha: '2021-06-01' })
      factura('PRIMERO', 400000, { fecha: '2021-04-01' })
      expect(marcadas()).toEqual([1])
    })

    it('takes the fewest prices that make the invoice', async () => {
      await aceptadaConPrecios(['Costo: $ 5,000.00', 'Costo: $ 2,000.00', 'Costo: $ 3,000.00'])
      factura('A', 500000)
      expect(marcadas()).toEqual([0])
    })

    it("compares a USD quote with USD invoices by their amount before IVA, and ignores peso ones", async () => {
      await aceptadaConPrecios(['Costo: $ 260.00 USD', 'Costo: $ 120.00 USD'])
      expect(cotizacion().moneda).toBe('USD')
      factura('PESOS', 26000)
      expect(marcadas()).toEqual([])
      factura('DOLARES', 500000, { usd: 30160 })
      expect(marcadas()).toEqual([0])
    })

    it('pre-checks from an invoice imported after the scan, on the next read', async () => {
      await aceptadaConPrecios(TRES)
      expect(marcadas()).toEqual([])
      factura('A', 1000000)
      expect(marcadas()).toEqual([0])
    })
  })

  describe('answering it', () => {
    it('sets the Monto to the pre-checked prices when accepted', async () => {
      await aceptadaConPrecios(TRES)
      factura('A', 1250000)
      responder(db, partidas()!.id, 'aceptada')
      expect(cotizacion()).toMatchObject({ subtotal: 1250000, iva: 0, total: 1250000 })
      expect(db.select().from(sugerenciasImportacion).where(eq(sugerenciasImportacion.accion, 'partidas')).get()!.estado).toBe('aceptada')
      expect(partidas()).toBeUndefined()
    })

    it('records choosing exactly the pre-checked prices as accepting them', async () => {
      await aceptadaConPrecios(TRES)
      factura('A', 1250000)
      responder(db, partidas()!.id, { elegidas: [2, 0] })
      expect(db.select().from(sugerenciasImportacion).where(eq(sugerenciasImportacion.accion, 'partidas')).get()!.estado).toBe('aceptada')
    })

    it('corrects it with another set of prices', async () => {
      await aceptadaConPrecios(TRES)
      factura('A', 1250000)
      responder(db, partidas()!.id, { elegidas: [1] })
      expect(cotizacion()).toMatchObject({ subtotal: 400000, iva: 0, total: 400000 })
      expect(db.select().from(sugerenciasImportacion).where(eq(sugerenciasImportacion.accion, 'partidas')).get()!.estado).toBe('corregida')
    })

    it('keeps the provisional Monto when rejected, and is not asked again', async () => {
      await aceptadaConPrecios(TRES)
      responder(db, partidas()!.id, 'rechazada')
      expect(cotizacion().total).toBe(1650000)
      escanear()
      expect(partidas()).toBeUndefined()
    })

    it.each<[string, RespuestaSugerencia]>([
      ['no price', { elegidas: [] }],
      ['a price twice', { elegidas: [1, 1] }],
      ['a price the quote does not have', { elegidas: [7] }],
      ['the guess when nothing is pre-checked', 'aceptada']
    ])('refuses %s, changing nothing', async (_, respuesta) => {
      await aceptadaConPrecios(TRES)
      const id = partidas()!.id
      expect(() => responder(db, id, respuesta)).toThrow()
      expect(cotizacion().total).toBe(1650000)
      expect(partidas()!.id).toBe(id)
    })

    it('sets a USD quote\'s Monto in US cents', async () => {
      await aceptadaConPrecios(['Costo: $ 260.00 USD', 'Costo: $ 120.00 USD'])
      responder(db, partidas()!.id, { elegidas: [0] })
      expect(cotizacion()).toMatchObject({ moneda: 'USD', subtotal: 26000, total: 26000 })
    })

    it('creates no Ingreso, Costo or definition, whatever the answer', async () => {
      await aceptadaConPrecios(TRES)
      responder(db, partidas()!.id, { elegidas: [0, 1] })
      expect([ingresos, costos, definicionesIngreso, definicionesCosto].map((t) => db.select().from(t).all().length)).toEqual([0, 0, 0, 0])
    })

    it('clears what the Proyecto lacks once the answer is a Monto its paid Ingresos cover', async () => {
      await aceptadaConPrecios(TRES)
      const proyectoId = proyectoLlamado('Sublime')
      db.insert(ingresos).values({ categoria: 'sin_factura', estado: 'pagado', proyectoId, fechaRegistro: '2021-05-01', subtotal: 1250000, total: 1250000 }).run()
      expect(estadoCobro(db, proyectoId).falta?.faltante).toBe(400000)
      responder(db, partidas()!.id, { elegidas: [0, 2] })
      expect(estadoCobro(db, proyectoId).falta).toBeNull()
    })
  })

  describe('while its Cotización is accepted', () => {
    it('is asked only while the Cotización is aceptada', async () => {
      await aceptadaConPrecios(TRES)
      const vincular = pendientes(db).find((s) => s.accion === 'vincular')!
      const id = partidas()!.id
      responder(db, vincular.id, 'rechazada')
      expect(cotizacion().estado).toBe('enviada')
      expect(partidas()).toBeUndefined()
      expect(() => responder(db, id, { elegidas: [0] })).toThrow('ya no está aceptada')
    })

    it('stops being asked once the Cotización is cancelled', async () => {
      await aceptadaConPrecios(TRES)
      db.update(cotizaciones).set({ estado: 'cancelada' }).where(eq(cotizaciones.folio, 308)).run()
      expect(partidas()).toBeUndefined()
    })

    it('is still asked after the link is corrected to another Proyecto', async () => {
      await aceptadaConPrecios(TRES)
      const otro = db.insert(proyectos).values({ nombre: 'Sublime 2', contactoId: cotizacion().contactoId, categoria: 'other' }).returning().get()
      const vincular = pendientes(db).find((s) => s.accion === 'vincular')!
      responder(db, vincular.id, { elegidas: [otro.id] })
      expect(partidas()).toBeDefined()
    })

    it('is left pending by Aceptar todas', async () => {
      await aceptadaConPrecios(TRES)
      aceptarVincular(db)
      expect(partidas()).toBeDefined()
      expect(cotizacion().total).toBe(1650000)
    })
  })
})

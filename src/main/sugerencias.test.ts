import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { escanearCarpetas } from './importacion'
import { aceptarVincular, pendientes, responder } from './sugerencias'
import { contactos, costos, cotizaciones, ingresos, proyectos, sugerenciasImportacion, ubicacionesArchivo } from './db/schema'
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

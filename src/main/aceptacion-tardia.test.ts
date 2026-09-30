import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { costos, cotizaciones, definicionesIngreso, ingresos, proyectos, sugerenciasImportacion, ubicacionesArchivo } from './db/schema'
import { contacto, db, reiniciarDb } from './db/test-db'
import { dbAlDia } from './ledger'
import { aceptarTarde, opcionesAceptacionTardia } from './aceptacion-tardia'
import { cancelarCotizacion, enviarCotizacion, fichaCotizacion, guardarCotizacion, listarCotizaciones, rechazarCotizacion } from './cotizar'
import { listarContactos } from './contactos'
import { resumenFinanzas } from './finanzas'
import { listarProyectos } from './proyectos'
import type { CotizacionNueva } from '../shared/dominio'

const HOY = '2026-09-29'
let root: string
let contactoId: number
const imprimir = vi.fn(async (html: string) => new TextEncoder().encode(`%PDF ${html.length}`))

beforeEach(() => {
  reiniciarDb()
  root = mkdtempSync(join(tmpdir(), 'dmm-aceptacion-tardia-'))
  contactoId = contacto('Clínica Sol').id
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const nueva = (cambios: Partial<CotizacionNueva> = {}): CotizacionNueva => ({
  contactoId,
  nombre: 'Rediseño sitio web',
  categoria: 'website',
  fecha: '2026-08-01',
  validezDias: 15,
  moneda: 'MXN',
  partidas: [{ concepto: 'Sitio web', categoria: 'website', cantidad: 1, precio: 4_000_000 }],
  conIva: true,
  facturacion: 'unica',
  parcialidades: null,
  stack: null,
  terminos: null,
  notas: null,
  costosEstimados: [{ concepto: 'Hosting', monto: 200_000, categoria: 'unico', parcialidades: null }],
  ...cambios
})

/** A Cotización made in the app, sent on 2026-08-01 with 15 días de vigencia, and expirada by hoy. */
async function expirada(cambios: Partial<CotizacionNueva> = {}) {
  const { id } = guardarCotizacion(db, nueva(cambios))
  await enviarCotizacion(db, root, id, imprimir)
  dbAlDia(db, HOY)
  return id
}

const partida = (concepto: string, precio: number) => ({ concepto, categoria: 'website' as const, cantidad: 1, precio })

/** A legacy Cotización as the folder scan leaves it once Al día expired it. */
function importada(cambios: Partial<typeof cotizaciones.$inferInsert> = {}) {
  return db
    .insert(cotizaciones)
    .values({
      folio: 377,
      contactoId,
      nombre: 'Blog',
      categoria: 'website',
      estado: 'expirada',
      fecha: '2021-03-01',
      importado: true,
      items: [partida('Blog', 5_000_000)],
      subtotal: 5_000_000,
      total: 5_000_000,
      ...cambios
    })
    .returning()
    .get().id
}

function proyectoDe(values: Partial<typeof proyectos.$inferInsert> = {}) {
  return db
    .insert(proyectos)
    .values({ nombre: 'Zamora Live', contactoId, categoria: 'other', estado: 'completado', ...values })
    .returning()
    .get().id
}

const sugerencias = () => db.select().from(sugerenciasImportacion).all()

describe('opciones de la Aceptación tardía', () => {
  it('lists, for an imported Cotización, its Contacto’s Proyectos with no Cotización and not cancelled', async () => {
    const libre = proyectoDe({ nombre: 'Zamora Live' })
    proyectoDe({ nombre: 'Cancelado', estado: 'cancelado' })
    const otra = importada({ folio: 100, estado: 'aceptada' })
    proyectoDe({ nombre: 'Con cotización', cotizacionId: otra })
    proyectoDe({ nombre: 'De otro', contactoId: contacto('Otro').id })

    expect(opcionesAceptacionTardia(db, importada())).toEqual({ importado: true, moneda: 'MXN', proyectos: [{ id: libre, nombre: 'Zamora Live', estado: 'completado' }] })
  })

  it('lists no Proyectos for a Cotización made in the app, which creates its own', async () => {
    proyectoDe()
    expect(opcionesAceptacionTardia(db, await expirada())).toEqual({ importado: false, moneda: 'MXN', proyectos: [] })
  })
})

describe('Aceptación tardía de una Cotización hecha en la app', () => {
  it('records the Plan de cobro dated hoy, with a Proyecto en curso and its folder', async () => {
    const id = await expirada()
    expect(fichaCotizacion(db, id).estado).toBe('expirada')

    const f = aceptarTarde(db, root, id, HOY, {})
    expect(f.estado).toBe('aceptada')
    expect(db.select().from(proyectos).where(eq(proyectos.id, f.proyectoId!)).get()).toMatchObject({ estado: 'en_curso', fechaInicio: HOY, cotizacionId: id })
    expect(existsSync(join(root, 'Proyectos/Clínica Sol - Rediseño sitio web'))).toBe(true)
    expect(db.select().from(ingresos).all()).toMatchObject([{ estado: 'pendiente', estadoFacturacion: 'por_facturar', subtotal: 4_000_000, total: 4_640_000, proyectoId: f.proyectoId }])
    expect(db.select().from(costos).all()).toMatchObject([{ nombre: 'Hosting', estimado: true, estado: 'pendiente', proyectoId: f.proyectoId }])
  })

  it('accepts a rechazada Cotización the same way', async () => {
    const { id } = guardarCotizacion(db, nueva({ validezDias: 90 }))
    await enviarCotizacion(db, root, id, imprimir)
    rechazarCotizacion(db, id)
    expect(aceptarTarde(db, root, id, HOY, {}).estado).toBe('aceptada')
    expect(db.select().from(ingresos).all()).toHaveLength(1)
  })

  it('converts a USD Cotización at the tipo de cambio given, keeping the USD original', async () => {
    const id = await expirada({ moneda: 'USD', conIva: false, partidas: [partida('App', 200_000)], costosEstimados: [] })
    aceptarTarde(db, root, id, HOY, { tipoCambio: 18.5 })
    expect(db.select().from(ingresos).all()).toMatchObject([{ subtotal: 3_700_000, total: 3_700_000, montoOriginal: 200_000, monedaOriginal: 'USD' }])
  })

  it('refuses a USD Cotización without a tipo de cambio, writing nothing', async () => {
    const id = await expirada({ moneda: 'USD', partidas: [partida('App', 200_000)] })
    expect(() => aceptarTarde(db, root, id, HOY, {})).toThrow('tipo de cambio')
    expect(fichaCotizacion(db, id).estado).toBe('expirada')
    expect(db.select().from(proyectos).all()).toEqual([])
    expect(db.select().from(ingresos).all()).toEqual([])
  })

  it('turns monthly billing into its definition, with this month’s Periodo generado', async () => {
    const id = await expirada({ facturacion: 'mensual' })
    const f = aceptarTarde(db, root, id, HOY, {})
    expect(db.select().from(definicionesIngreso).all()).toMatchObject([{ tipo: 'mensual', periodoInicio: '2026-09', proyectoId: f.proyectoId }])
    expect(db.select().from(ingresos).all()).toMatchObject([{ periodo: '2026-09', proyectoId: f.proyectoId }])
  })

  it('refuses a Proyecto choice, since it creates its own', async () => {
    const id = await expirada()
    expect(() => aceptarTarde(db, root, id, HOY, { proyectoId: 'nuevo' })).toThrow('crea su propio proyecto')
    expect(fichaCotizacion(db, id).estado).toBe('expirada')
  })

  it('refuses any estado but expirada or rechazada', async () => {
    const { id } = guardarCotizacion(db, nueva({ validezDias: 90 }))
    expect(() => aceptarTarde(db, root, id, HOY, {})).toThrow('expirada o rechazada')
    await enviarCotizacion(db, root, id, imprimir)
    expect(() => aceptarTarde(db, root, id, HOY, {})).toThrow('expirada o rechazada')
  })
})

describe('Aceptación tardía de una Cotización importada', () => {
  it('links the chosen Proyecto, which keeps its estado and takes the categoría, with no Ingresos or Costos', () => {
    const zamora = proyectoDe()
    const id = importada({ folio: 290, nombre: 'Zamora Live' })

    const f = aceptarTarde(db, root, id, HOY, { proyectoId: zamora })
    expect(f).toMatchObject({ estado: 'aceptada', proyectoId: zamora })
    expect(db.select().from(proyectos).where(eq(proyectos.id, zamora)).get()).toMatchObject({ estado: 'completado', nombre: 'Zamora Live', categoria: 'website', fechaInicio: '2021-03-01' })
    expect(db.select().from(ingresos).all()).toEqual([])
    expect(db.select().from(costos).all()).toEqual([])
    expect(existsSync(join(root, 'Proyectos'))).toBe(false)
  })

  it('creates a completado Proyecto nuevo, marked imported, and asks where its files are', () => {
    const id = importada()
    const f = aceptarTarde(db, root, id, HOY, { proyectoId: 'nuevo' })
    expect(db.select().from(proyectos).where(eq(proyectos.id, f.proyectoId!)).get()).toMatchObject({
      nombre: 'Blog',
      contactoId,
      estado: 'completado',
      fechaInicio: '2021-03-01',
      categoria: 'website',
      importado: true
    })
    expect(sugerencias()).toMatchObject([{ entidad: 'proyecto', entidadId: f.proyectoId, accion: 'ubicacion' }])
    expect(db.select().from(ingresos).all()).toEqual([])
    expect(existsSync(join(root, 'Proyectos'))).toBe(false)
  })

  it('asks “¿Qué aceptó?” for a Cotización with several prices', () => {
    const id = importada({ items: [partida('Sitio', 3_000_000), partida('Logo', 1_200_000)], subtotal: 4_200_000, total: 4_200_000 })
    aceptarTarde(db, root, id, HOY, { proyectoId: 'nuevo' })
    expect(sugerencias().filter((s) => s.accion === 'partidas')).toMatchObject([{ entidad: 'cotizacion', entidadId: id }])
  })

  it('needs no tipo de cambio for a USD Cotización, and records no money', () => {
    const id = importada({ moneda: 'USD' })
    expect(aceptarTarde(db, root, id, HOY, { proyectoId: 'nuevo' }).estado).toBe('aceptada')
    expect(db.select().from(ingresos).all()).toEqual([])
  })

  it('refuses a Proyecto that is not an option, changing nothing', () => {
    const otra = importada({ folio: 100, estado: 'aceptada' })
    const tomado = proyectoDe({ cotizacionId: otra })
    const cancelado = proyectoDe({ estado: 'cancelado' })
    const id = importada()
    for (const proyectoId of [tomado, cancelado, 9999]) {
      expect(() => aceptarTarde(db, root, id, HOY, { proyectoId })).toThrow('ya no se puede elegir')
    }
    expect(() => aceptarTarde(db, root, id, HOY, {})).toThrow('Elige el proyecto')
    expect(fichaCotizacion(db, id)).toMatchObject({ estado: 'expirada', proyectoId: null })
  })
})

describe('después de la Aceptación tardía', () => {
  it('stays aceptada when the ledger is brought Al día again', async () => {
    const id = await expirada()
    const f = aceptarTarde(db, root, id, HOY, {})
    const siguiente = dbAlDia(db, '2026-09-30')
    expect(fichaCotizacion(siguiente, id)).toMatchObject({ estado: 'aceptada', proyectoId: f.proyectoId })
    expect(db.select().from(ingresos).all()).toHaveLength(1)
  })

  it('makes the Contacto a Cliente activo and raises the conversion', async () => {
    const id = await expirada()
    expect(listarCotizaciones(db).resumen.conversion).toBe(0)
    aceptarTarde(db, root, id, HOY, {})
    expect(listarContactos(db).contactos.find((c) => c.id === contactoId)?.estado).toBe('cliente_activo')
    expect(listarCotizaciones(db).resumen.conversion).toBe(100)
  })

  it('puts the pending Ingreso in Cobros, por facturar', async () => {
    aceptarTarde(db, root, await expirada(), HOY, {})
    expect(resumenFinanzas(db, 'mes', HOY, 30).cobros.porFacturar).toMatchObject([{ total: 4_640_000 }])
  })

  it('shows Sin ingresos registrados on a linked archived Proyecto until its Ingresos are entered', () => {
    const proyectoId = proyectoDe()
    db.insert(ubicacionesArchivo).values({ proyectoId, tipo: 'archivo', rutaRelativa: 'Archivo/Proyectos/Zamora Live' }).run()
    const id = importada({ subtotal: 5_000_000, total: 5_000_000 })
    aceptarTarde(db, root, id, HOY, { proyectoId })
    const sinIngresos = () => listarProyectos(db, root).proyectos.find((p) => p.id === proyectoId)?.sinIngresosRegistrados
    expect(sinIngresos()).toBe(true)

    db.insert(ingresos)
      .values({ contactoId, proyectoId, cotizacionId: id, estado: 'pagado', categoria: 'sin_factura', fechaPago: HOY, subtotal: 5_000_000, iva: 0, total: 5_000_000 })
      .run()
    expect(sinIngresos()).toBe(false)
  })

  it('cancels with Cancelación con pagos, and never returns to expirada', async () => {
    const id = await expirada()
    const { proyectoId } = aceptarTarde(db, root, id, HOY, {})
    expect(cancelarCotizacion(db, id).estado).toBe('cancelada')
    expect(db.select().from(proyectos).where(eq(proyectos.id, proyectoId!)).get()?.estado).toBe('cancelado')
    expect(db.select().from(ingresos).all().map((i) => i.estado)).toEqual(['cancelado'])
    expect(db.select().from(costos).all().map((c) => c.estado)).toEqual(['cancelado'])
    expect(fichaCotizacion(dbAlDia(db, '2026-10-01'), id).estado).toBe('cancelada')
  })

  it('offers no Cancelar on an imported Cotización whose Proyecto nuevo is completado', () => {
    const id = importada()
    expect(aceptarTarde(db, root, id, HOY, { proyectoId: 'nuevo' }).acciones).not.toContain('cancelar')
  })
})

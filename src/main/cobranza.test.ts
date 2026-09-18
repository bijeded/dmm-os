import { beforeEach, describe, expect, it } from 'vitest'
import { estadoCobro, estadosCobro } from './cobranza'
import { cotizaciones, ingresos } from './db/schema'
import { registrarReembolso } from './db/dominio'
import { contacto, db, ingresoBase, proyecto, reiniciarDb } from './db/test-db'

const hoy = '2026-09-18'
let contactoId: number

beforeEach(() => {
  reiniciarDb()
  contactoId = contacto('Clínica Sol').id
})

const cotizacion = (cambios: Partial<typeof cotizaciones.$inferInsert> = {}) =>
  db
    .insert(cotizaciones)
    .values({ contactoId, folio: 7, categoria: 'website', estado: 'aceptada', fecha: hoy, subtotal: 2000, iva: 320, total: 2320, ...cambios })
    .returning()
    .get()

const ingreso = (proyectoId: number, cambios: Partial<typeof ingresos.$inferInsert> = {}) =>
  db.insert(ingresos).values({ ...ingresoBase, categoria: 'sin_factura', proyectoId, estado: 'pagado', ...cambios }).run()

describe('estadoCobro', () => {
  it('a Proyecto with no Cotización and nothing pending is fully paid', () => {
    const p = proyecto(contactoId, null)
    expect(estadoCobro(db, p.id)).toEqual({ porCobrar: 0, cobrado: 0, pagadoCompleto: true, falta: null })
  })

  it('pending Ingresos keep it unpaid', () => {
    const p = proyecto(contactoId, null)
    ingreso(p.id, { estado: 'pendiente' })
    expect(estadoCobro(db, p.id)).toMatchObject({ porCobrar: 1000, pagadoCompleto: false, falta: { pendientes: 1, faltante: 0 } })
  })

  it('from a Cotización, paid Ingresos (parcialidades) must reach its total', () => {
    const p = proyecto(contactoId, cotizacion().id)
    ingreso(p.id)
    expect(estadoCobro(db, p.id).falta).toEqual({ pendientes: 0, faltante: 1160, moneda: 'MXN' })
    ingreso(p.id)
    expect(estadoCobro(db, p.id)).toMatchObject({ cobrado: 2000, pagadoCompleto: true, falta: null })
  })

  it('compares a USD Cotización by each Ingreso’s original USD amount', () => {
    const p = proyecto(contactoId, cotizacion({ moneda: 'USD', subtotal: 100, iva: 0, total: 100 }).id)
    ingreso(p.id, { subtotal: 900, iva: 0, total: 900, montoOriginal: 50, monedaOriginal: 'USD' })
    ingreso(p.id, { subtotal: 900, iva: 0, total: 900 })
    expect(estadoCobro(db, p.id).falta).toEqual({ pendientes: 0, faltante: 50, moneda: 'USD' })
  })

  it('a USD Reembolso counts against what a USD Cotización was paid', () => {
    const p = proyecto(contactoId, cotizacion({ moneda: 'USD', subtotal: 100, iva: 0, total: 100 }).id)
    const o = db
      .insert(ingresos)
      .values({ fechaRegistro: hoy, subtotal: 1800, total: 1800, montoOriginal: 100, monedaOriginal: 'USD', categoria: 'sin_factura', proyectoId: p.id, estado: 'pagado' })
      .returning()
      .get()
    expect(estadoCobro(db, p.id).pagadoCompleto).toBe(true)
    registrarReembolso(db, o.id, { subtotal: 540, iva: 0, fecha: hoy, montoOriginal: 30 })
    expect(estadoCobro(db, p.id).falta).toEqual({ pendientes: 0, faltante: 30, moneda: 'USD' })
  })

  it('compares an MXN Cotización by pesos, even when paid in USD', () => {
    const p = proyecto(contactoId, cotizacion().id)
    ingreso(p.id, { subtotal: 2000, iva: 320, total: 2320, montoOriginal: 120, monedaOriginal: 'USD' })
    expect(estadoCobro(db, p.id).pagadoCompleto).toBe(true)
  })

  it('a monthly Cotización has no total to reach', () => {
    const p = proyecto(contactoId, cotizacion({ facturacion: 'mensual' }).id)
    expect(estadoCobro(db, p.id).pagadoCompleto).toBe(true)
  })

  it('refuses a Proyecto that does not exist', () => {
    expect(() => estadoCobro(db, 99)).toThrow(/no existe/)
  })
})

describe('estadosCobro', () => {
  it('answers for many Proyectos what estadoCobro answers for each', () => {
    const conCotizacion = proyecto(contactoId, cotizacion().id)
    ingreso(conCotizacion.id)
    const sinCotizacion = proyecto(contactoId, null)
    ingreso(sinCotizacion.id, { estado: 'pendiente' })
    const vacio = proyecto(contactoId, cotizacion({ folio: 8 }).id)
    const ps = [conCotizacion, sinCotizacion, vacio]
    const todos = estadosCobro(db, ps)
    expect(ps.map((p) => todos.get(p.id))).toEqual(ps.map((p) => estadoCobro(db, p.id)))
  })

  it('reads nothing for no Proyectos', () => {
    expect(estadosCobro(db, []).size).toBe(0)
  })
})

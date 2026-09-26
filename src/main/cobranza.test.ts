import { beforeEach, describe, expect, it } from 'vitest'
import { estadoCobro, estadosCobro } from './cobranza'
import { cotizaciones, ingresos } from './db/schema'
import { reembolsar } from './movimientos'
import { planCobro } from './plan-cobro'
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

  it('counts an Ingreso paid in pesos against a USD Cotización at its tipo de cambio', () => {
    const p = proyecto(contactoId, cotizacion({ moneda: 'USD', subtotal: 100, iva: 0, total: 100, tipoCambio: 18 }).id)
    ingreso(p.id, { subtotal: 900, iva: 0, total: 900, montoOriginal: 50, monedaOriginal: 'USD' })
    ingreso(p.id, { subtotal: 900, iva: 0, total: 900 })
    expect(estadoCobro(db, p.id)).toMatchObject({ pagadoCompleto: true, falta: null })
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
    reembolsar(db, o.id, 30, hoy)
    expect(estadoCobro(db, p.id).falta).toEqual({ pendientes: 0, faltante: 30, moneda: 'USD' })
  })

  it('a Reembolso entered in USD stops a USD Cotización reading as fully paid', () => {
    const p = proyecto(contactoId, cotizacion({ moneda: 'USD', subtotal: 100, iva: 0, total: 100 }).id)
    const o = db
      .insert(ingresos)
      .values({ ...ingresoBase, categoria: 'sin_factura', proyectoId: p.id, estado: 'pagado', subtotal: 1800, iva: 0, total: 1800, montoOriginal: 100, monedaOriginal: 'USD' })
      .returning()
      .get()
    reembolsar(db, o.id, 30, hoy)
    expect(estadoCobro(db, p.id)).toMatchObject({ pagadoCompleto: false, falta: { pendientes: 0, faltante: 30, moneda: 'USD' } })
  })

  it('a USD quote paid one parcialidad short misses exactly what accepting planned for the rest', () => {
    const c = cotizacion({ moneda: 'USD', facturacion: 'parcialidades', parcialidades: 3, subtotal: 1000, iva: 161, total: 1161, tipoCambio: 18.37 })
    const p = proyecto(contactoId, c.id)
    const [primera, segunda, tercera] = planCobro(c, hoy, 18.37).ingresos
    for (const i of [primera, segunda]) ingreso(p.id, i)
    expect(estadoCobro(db, p.id).falta).toEqual({ pendientes: 0, faltante: tercera.montoOriginal, moneda: 'USD' })
  })

  it('compares an MXN Cotización by pesos, even when paid in USD', () => {
    const p = proyecto(contactoId, cotizacion().id)
    ingreso(p.id, { subtotal: 2000, iva: 320, total: 2320, montoOriginal: 120, monedaOriginal: 'USD' })
    expect(estadoCobro(db, p.id).pagadoCompleto).toBe(true)
  })

  it('Incobrable Ingresos settle the quote but are not cobrado', () => {
    const p = proyecto(contactoId, cotizacion({ subtotal: 900000, iva: 0, total: 900000 }).id)
    ingreso(p.id, { subtotal: 800000, iva: 0, total: 800000 })
    ingreso(p.id, { subtotal: 100000, iva: 0, total: 100000, estado: 'incobrable' })
    expect(estadoCobro(db, p.id)).toEqual({ porCobrar: 0, cobrado: 800000, pagadoCompleto: true, falta: null })
  })

  it('a USD quote is settled by paid and Incobrable USD amounts', () => {
    const p = proyecto(contactoId, cotizacion({ moneda: 'USD', subtotal: 100000, iva: 0, total: 100000, tipoCambio: 18.5 }).id)
    ingreso(p.id, { subtotal: 1665000, iva: 0, total: 1665000, montoOriginal: 90000, monedaOriginal: 'USD' })
    expect(estadoCobro(db, p.id).falta).toEqual({ pendientes: 0, faltante: 10000, moneda: 'USD' })
    ingreso(p.id, { subtotal: 185000, iva: 0, total: 185000, montoOriginal: 10000, monedaOriginal: 'USD', estado: 'incobrable' })
    expect(estadoCobro(db, p.id)).toMatchObject({ cobrado: 1665000, pagadoCompleto: true })
  })

  it('an Incobrable Ingreso on a Proyecto with no Cotización changes nothing', () => {
    const p = proyecto(contactoId, null)
    ingreso(p.id, { estado: 'incobrable' })
    expect(estadoCobro(db, p.id)).toEqual({ porCobrar: 0, cobrado: 0, pagadoCompleto: true, falta: null })
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

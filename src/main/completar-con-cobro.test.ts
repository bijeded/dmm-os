import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { MENSAJE_FECHA_FUTURA, MENSAJE_MONTO_EXCEDIDO, cobroValido, opcionesCobro, planCobro } from './completar-con-cobro'
import { cotizaciones, ingresos, proyectos } from './db/schema'
import { contacto, db, proyecto, reiniciarDb } from './db/test-db'
import { MENSAJE_MONTO } from '../shared/montos'
import type { CobroAlCompletar, OpcionesCobro } from '../shared/dominio'

const hoy = '2026-09-18'
let contactoId: number

beforeEach(() => {
  reiniciarDb()
  contactoId = contacto('Lukka').id
})

const cotizacion = (cambios: Partial<typeof cotizaciones.$inferInsert> = {}) =>
  db
    .insert(cotizaciones)
    .values({ contactoId, folio: 7, categoria: 'website', estado: 'aceptada', fecha: '2026-06-01', subtotal: 900_000, iva: 0, total: 900_000, ...cambios })
    .returning()
    .get()

const ingreso = (cambios: Partial<typeof ingresos.$inferInsert>) =>
  db
    .insert(ingresos)
    .values({
      categoria: 'factura',
      estado: 'pagado',
      subtotal: 900_000,
      iva: 144_000,
      total: 1_044_000,
      contactoId,
      fechaRegistro: '2026-07-01',
      ...cambios,
      estadoFacturacion: cambios.categoria === 'sin_factura' ? null : 'facturado'
    })
    .returning()
    .get()

describe('opcionesCobro', () => {
  it('shows what is missing after the pending Ingresos, in the Cotización currency', () => {
    const p = proyecto(contactoId, cotizacion({ subtotal: 1_000_000, iva: 160_000, total: 1_160_000 }).id)
    ingreso({ proyectoId: p.id, categoria: 'sin_factura', subtotal: 160_000, iva: 0, total: 160_000 })
    const pendiente = ingreso({ proyectoId: p.id, estado: 'pendiente', subtotal: 500_000, iva: 80_000, total: 580_000 })
    expect(opcionesCobro(db, p.id)).toEqual({
      moneda: 'MXN',
      subtotalCotizacion: 1_000_000,
      totalCotizacion: 1_160_000,
      saldado: 160_000,
      pendientes: [{ id: pendiente.id, fecha: '2026-07-01', categoria: 'factura', monto: 580_000 }],
      falta: 420_000,
      tipoCambio: null,
      facturas: []
    })
  })

  it('lists the Contacto’s invoices on no Proyecto, one per CFDI, subtotal matches first, then newest', () => {
    const p = proyecto(contactoId, cotizacion().id)
    const otro = proyecto(contactoId, null)
    ingreso({ cfdiUuid: 'VIEJA', fechaRegistro: '2026-06-10', subtotal: 900_000 })
    ingreso({ cfdiUuid: 'NUEVA', fechaRegistro: '2026-08-10', subtotal: 300_000, iva: 48_000, total: 348_000 })
    ingreso({ cfdiUuid: 'PPD', cfdiParcialidad: 1, fechaRegistro: '2026-07-10', subtotal: 450_000, iva: 72_000, total: 522_000 })
    ingreso({ cfdiUuid: 'PPD', cfdiParcialidad: 2, estado: 'pendiente', fechaRegistro: '2026-07-10', subtotal: 450_000, iva: 72_000, total: 522_000 })
    // Left out: on a Proyecto, cancelled, in USD, another Contacto's, or entered by hand.
    ingreso({ cfdiUuid: 'LIGADA', proyectoId: otro.id })
    ingreso({ cfdiUuid: 'CANCELADA', estado: 'cancelado' })
    ingreso({ cfdiUuid: 'USD', montoOriginal: 50_000, monedaOriginal: 'USD' })
    ingreso({ cfdiUuid: 'AJENA', contactoId: contacto('Hotel Aura').id })
    ingreso({})
    expect(opcionesCobro(db, p.id).facturas).toEqual([
      { cfdiUuid: 'PPD', fecha: '2026-07-10', subtotal: 900_000, total: 1_044_000, pendiente: true, coincide: true },
      { cfdiUuid: 'VIEJA', fecha: '2026-06-10', subtotal: 900_000, total: 1_044_000, pendiente: false, coincide: true },
      { cfdiUuid: 'NUEVA', fecha: '2026-08-10', subtotal: 300_000, total: 348_000, pendiente: false, coincide: false }
    ])
  })

  it('for a USD Cotización, lists only USD invoices by their USD amounts', () => {
    const p = proyecto(contactoId, cotizacion({ moneda: 'USD', subtotal: 100_000, iva: 0, total: 100_000, tipoCambio: 18.5 }).id)
    ingreso({ cfdiUuid: 'MXN' })
    ingreso({ cfdiUuid: 'USD', subtotal: 1_850_000, iva: 296_000, total: 2_146_000, montoOriginal: 116_000, monedaOriginal: 'USD' })
    const o = opcionesCobro(db, p.id)
    expect(o).toMatchObject({ moneda: 'USD', falta: 100_000, tipoCambio: 18.5 })
    expect(o.facturas).toEqual([{ cfdiUuid: 'USD', fecha: '2026-07-01', subtotal: 100_000, total: 116_000, pendiente: false, coincide: true }])
  })

  it('a Proyecto with no Cotización or Contacto misses nothing but its pending Ingresos', () => {
    const p = db.insert(proyectos).values({ nombre: 'Portafolio', etiqueta: 'personal', contactoId: null, categoria: 'ai' }).returning().get()
    ingreso({ proyectoId: p.id, contactoId: null, estado: 'pendiente' })
    expect(opcionesCobro(db, p.id)).toMatchObject({ subtotalCotizacion: null, totalCotizacion: null, falta: 0, facturas: [], pendientes: [{ monto: 1_044_000 }] })
  })

  it('refuses a Proyecto whose estado allows no Completar', () => {
    const p = proyecto(contactoId, cotizacion().id)
    db.update(proyectos).set({ estado: 'cancelado' }).where(eq(proyectos.id, p.id)).run()
    expect(() => opcionesCobro(db, p.id)).toThrow('Solo un proyecto en curso o pausado se puede completar')
  })
})

describe('planCobro', () => {
  const o = (cambios: Partial<OpcionesCobro> = {}): OpcionesCobro => ({
    moneda: 'MXN',
    subtotalCotizacion: 900_000,
    totalCotizacion: 900_000,
    saldado: 0,
    pendientes: [],
    falta: 900_000,
    tipoCambio: null,
    facturas: [],
    ...cambios
  })
  const cobro = (cambios: Partial<CobroAlCompletar> = {}): CobroAlCompletar => ({
    fecha: '2026-09-15',
    incobrables: [],
    pago: { tipo: 'sin_factura', monto: 900_000 },
    tipoCambio: null,
    ...cambios
  })
  const pagado = { estado: 'pagado', categoria: 'sin_factura', estadoFacturacion: null, iva: 0, retenciones: 0, montoOriginal: null, monedaOriginal: null }

  it('sin factura: one paid uninvoiced Ingreso of what was received, no IVA', () => {
    expect(planCobro(o(), cobro({ fecha: hoy }), hoy)).toEqual({
      fecha: hoy,
      pagar: [],
      incobrables: [],
      nuevos: [{ ...pagado, subtotal: 900_000, total: 900_000 }],
      cfdi: null
    })
  })

  it('a partial amount leaves the rest Incobrable', () => {
    expect(planCobro(o(), cobro({ pago: { tipo: 'sin_factura', monto: 800_000 } }), hoy).nuevos).toEqual([
      { ...pagado, subtotal: 800_000, total: 800_000 },
      { ...pagado, estado: 'incobrable', subtotal: 100_000, total: 100_000 }
    ])
  })

  it('USD: converts at the dialog’s rate and keeps the USD amount', () => {
    const usd = o({ moneda: 'USD', subtotalCotizacion: 100_000, totalCotizacion: 100_000, falta: 100_000, tipoCambio: 17.9 })
    expect(planCobro(usd, cobro({ pago: { tipo: 'sin_factura', monto: 90_000 }, tipoCambio: 18.5 }), hoy).nuevos).toEqual([
      { ...pagado, subtotal: 1_665_000, total: 1_665_000, montoOriginal: 90_000, monedaOriginal: 'USD' },
      { ...pagado, estado: 'incobrable', subtotal: 185_000, total: 185_000, montoOriginal: 10_000, monedaOriginal: 'USD' }
    ])
  })

  it('an invoice not on disk has 16% IVA inside its total unless turned off', () => {
    const [conIva] = planCobro(o({ falta: 1_160_000 }), cobro({ pago: { tipo: 'factura_fuera_de_disco', monto: 1_160_000, conIva: true } }), hoy).nuevos
    expect(conIva).toMatchObject({ categoria: 'factura', estadoFacturacion: 'facturado', estado: 'pagado', subtotal: 1_000_000, iva: 160_000, total: 1_160_000 })
    const [sinIva] = planCobro(o(), cobro({ pago: { tipo: 'factura_fuera_de_disco', monto: 900_000, conIva: false } }), hoy).nuevos
    expect(sinIva).toMatchObject({ categoria: 'factura', subtotal: 900_000, iva: 0, total: 900_000 })
  })

  it('an odd total balances exactly', () => {
    const [n] = planCobro(o(), cobro({ pago: { tipo: 'factura_fuera_de_disco', monto: 100_001, conIva: true } }), hoy).nuevos
    expect(n.subtotal + n.iva).toBe(100_001)
  })

  it('con factura: links the CFDI and creates nothing, unless it falls short', () => {
    const facturas = [{ cfdiUuid: 'A', fecha: '2026-07-01', subtotal: 900_000, total: 1_044_000, pendiente: false, coincide: true }]
    expect(planCobro(o({ facturas }), cobro({ pago: { tipo: 'cfdi', cfdiUuid: 'A' } }), hoy)).toMatchObject({ nuevos: [], cfdi: 'A' })
    const corta = [{ ...facturas[0], total: 800_000 }]
    expect(planCobro(o({ facturas: corta }), cobro({ pago: { tipo: 'cfdi', cfdiUuid: 'A' } }), hoy).nuevos).toEqual([{ ...pagado, estado: 'incobrable', subtotal: 100_000, total: 100_000 }])
  })

  it('pending Ingresos are paid or Incobrable, and ¿Con factura? is not needed when they cover everything', () => {
    const pendientes = [
      { id: 1, fecha: null, categoria: 'factura' as const, monto: 580_000 },
      { id: 2, fecha: null, categoria: 'factura' as const, monto: 580_000 }
    ]
    expect(planCobro(o({ pendientes, falta: 0 }), cobro({ incobrables: [2], pago: null }), hoy)).toEqual({
      fecha: '2026-09-15',
      pagar: [1],
      incobrables: [2],
      nuevos: [],
      cfdi: null
    })
  })

  it('refuses what the dialog does not allow', () => {
    const factura = { cfdiUuid: 'A', fecha: '2026-07-01', subtotal: 1, total: 1, pendiente: false, coincide: false }
    const casos: [OpcionesCobro, CobroAlCompletar, string][] = [
      [o(), cobro({ fecha: '2026-09-19' }), MENSAJE_FECHA_FUTURA],
      [o(), cobro({ fecha: '20-09-2026' }), 'La fecha no es válida'],
      [o(), cobro({ pago: null }), 'Indica si el pago fue con factura'],
      [o(), cobro({ pago: { tipo: 'sin_factura', monto: 900_001 } }), MENSAJE_MONTO_EXCEDIDO],
      [o(), cobro({ pago: { tipo: 'sin_factura', monto: 0 } }), MENSAJE_MONTO],
      [o({ facturas: [factura] }), cobro({ pago: { tipo: 'cfdi', cfdiUuid: 'B' } }), 'Esa factura ya no se puede vincular'],
      [o(), cobro({ incobrables: [5] }), 'Ese ingreso ya no está pendiente'],
      [o({ moneda: 'USD' }), cobro({ tipoCambio: null }), 'Escribe el tipo de cambio'],
      [o({ moneda: 'USD' }), cobro({ tipoCambio: 0 }), 'Escribe el tipo de cambio']
    ]
    for (const [opciones, respuesta, mensaje] of casos) expect(() => planCobro(opciones, respuesta, hoy), mensaje).toThrow(mensaje)
  })
})

describe('cobroValido', () => {
  it('passes the dialog’s answer through, and refuses any other shape', () => {
    const bueno = { fecha: hoy, incobrables: [1], pago: { tipo: 'cfdi', cfdiUuid: 'A' }, tipoCambio: null }
    expect(cobroValido(bueno)).toBe(bueno)
    for (const malo of [null, 'x', { ...bueno, fecha: 1 }, { ...bueno, incobrables: [1.5] }, { ...bueno, pago: { tipo: 'sin_factura', monto: '9' } }, { ...bueno, tipoCambio: '18' }])
      expect(() => cobroValido(malo)).toThrow('Cobro no válido')
  })
})

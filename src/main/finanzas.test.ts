import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { costos, definicionesCosto, ingresos } from './db/schema'
import { contacto, db, reiniciarDb } from './db/test-db'
import { rangos, resumenFinanzas } from './finanzas'
import { borrarCosto, borrarIngreso, cancelarIngreso, detenerCosto, nuevoCosto, nuevoIngreso, pagarIngreso, reembolsar } from './movimientos'
import type { CostoNuevo, IngresoNuevo } from '../shared/dominio'

const hoy = '2026-09-18'
let contactoId: number

beforeEach(() => {
  reiniciarDb()
  contactoId = contacto('Clínica Sol').id
})

const ingreso = (cambios: Partial<IngresoNuevo> = {}): IngresoNuevo => ({
  categoria: 'sin_factura',
  facturado: false,
  contactoId,
  proyectoId: null,
  fecha: '2026-09-02',
  subtotal: 10000,
  conIva: false,
  pagado: true,
  notas: null,
  ...cambios
})

const costo = (cambios: Partial<CostoNuevo> = {}): CostoNuevo => ({
  nombre: 'Hosting',
  proveedor: 'Hostinger',
  referencia: null,
  categoria: 'unico',
  proyectoId: null,
  fecha: '2026-09-05',
  subtotal: 2000,
  conIva: true,
  parcialidades: null,
  suscripcionIa: false,
  pagado: true,
  ...cambios
})

/** An invoice as the Facturas run leaves it: facturado and paid on its date. */
const cfdi = (fechaRegistro: string, subtotal = 5000) =>
  db
    .insert(ingresos)
    .values({ categoria: 'factura', estadoFacturacion: 'facturado', estado: 'pagado', subtotal, iva: subtotal * 0.16, total: subtotal * 1.16, contactoId, fechaRegistro, fechaPago: fechaRegistro, cfdiUuid: fechaRegistro })
    .returning()
    .get()

/** An invoice issued by hand and still unpaid: what can become Cobranza vencida. */
const facturaPendiente = (fechaRegistro: string, subtotal = 5000) =>
  db
    .insert(ingresos)
    .values({ categoria: 'factura', estadoFacturacion: 'facturado', subtotal, iva: 0, total: subtotal, contactoId, fechaRegistro })
    .returning()
    .get()

describe('rangos', () => {
  it('compares a period to date against the same days a year earlier', () => {
    expect(rangos('mes', hoy)).toEqual({ rango: { desde: '2026-09-01', hasta: hoy }, anterior: { desde: '2025-09-01', hasta: '2025-09-18' } })
    expect(rangos('trimestre', hoy).rango.desde).toBe('2026-07-01')
    expect(rangos('anio', hoy).anterior).toEqual({ desde: '2025-01-01', hasta: '2025-09-18' })
  })

  it('compares the last five years with the five before, and all time with nothing', () => {
    expect(rangos('cinco_anios', hoy)).toEqual({ rango: { desde: '2022-01-01', hasta: hoy }, anterior: { desde: '2017-01-01', hasta: '2021-09-18' } })
    expect(rangos('todo', hoy).anterior).toBeNull()
  })

  it('shifts a leap day to the last day of February', () => {
    expect(rangos('mes', '2028-02-29').anterior).toEqual({ desde: '2027-02-01', hasta: '2027-02-28' })
  })
})

describe('resumen', () => {
  it('reads revenue, costs and profit as subtotals, IVA apart, against last year', () => {
    nuevoIngreso(db, ingreso({ subtotal: 10000 }), hoy)
    cfdi('2026-03-10', 5000)
    cfdi('2025-03-10', 4000)
    nuevoCosto(db, costo({ subtotal: 2000, conIva: true }), hoy)
    nuevoCosto(db, costo({ fecha: '2025-06-01', subtotal: 1000, conIva: false }), hoy)

    const r = resumenFinanzas(db, 'anio', hoy, 30)
    expect(r.actual).toEqual({ ingresos: 15000, ingresosFactura: 5000, ingresosSinFactura: 10000, ivaIngresos: 800, costos: 2000, ivaCostos: 320, utilidad: 13000 })
    expect(r.anterior).toMatchObject({ ingresos: 4000, costos: 1000, utilidad: 3000 })
  })

  it('shows Sin datos for profit when a year of the span has no Costos', () => {
    cfdi('2025-03-10', 4000)
    nuevoCosto(db, costo(), hoy)
    const r = resumenFinanzas(db, 'anio', hoy, 30)
    expect(r.actual.utilidad).not.toBeNull()
    expect(r.anterior?.utilidad).toBeNull()
    expect(r.sinDatos).toEqual([2025])
  })

  it('leaves out cancelled Ingresos and Costos, and invoices not yet dated', () => {
    const i = facturaPendiente('2026-04-01')
    cancelarIngreso(db, i.id)
    db.insert(ingresos).values({ categoria: 'factura', estadoFacturacion: 'por_facturar', subtotal: 9000, iva: 0, total: 9000, contactoId }).run()
    nuevoCosto(db, costo({ pagado: false }), hoy)
    db.update(costos).set({ estado: 'cancelado' }).run()
    expect(resumenFinanzas(db, 'anio', hoy, 30).actual).toMatchObject({ ingresos: 0, costos: 0 })
  })

  it('charts a year by month up to this one, last year alongside', () => {
    cfdi('2026-03-10', 5000)
    cfdi('2025-03-10', 4000)
    const { serie } = resumenFinanzas(db, 'anio', hoy, 30)
    expect(serie).toHaveLength(9)
    expect(serie[2]).toEqual({ etiqueta: 'mar', ingresos: 5000, costos: 0, ingresosAnterior: 4000, costosAnterior: 0 })
  })

  it('charts all time by year, with nothing to compare', () => {
    cfdi('2024-03-10', 4000)
    const { serie, rango } = resumenFinanzas(db, 'todo', hoy, 30)
    expect(rango.desde).toBe('2024-01-01')
    expect(serie.map((p) => p.etiqueta)).toEqual(['2024', '2025', '2026'])
    expect(serie[0].ingresosAnterior).toBeNull()
  })
})

describe('Cobranza vencida', () => {
  it('is an invoiced, unpaid Ingreso older than the configured days', () => {
    facturaPendiente('2026-08-01')
    facturaPendiente('2026-09-10')
    cfdi('2026-07-01')
    nuevoIngreso(db, ingreso({ fecha: '2026-01-01', pagado: false }), hoy)
    const { cobranza } = resumenFinanzas(db, 'mes', hoy, 30)
    expect(cobranza.map((i) => [i.fecha, i.vencida])).toEqual([
      ['2026-01-01', false],
      ['2026-08-01', true],
      ['2026-09-10', false]
    ])
    expect(resumenFinanzas(db, 'mes', hoy, 60).cobranza.some((i) => i.vencida)).toBe(false)
  })

  it('leaves Cobranza once paid, and is Cobrado on the day it was paid', () => {
    const i = facturaPendiente('2026-08-01')
    pagarIngreso(db, i.id, hoy)
    const r = resumenFinanzas(db, 'mes', hoy, 30)
    expect(r.cobranza).toEqual([])
    expect(r.cobrado.map((f) => [f.id, f.fecha, f.estado])).toEqual([[i.id, hoy, 'pagado']])
  })
})

describe('Cobrado', () => {
  it('lists the money collected in the period, never what is pending', () => {
    const pagada = cfdi('2026-09-03')
    cfdi('2026-08-03')
    facturaPendiente('2026-09-04')
    nuevoIngreso(db, ingreso({ fecha: '2026-09-05' }), hoy)
    const { cobrado } = resumenFinanzas(db, 'mes', hoy, 30)
    expect(cobrado.map((f) => f.fecha)).toEqual(['2026-09-05', '2026-09-03'])
    expect(cobrado.find((f) => f.id === pagada.id)?.origen).toBe('cfdi')
  })

  it("dates an Ingreso the day it was paid in the period's figures too, so Cobrado never exceeds them", () => {
    nuevoIngreso(db, ingreso({ fecha: '2026-08-20', pagado: false }), hoy)
    const [pendiente] = db.select().from(ingresos).all()
    pagarIngreso(db, pendiente.id, '2026-09-10')
    const septiembre = resumenFinanzas(db, 'mes', hoy, 30)
    expect(septiembre.cobrado.map((f) => f.id)).toEqual([pendiente.id])
    expect(septiembre.actual.ingresos).toBe(10000)
    expect(resumenFinanzas(db, 'mes', '2026-08-31', 30).actual.ingresos).toBe(0)
  })
})

describe('recurring and installment Costos', () => {
  it('generates a monthly Costo per period up to this month', () => {
    nuevoCosto(db, costo({ nombre: 'Claude Max', categoria: 'mensual', fecha: '2026-07-05', subtotal: 170000, conIva: false, suscripcionIa: true }), hoy)
    const r = resumenFinanzas(db, 'anio', hoy, 30)
    expect(r.costos.map((c) => [c.fecha, c.origen])).toEqual([
      ['2026-09-05', 'recurrente'],
      ['2026-08-05', 'recurrente'],
      ['2026-07-05', 'recurrente']
    ])
    expect(r.actual.costos).toBe(510000)
  })

  it('runs an MSI to its installment count and lists the next one as an upcoming payment', () => {
    nuevoCosto(db, costo({ nombre: 'MacBook Pro', categoria: 'msi', parcialidades: 18, fecha: '2026-08-12', subtotal: 250000, conIva: false }), hoy)
    const r = resumenFinanzas(db, 'anio', hoy, 30)
    expect(r.costosPendientes.map((c) => c.fecha)).toEqual(['2026-08-12', '2026-09-12'])
    expect(r.proximosPagos[0]).toMatchObject({ fecha: '2026-10-12', nombre: 'MacBook Pro', total: 250000 })
    expect(r.costosPendientes[0].acciones).not.toContain('detener')
  })

  it('stops a monthly series after this month', () => {
    nuevoCosto(db, costo({ categoria: 'mensual', fecha: '2026-08-05' }), hoy)
    const [c] = resumenFinanzas(db, 'anio', hoy, 30).costos
    expect(c.acciones).toContain('detener')
    detenerCosto(db, c.id, hoy)
    expect(db.select().from(definicionesCosto).get()?.periodoFin).toBe('2026-09')
    expect(resumenFinanzas(db, 'anio', hoy, 30).proximosPagos).toEqual([])
  })
})

describe('IVA of a hand-entered Ingreso or Costo', () => {
  it('adds 16% on top, rounded to the centavo, only when asked', () => {
    nuevoCosto(db, costo({ subtotal: 1003, conIva: true }), hoy)
    nuevoCosto(db, costo({ subtotal: 1003, conIva: false }), hoy)
    nuevoIngreso(db, ingreso({ categoria: 'factura', subtotal: 1003, conIva: true }), hoy)
    expect(db.select().from(costos).all().map((c) => [c.iva, c.total])).toEqual([[160, 1163], [0, 1003]])
    expect(db.select().from(ingresos).get()).toMatchObject({ iva: 160, total: 1163 })
  })

  it('never puts IVA on uninvoiced income', () => {
    nuevoIngreso(db, ingreso({ categoria: 'sin_factura', subtotal: 1000, conIva: true }), hoy)
    expect(db.select().from(ingresos).get()).toMatchObject({ iva: 0, total: 1000 })
  })
})

describe('Reembolso', () => {
  const usdPagado = (cambios: Partial<typeof ingresos.$inferInsert> = {}) =>
    db
      .insert(ingresos)
      .values({ categoria: 'sin_factura', estado: 'pagado', subtotal: 170000, iva: 0, total: 170000, montoOriginal: 10000, monedaOriginal: 'USD', fechaRegistro: '2026-09-01', fechaPago: '2026-09-01', ...cambios })
      .returning()
      .get()
  const reembolsoDe = (id: number) => db.select().from(ingresos).where(eq(ingresos.reembolsoDeId, id)).all()

  it('is a negative paid Ingreso dated today', () => {
    nuevoIngreso(db, ingreso({ fecha: '2025-12-01', subtotal: 10000 }), hoy)
    const i = db.select().from(ingresos).get()!
    reembolsar(db, i.id, 3000, hoy)
    const r = resumenFinanzas(db, 'mes', hoy, 30)
    expect(r.actual.ingresos).toBe(-3000)
    expect(r.ingresos[0]).toMatchObject({ total: -3000, reembolsoDeId: i.id, estado: 'pagado', fecha: hoy })
  })

  it('gives back IVA in the Ingreso’s proportion', () => {
    const i = db
      .insert(ingresos)
      .values({ categoria: 'factura', estadoFacturacion: 'facturado', estado: 'pagado', subtotal: 10000, iva: 1600, total: 11600, fechaRegistro: '2026-09-01', fechaPago: '2026-09-01' })
      .returning()
      .get()
    reembolsar(db, i.id, 5800, hoy)
    expect(reembolsoDe(i.id)[0]).toMatchObject({ subtotal: -5000, iva: -800, total: -5800 })
  })

  it('takes a USD Ingreso’s amount in USD and converts at its own rate', () => {
    const usd = usdPagado()
    reembolsar(db, usd.id, 1000, hoy)
    expect(reembolsoDe(usd.id)[0]).toMatchObject({ total: -17000, montoOriginal: -1000, monedaOriginal: 'USD' })
    expect(resumenFinanzas(db, 'mes', hoy, 30).ingresos.find((f) => f.id === usd.id)).toMatchObject({ moneda: 'USD', reembolsable: 9000 })
  })

  it('giving back all that is left leaves nothing, in pesos, IVA and USD', () => {
    const usd = usdPagado({ subtotal: 100000, iva: 16001, total: 116001, montoOriginal: 6667 })
    reembolsar(db, usd.id, 3333, hoy)
    reembolsar(db, usd.id, 3334, hoy)
    const suma = (f: (i: typeof usd) => number) => [usd, ...reembolsoDe(usd.id)].reduce((s, i) => s + f(i), 0)
    expect([suma((i) => i.total), suma((i) => i.iva), suma((i) => i.montoOriginal!)]).toEqual([0, 0, 0])
    expect(resumenFinanzas(db, 'mes', hoy, 30).ingresos.find((f) => f.id === usd.id)?.acciones).not.toContain('reembolsar')
  })

  it('never gives back more than was paid, in the Ingreso’s currency, nor from an unpaid Ingreso', () => {
    nuevoIngreso(db, ingreso({ subtotal: 10000 }), hoy)
    const i = db.select().from(ingresos).get()!
    reembolsar(db, i.id, 8000, hoy)
    expect(() => reembolsar(db, i.id, 3000, hoy)).toThrow(/más de lo pagado/)
    const usd = usdPagado()
    expect(() => reembolsar(db, usd.id, 10001, hoy)).toThrow(/más de lo pagado/)
    const pendiente = facturaPendiente('2026-09-01')
    expect(() => reembolsar(db, pendiente.id, 100, hoy)).toThrow(/pagado/)
    expect(() => reembolsar(db, i.id, 0, hoy)).toThrow(/mayor a cero/)
  })
})

describe('Borrar vs cancelar', () => {
  it('deletes a hand-entered Ingreso or one-time Costo', () => {
    nuevoIngreso(db, ingreso(), hoy)
    nuevoCosto(db, costo(), hoy)
    borrarIngreso(db, db.select().from(ingresos).get()!.id)
    borrarCosto(db, db.select().from(costos).get()!.id, hoy)
    expect(db.select().from(ingresos).all()).toEqual([])
    expect(db.select().from(costos).all()).toEqual([])
  })

  it('refuses to delete an imported Ingreso, one with a Reembolso, or a generated Costo', () => {
    const importado = cfdi('2026-09-01')
    expect(() => borrarIngreso(db, importado.id)).toThrow(/cancélalo/)
    nuevoIngreso(db, ingreso(), hoy)
    const manual = db.select().from(ingresos).where(eq(ingresos.categoria, 'sin_factura')).get()!
    reembolsar(db, manual.id, 100, hoy)
    expect(() => borrarIngreso(db, manual.id)).toThrow(/cancélalo/)
    nuevoCosto(db, costo({ categoria: 'mensual' }), hoy)
    const [generado] = resumenFinanzas(db, 'mes', hoy, 30).costos
    expect(() => borrarCosto(db, generado.id, hoy)).toThrow(/cancélalo/)
  })

  it('offers only the actions each record allows', () => {
    cfdi('2026-09-01')
    nuevoIngreso(db, ingreso(), hoy)
    const r = resumenFinanzas(db, 'mes', hoy, 30)
    const porOrigen = Object.fromEntries(r.ingresos.map((i) => [i.origen, i.acciones]))
    expect(porOrigen.cfdi).toEqual(['reembolsar'])
    expect(porOrigen.manual).toEqual(['borrar', 'reembolsar'])
  })
})

describe('nuevo', () => {
  it('refuses an Ingreso without an amount, a Costo without a name, an MSI without installments', () => {
    expect(() => nuevoIngreso(db, ingreso({ subtotal: 0 }), hoy)).toThrow(/monto/)
    expect(() => nuevoCosto(db, costo({ nombre: ' ' }), hoy)).toThrow(/nombre/)
    expect(() => nuevoCosto(db, costo({ categoria: 'msi', parcialidades: null }), hoy)).toThrow(/parcialidades/)
  })
})

describe('Inicio figures', () => {
  const pendiente = (cambios: Partial<IngresoNuevo>) => {
    nuevoIngreso(db, ingreso({ pagado: false, ...cambios }), hoy)
    return db.select().from(ingresos).all().at(-1)!
  }

  it('reads Ingreso real from what was paid, Reembolsos netted in, and Utilidad real as real − costos', () => {
    nuevoIngreso(db, ingreso({ fecha: '2026-09-02', subtotal: 10000 }), hoy)
    pendiente({ fecha: '2026-09-03', subtotal: 4000 })
    const [pagado] = db.select().from(ingresos).all()
    reembolsar(db, pagado.id, 3000, hoy)
    nuevoCosto(db, costo({ subtotal: 2000 }), hoy)
    const r = resumenFinanzas(db, 'mes', hoy, 30)
    expect(r.actual.ingresos).toBe(11000)
    expect(r.real).toBe(7000)
    expect(r.utilidadReal).toBe(5000)
  })

  it('shows Sin datos for Utilidad real when the year has no Costos', () => {
    nuevoIngreso(db, ingreso(), hoy)
    const r = resumenFinanzas(db, 'mes', hoy, 30)
    expect(r.real).toBe(10000)
    expect(r.utilidadReal).toBeNull()
  })

  it('puts each pending Ingreso up to this month into exactly one Cobros tab', () => {
    const anterior = pendiente({ fecha: '2026-01-10' })
    const vencida = facturaPendiente('2026-08-01')
    const reciente = facturaPendiente('2026-08-25')
    const porFacturar = pendiente({ categoria: 'factura', facturado: false, fecha: '2026-09-04' })
    const sinFecha = db
      .insert(ingresos)
      .values({ categoria: 'factura', estadoFacturacion: 'por_facturar', subtotal: 5000, iva: 0, total: 5000, contactoId })
      .returning()
      .get()
    pendiente({ fecha: '2026-10-05' })
    pendiente({ categoria: 'factura', facturado: false, fecha: '2026-10-06' })
    const ids = (fs: { id: number }[]) => fs.map((f) => f.id).sort((a, b) => a - b)
    const { cobros } = resumenFinanzas(db, 'mes', hoy, 30)
    expect(ids(cobros.mes)).toEqual([anterior.id, reciente.id])
    expect(ids(cobros.vencidos)).toEqual([vencida.id])
    expect(ids(cobros.porFacturar)).toEqual([porFacturar.id, sinFecha.id])
  })
})

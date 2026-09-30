import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { costos, cotizaciones, definicionesCosto, definicionesIngreso, ingresos, proyectos } from './db/schema'
import { cambiarContacto } from './atribucion'
import { generarPeriodos } from './db/periodos'
import { contacto, cotizacionAceptada, db, proyecto, reiniciarDb } from './db/test-db'
import { rangos, resumenFinanzas } from './finanzas'
import { bloqueosIngreso, exigirIngreso } from './ciclo-ingreso'
import { dbAlDia } from './ledger'
import { borrarCosto, borrarIngreso, cancelarIngreso, detenerCosto, editarIngreso, ingresoParaEditar, nuevoCosto, nuevoIngreso, pagarIngreso, reembolsar } from './movimientos'
import type { CostoNuevo, IngresoEditado, IngresoNuevo } from '../shared/dominio'

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
    expect(r.actual).toEqual({ ingresos: 15000, ingresosFactura: 5000, ingresosSinFactura: 10000, ivaIngresos: 800, retencionesIngresos: 0, costos: 2000, ivaCostos: 320, retencionesCostos: 0, utilidad: 13000 })
    expect(r.anterior).toMatchObject({ ingresos: 4000, costos: 1000, utilidad: 3000 })
  })

  it('reads the same figures once a Cotización expires', () => {
    const c = db
      .insert(cotizaciones)
      .values({ contactoId, folio: 1, categoria: 'website', estado: 'enviada', fecha: '2026-08-01', validezDias: 15 })
      .returning()
      .get()
    db.insert(ingresos).values({ categoria: 'sin_factura', subtotal: 3000, iva: 0, total: 3000, contactoId, cotizacionId: c.id, fechaRegistro: '2026-09-01' }).run()
    nuevoIngreso(db, ingreso({ subtotal: 10000 }), hoy)

    const r = resumenFinanzas(dbAlDia(db, hoy), 'anio', hoy, 30)
    expect(db.select().from(cotizaciones).where(eq(cotizaciones.id, c.id)).get()!.estado).toBe('expirada')
    expect(r.actual).toMatchObject({ ingresos: 13000, ingresosSinFactura: 13000 })
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

describe('Incobrable', () => {
  const incobrable = (cambios: Partial<typeof ingresos.$inferInsert> = {}) =>
    db
      .insert(ingresos)
      .values({ categoria: 'sin_factura', estado: 'incobrable', subtotal: 1000, iva: 0, total: 1000, contactoId, fechaRegistro: '2026-09-10', ...cambios })
      .returning()
      .get()

  it('counts in no figure, in MXN or USD, but is listed as Incobrable', () => {
    nuevoIngreso(db, ingreso({ subtotal: 8000, fecha: '2026-09-10' }), hoy)
    incobrable()
    incobrable({ subtotal: 1850, total: 1850, montoOriginal: 100, monedaOriginal: 'USD' })
    const r = resumenFinanzas(db, 'mes', hoy, 30)
    expect(r.actual).toMatchObject({ ingresos: 8000, ingresosSinFactura: 8000, ivaIngresos: 0 })
    expect(r.real).toBe(8000)
    expect(r.serie.reduce((s, p) => s + p.ingresos, 0)).toBe(8000)
    expect(r.cobranza).toEqual([])
    expect(Object.values(r.cobros).flat()).toEqual([])
    expect(r.ingresos.filter((i) => i.estado === 'incobrable')).toHaveLength(2)
  })

  it('offers only Eliminar and Editar on its row, and deleting it removes it', () => {
    const i = incobrable()
    expect(resumenFinanzas(db, 'mes', hoy, 30).ingresos.find((f) => f.id === i.id)!.acciones).toEqual(['borrar', 'editar'])
    borrarIngreso(db, i.id)
    expect(resumenFinanzas(db, 'mes', hoy, 30).ingresos).toEqual([])
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

  it('gives back retenciones in the Ingreso’s proportion, and exactly what is left at the end', () => {
    const i = db
      .insert(ingresos)
      .values({ categoria: 'factura', estadoFacturacion: 'facturado', estado: 'pagado', subtotal: 10001, iva: 1600, retenciones: 1067, total: 10534, fechaRegistro: '2026-09-01', fechaPago: '2026-09-01' })
      .returning()
      .get()
    reembolsar(db, i.id, 5267, hoy)
    expect(reembolsoDe(i.id)[0]).toMatchObject({ subtotal: -5001, iva: -800, retenciones: -534, total: -5267 })
    reembolsar(db, i.id, 5267, hoy)
    const suma = (f: (r: typeof i) => number) => [i, ...reembolsoDe(i.id)].reduce((s, r) => s + f(r), 0)
    expect([suma((r) => r.subtotal), suma((r) => r.iva), suma((r) => r.retenciones), suma((r) => r.total)]).toEqual([0, 0, 0, 0])
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
    expect(porOrigen.cfdi).toEqual(['reembolsar', 'asignarProyecto'])
    expect(porOrigen.manual).toEqual(['borrar', 'reembolsar', 'editar'])
  })
})

describe('nuevo', () => {
  it('refuses an Ingreso without an amount, a Costo without a name, an MSI without installments', () => {
    expect(() => nuevoIngreso(db, ingreso({ subtotal: 0 }), hoy)).toThrow(/monto/)
    expect(() => nuevoCosto(db, costo({ nombre: ' ' }), hoy)).toThrow(/nombre/)
    expect(() => nuevoCosto(db, costo({ categoria: 'msi', parcialidades: null }), hoy)).toThrow(/parcialidades/)
  })
})

describe('a Proyecto sin Contacto', () => {
  it('names the Proyecto of an Ingreso linked to it, which takes the Proyecto’s missing Contacto, and counts it', () => {
    const p = db.insert(proyectos).values({ nombre: 'Activista', categoria: 'other', importado: true }).returning().get()
    nuevoIngreso(db, ingreso({ proyectoId: p.id }), hoy)
    const r = resumenFinanzas(db, 'mes', hoy, 30)
    expect(r.ingresos).toEqual([expect.objectContaining({ proyecto: 'Activista', contacto: null, subtotal: 10000 })])
    expect(r.actual.ingresos).toBe(10000)
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

describe('Asignar proyecto in the Ingresos list', () => {
  it('is offered only on imported invoices that are not cancelled and not Reembolsos', () => {
    const factura = (uuid: string, estado: 'pagado' | 'cancelado' = 'pagado') =>
      db
        .insert(ingresos)
        .values({ categoria: 'factura', estadoFacturacion: 'facturado', estado, cfdiUuid: uuid, subtotal: 10000, iva: 1600, total: 11600, contactoId, fechaRegistro: '2026-09-01', fechaPago: '2026-09-01' })
        .returning()
        .get()
    const importada = factura('a')
    factura('b', 'cancelado')
    nuevoIngreso(db, ingreso(), hoy)
    reembolsar(db, importada.id, 1160, hoy)
    const filas = resumenFinanzas(db, 'mes', hoy, 30).ingresos
    const conAccion = filas.filter((f) => f.acciones.includes('asignarProyecto'))
    expect(conAccion.map((f) => f.id)).toEqual([importada.id])
    expect(filas.find((f) => f.reembolsoDeId === importada.id)!.acciones).not.toContain('asignarProyecto')
  })
})

describe('Periodos generados after Cambiar Contacto', () => {
  it('belong to the Contacto the mensual Cotización moved to', () => {
    const otro = contacto('Otro').id
    const c = db.insert(cotizaciones).values({ contactoId, folio: 7, categoria: 'website', estado: 'aceptada', fecha: '2026-07-01', facturacion: 'mensual', moneda: 'USD' }).returning().get()
    const p = db.insert(proyectos).values({ nombre: 'Soporte', contactoId, cotizacionId: c.id, categoria: 'website' }).returning().get()
    db.insert(definicionesIngreso)
      .values({ tipo: 'mensual', categoria: 'sin_factura', subtotal: 185000, total: 185000, montoOriginal: 10000, monedaOriginal: 'USD', contactoId, cotizacionId: c.id, proyectoId: p.id, periodoInicio: '2026-07' })
      .run()
    generarPeriodos(db, '2026-08')
    cambiarContacto(db, 'proyecto', p.id, otro)
    generarPeriodos(db, '2026-09')
    const periodos = db.select().from(ingresos).where(eq(ingresos.proyectoId, p.id)).all()
    expect(periodos.map((i) => [i.periodo, i.contactoId, i.montoOriginal])).toEqual([
      ['2026-07', otro, 10000],
      ['2026-08', otro, 10000],
      ['2026-09', otro, 10000]
    ])
  })
})

describe('Editar ingreso', () => {
  /** One Ingreso of each origin and estado Finanzas lists in September 2026, by name. */
  function deCadaOrigen() {
    const c = cotizacionAceptada(contactoId)
    const p = proyecto(contactoId, c.id)
    const fila = (valores: Partial<typeof ingresos.$inferInsert>) =>
      db
        .insert(ingresos)
        .values({ categoria: 'sin_factura', estado: 'pagado', subtotal: 10000, iva: 0, total: 10000, contactoId, fechaRegistro: '2026-09-03', fechaPago: '2026-09-03', ...valores })
        .returning()
        .get()
    const manual = fila({})
    const conCobro = fila({ proyectoId: p.id })
    const planDeCobro = fila({ proyectoId: p.id, cotizacionId: c.id, estado: 'pendiente', fechaPago: null })
    const incobrable = fila({ proyectoId: p.id, estado: 'incobrable', fechaPago: null })
    const cfdiPagado = cfdi('2026-09-04')
    reembolsar(db, manual.id, 1000, hoy)
    const reembolso = db.select().from(ingresos).where(eq(ingresos.reembolsoDeId, manual.id)).get()!
    db.insert(definicionesIngreso)
      .values({ tipo: 'mensual', categoria: 'sin_factura', subtotal: 5000, total: 5000, contactoId, cotizacionId: c.id, proyectoId: p.id, periodoInicio: '2026-09' })
      .run()
    generarPeriodos(db, '2026-09')
    const periodo = db.select().from(ingresos).where(eq(ingresos.periodo, '2026-09')).get()!
    return { c, p, manual, conCobro, planDeCobro, incobrable, cfdiPagado, reembolso, periodo }
  }

  it('is offered on every Ingreso but an imported invoice', () => {
    const o = deCadaOrigen()
    const conEditar = resumenFinanzas(db, 'mes', hoy, 30)
      .ingresos.filter((f) => f.acciones.includes('editar'))
      .map((f) => f.id)
    const esperados = [o.manual, o.conCobro, o.planDeCobro, o.incobrable, o.reembolso, o.periodo].map((i) => i.id)
    expect(conEditar.sort((a, b) => a - b)).toEqual(esperados.sort((a, b) => a - b))
  })

  it('locks what each origin cannot change', () => {
    const o = deCadaOrigen()
    const bloqueos = (id: number) => exigirIngreso(db, 'editar', id)
    const de = (id: number) => {
      const { ingreso, reembolsos } = bloqueos(id)
      return bloqueosIngreso(ingreso, { reembolsos })
    }
    expect(de(o.manual.id)).toEqual(['categoria', 'tipoCambio'])
    expect(de(o.conCobro.id)).toEqual([])
    expect(de(o.planDeCobro.id)).toEqual(['proyecto'])
    expect(de(o.periodo.id)).toEqual(['proyecto'])
    expect(de(o.reembolso.id)).toEqual(['categoria', 'facturacion', 'proyecto', 'tipoCambio'])
    expect(() => bloqueos(o.cfdiPagado.id)).toThrow('Una factura importada no se edita')
  })

  /** Saves Editar ingreso over `id` with `cambios` on top of what it opens with. */
  const editar = (id: number, cambios: Partial<IngresoEditado> = {}) => editarIngreso(db, id, { ...ingresoParaEditar(db, id), ...cambios }, hoy)
  const leer = (id: number) => db.select().from(ingresos).where(eq(ingresos.id, id)).get()!
  const fila = (valores: Partial<typeof ingresos.$inferInsert>) =>
    db
      .insert(ingresos)
      .values({ categoria: 'sin_factura', estado: 'pagado', subtotal: 800_000, iva: 0, total: 800_000, contactoId, fechaRegistro: '2026-09-03', fechaPago: '2026-09-03', ...valores })
      .returning()
      .get()
  /** Ingreso 884 of La Hora Zero, as Completar con cobro recorded it this month. */
  const horaZero = () => fila({ subtotal: 500_001, total: 500_001, montoOriginal: 26_000, monedaOriginal: 'USD', proyectoId: proyecto(contactoId, null).id })

  describe('the fecha', () => {
    it('moves a payment recorded today to the day it was paid', () => {
      const i = horaZero()
      editar(i.id, { fecha: '2019-03-15' })
      expect(leer(i.id)).toMatchObject({ estado: 'pagado', fechaRegistro: '2019-03-15', fechaPago: '2019-03-15', total: 500_001, montoOriginal: 26_000 })
      const septiembre = resumenFinanzas(db, 'mes', hoy, 30)
      expect([septiembre.actual.ingresos, septiembre.real]).toEqual([0, 0])
      expect(resumenFinanzas(db, 'mes', '2019-03-31', 30).actual.ingresos).toBe(500_001)
    })

    it('refuses a paid Ingreso dated after today', () => {
      const i = fila({})
      expect(() => editar(i.id, { fecha: '2026-09-19' })).toThrow('posterior a hoy')
      expect(leer(i.id).fechaPago).toBe('2026-09-03')
    })

    it('moves a pending one out of Cobros, still pending and unpaid', () => {
      const i = fila({ estado: 'pendiente', fechaPago: null })
      editar(i.id, { fecha: '2026-10-05' })
      expect(leer(i.id)).toMatchObject({ estado: 'pendiente', fechaRegistro: '2026-10-05', fechaPago: null })
      expect(Object.values(resumenFinanzas(db, 'mes', hoy, 30).cobros).flat()).toEqual([])
    })

    it('keeps an Incobrable one unpaid', () => {
      const i = fila({ estado: 'incobrable', fechaPago: null })
      editar(i.id, { fecha: '2019-03-15' })
      expect(leer(i.id)).toMatchObject({ estado: 'incobrable', fechaRegistro: '2019-03-15', fechaPago: null })
    })

    it('keeps a generated Ingreso its periodo, so no second one is generated for it', () => {
      const { periodo } = deCadaOrigen()
      editar(periodo.id, { fecha: '2026-09-20' })
      generarPeriodos(db, '2026-09')
      const delPeriodo = db.select().from(ingresos).where(eq(ingresos.periodo, '2026-09')).all()
      expect(delPeriodo.map((i) => [i.id, i.fechaRegistro])).toEqual([[periodo.id, '2026-09-20']])
    })

    it('counts a Reembolso on its new fecha', () => {
      const i = fila({ fechaRegistro: '2026-07-20', fechaPago: '2026-07-20' })
      reembolsar(db, i.id, 100_000, hoy)
      const r = db.select().from(ingresos).where(eq(ingresos.reembolsoDeId, i.id)).get()!
      expect(resumenFinanzas(db, 'mes', hoy, 30).actual.ingresos).toBe(-100_000)
      editar(r.id, { fecha: '2026-08-03' })
      expect(resumenFinanzas(db, 'mes', hoy, 30).actual.ingresos).toBe(0)
      expect(resumenFinanzas(db, 'mes', '2026-08-31', 30).actual.ingresos).toBe(-100_000)
    })

    it('keeps a Reembolso after the payment it gives back, and an Ingreso before its Reembolsos', () => {
      const i = fila({ fechaRegistro: '2026-06-10', fechaPago: '2026-06-10' })
      reembolsar(db, i.id, 1000, hoy)
      const r = db.select().from(ingresos).where(eq(ingresos.reembolsoDeId, i.id)).get()!
      editar(r.id, { fecha: '2026-07-01' })
      expect(() => editar(r.id, { fecha: '2026-03-01' })).toThrow('anterior al ingreso que devuelve')
      expect(() => editar(i.id, { fecha: '2026-08-01' })).toThrow('posterior a sus reembolsos')
      editar(i.id, { fecha: '2026-06-01' })
      expect([leer(i.id).fechaPago, leer(r.id).fechaPago]).toEqual(['2026-06-01', '2026-07-01'])
    })

    it('refuses a day that does not exist', () => {
      expect(() => editar(fila({}).id, { fecha: '2026-02-31' })).toThrow('La fecha no es válida')
    })

    it('leaves both dates as they were when the fecha is unchanged', () => {
      const i = fila({ fechaRegistro: '2026-08-20', fechaPago: '2026-09-03' })
      editar(i.id, { notas: 'Transferencia' })
      expect(leer(i.id)).toMatchObject({ fechaRegistro: '2026-08-20', fechaPago: '2026-09-03', notas: 'Transferencia' })
    })
  })

  describe('the amount', () => {
    it('recomputes an MXN subtotal, with no IVA when uninvoiced', () => {
      const i = fila({})
      editar(i.id, { monto: 850_000 })
      expect(leer(i.id)).toMatchObject({ subtotal: 850_000, iva: 0, total: 850_000 })
      expect(resumenFinanzas(db, 'mes', hoy, 30).actual.ingresos).toBe(850_000)
    })

    it('takes a USD Ingreso’s amount and rate in USD and keeps its currency', () => {
      const i = horaZero()
      expect(ingresoParaEditar(db, i.id)).toMatchObject({ moneda: 'USD', monto: 26_000, categoria: 'sin_factura' })
      editar(i.id, { monto: 25_000, tipoCambio: 19.2308 })
      expect(leer(i.id)).toMatchObject({ total: 480_770, montoOriginal: 25_000, monedaOriginal: 'USD' })
    })

    it('changes only the rate of a USD Ingreso, and keeps it when none is given', () => {
      const i = fila({ subtotal: 1_800_000, total: 1_800_000, montoOriginal: 100_000, monedaOriginal: 'USD' })
      editar(i.id, { tipoCambio: 17.5 })
      expect(leer(i.id)).toMatchObject({ total: 1_750_000, montoOriginal: 100_000 })
      editar(i.id, { monto: 200_000, tipoCambio: null })
      expect(leer(i.id)).toMatchObject({ total: 3_500_000, montoOriginal: 200_000 })
    })

    it('keeps the rate of a USD Ingreso with a Reembolso, which was converted at it', () => {
      const i = fila({ subtotal: 2_000_000, total: 2_000_000, montoOriginal: 100_000, monedaOriginal: 'USD' })
      reembolsar(db, i.id, 100_000, hoy)
      expect(() => editar(i.id, { tipoCambio: 18 })).toThrow('no cambia su tipo de cambio')
      expect(leer(i.id).total).toBe(2_000_000)
    })

    it('keeps the subtotal of a USD Parcialidad with IVA, never adding IVA on its total', () => {
      const i = fila({ categoria: 'factura', estadoFacturacion: 'facturado', subtotal: 616_679, iva: 98_679, total: 715_358, montoOriginal: 38_668, monedaOriginal: 'USD' })
      expect(ingresoParaEditar(db, i.id)).toMatchObject({ monto: 33_334, conIva: true })
      editar(i.id, { tipoCambio: 18.5 })
      expect(Math.abs(leer(i.id).montoOriginal! - 38_668)).toBeLessThanOrEqual(1)
    })

    it('never goes below what its Reembolsos gave back', () => {
      const i = fila({ subtotal: 1_000_000, total: 1_000_000 })
      reembolsar(db, i.id, 300_000, hoy)
      expect(() => editar(i.id, { monto: 250_000 })).toThrow('menor a lo ya reembolsado')
      expect(leer(i.id).total).toBe(1_000_000)
    })

    it('edits a Reembolso within what is left of its Ingreso', () => {
      const i = fila({ subtotal: 1_000_000, total: 1_000_000 })
      reembolsar(db, i.id, 300_000, hoy)
      reembolsar(db, i.id, 200_000, hoy)
      const [, segundo] = db.select().from(ingresos).where(eq(ingresos.reembolsoDeId, i.id)).all()
      expect(ingresoParaEditar(db, segundo.id).monto).toBe(200_000)
      editar(segundo.id, { monto: 400_000 })
      expect(leer(segundo.id).total).toBe(-400_000)
      expect(() => editar(segundo.id, { monto: 800_000 })).toThrow('No se puede reembolsar más de lo pagado')
    })

    it('edits a USD Reembolso in USD at its Ingreso’s rate', () => {
      const i = fila({ subtotal: 1_910_000, total: 1_910_000, montoOriginal: 100_000, monedaOriginal: 'USD' })
      reembolsar(db, i.id, 5000, hoy)
      const r = db.select().from(ingresos).where(eq(ingresos.reembolsoDeId, i.id)).get()!
      editar(r.id, { monto: 10_000 })
      expect(leer(r.id)).toMatchObject({ total: -191_000, montoOriginal: -10_000 })
    })

    it('leaves every stored value as it was when nothing is changed', () => {
      const conIva = fila({ categoria: 'factura', estadoFacturacion: 'facturado', subtotal: 100_000, iva: 16_000, total: 116_000 })
      const antes = [leer(conIva.id), horaZero()]
      for (const i of antes) editar(i.id)
      expect(antes.map((i) => leer(i.id))).toEqual(antes)
    })
  })

  describe('categoría, Proyecto and estado', () => {
    it('drops IVA and Estado de facturación from an Ingreso paid without an invoice after all', () => {
      const i = fila({ categoria: 'factura', estadoFacturacion: 'por_facturar', estado: 'pendiente', fechaPago: null, subtotal: 1_000_000, iva: 160_000, total: 1_160_000 })
      editar(i.id, { categoria: 'sin_factura' })
      expect(leer(i.id)).toMatchObject({ categoria: 'sin_factura', estadoFacturacion: null, iva: 0, total: 1_000_000 })
      expect(resumenFinanzas(db, 'mes', hoy, 30).cobros.porFacturar).toEqual([])
    })

    it('adds IVA to one invoiced after all', () => {
      const i = fila({ subtotal: 1_000_000, total: 1_000_000 })
      editar(i.id, { categoria: 'factura', conIva: true, facturado: true })
      expect(leer(i.id)).toMatchObject({ categoria: 'factura', estadoFacturacion: 'facturado', iva: 160_000, total: 1_160_000 })
    })

    it('keeps the categoría and IVA of an Ingreso with a Reembolso', () => {
      const i = fila({})
      reembolsar(db, i.id, 1000, hoy)
      expect(() => editar(i.id, { categoria: 'factura', conIva: true })).toThrow('no cambia de tipo ni de IVA')
    })

    it('moves a hand-entered Ingreso and its Reembolso to another Proyecto and its Contacto', () => {
      const otro = contacto('Cantina Rooftop').id
      const destino = proyecto(otro, null)
      const i = fila({ proyectoId: proyecto(contactoId, null).id })
      reembolsar(db, i.id, 1000, hoy)
      editar(i.id, { proyectoId: destino.id })
      const r = db.select().from(ingresos).where(eq(ingresos.reembolsoDeId, i.id)).get()!
      expect([leer(i.id), r].map((x) => [x.proyectoId, x.contactoId])).toEqual([
        [destino.id, otro],
        [destino.id, otro]
      ])
      expect(() => editar(r.id, { proyectoId: null })).toThrow('no cambia de proyecto')
    })

    it('keeps a Plan de cobro Ingreso on its Proyecto', () => {
      const { planDeCobro } = deCadaOrigen()
      expect(() => editar(planDeCobro.id, { proyectoId: null })).toThrow('no cambia de proyecto')
    })

    it('keeps the Contacto of an Ingreso whose Proyecto does not change, even one its Proyecto does not share', () => {
      const { planDeCobro, p } = deCadaOrigen()
      const otro = contacto('Otro').id
      db.update(proyectos).set({ contactoId: otro }).where(eq(proyectos.id, p.id)).run()
      editar(planDeCobro.id, { fecha: '2026-09-10' })
      expect(leer(planDeCobro.id)).toMatchObject({ proyectoId: p.id, contactoId, fechaRegistro: '2026-09-10' })
    })

    it('never changes the estado', () => {
      const i = fila({ estado: 'pendiente', fechaPago: null })
      editar(i.id, { monto: 900_000, fecha: '2026-09-10' })
      expect(leer(i.id)).toMatchObject({ estado: 'pendiente', fechaPago: null, total: 900_000 })
    })

    it('refuses a cancelled Ingreso', () => {
      const i = fila({ estado: 'cancelado' })
      expect(() => editar(i.id)).toThrow('Un ingreso cancelado no se edita')
    })
  })
})

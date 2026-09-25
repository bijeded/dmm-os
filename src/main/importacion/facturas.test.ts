import { eq } from 'drizzle-orm'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { escanearCarpetas, importarFacturas } from '.'
import { leerCfdi } from '../cfdi'
import { estadoCobro } from '../cobranza'
import { resumenFinanzas } from '../finanzas'
import { reembolsar } from '../movimientos'
import { contactos, costos, cotizaciones, ingresos, proyectos, sugerenciasImportacion } from '../db/schema'
import { contacto, cotizacionAceptada, db, proyecto, reiniciarDb } from '../db/test-db'
import { cfdiXml, complementoXml, RFC_CLIENTE, RFC_DMM, type PagoXml } from '../test-cfdi'

let root: string

const cfdi = (uuid: string) => cfdiXml({ uuid })

function escribir(rutaRelativa: string, contenido: string) {
  const file = join(root, rutaRelativa)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, contenido)
}

beforeEach(() => {
  reiniciarDb()
  root = mkdtempSync(join(tmpdir(), 'dmm-facturas-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('importarFacturas', () => {
  it('reads Emitidas as Ingresos and Recibidas as Costos, at any depth', () => {
    escribir('Facturas/Emitidas/2026/02/a.xml', cfdi('11111111-0000-4444-8888-99AABBCCDDEE'))
    escribir('Facturas/Recibidas/2026/b.xml', cfdi('22222222-0000-4444-8888-99AABBCCDDEE'))
    const log = importarFacturas(db, root)
    expect(log.importados).toBe(2)
    expect(db.select().from(ingresos).all()).toHaveLength(1)
    expect(db.select().from(costos).all()).toHaveLength(1)
  })

  it('ignores files that are not XML', () => {
    escribir('Facturas/Emitidas/2026/a.pdf', 'not xml')
    expect(importarFacturas(db, root).importados).toBe(0)
  })

  it('changes nothing on a second run', () => {
    escribir('Facturas/Emitidas/2026/a.xml', cfdi('11111111-0000-4444-8888-99AABBCCDDEE'))
    importarFacturas(db, root)
    const segunda = importarFacturas(db, root)
    expect(segunda).toMatchObject({ importados: 0, duplicados: 1 })
    expect(db.select().from(ingresos).all()).toHaveLength(1)
  })

  it('reports an unstamped CFDI and keeps going', () => {
    escribir(
      'Facturas/Emitidas/2026/roto.xml',
      `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Fecha="2026-02-03T12:00:00" SubTotal="1" Total="1"/>`
    )
    escribir('Facturas/Emitidas/2026/b.xml', cfdi('33333333-0000-4444-8888-99AABBCCDDEE'))
    const log = importarFacturas(db, root)
    expect(log.importados).toBe(1)
    expect(log.errores).toEqual([{ archivo: 'Facturas/Emitidas/2026/roto.xml', error: 'El CFDI viene sin timbre fiscal' }])
  })

  it('counts a CEP bank receipt as not a CFDI, with no error', () => {
    const cep = 'Facturas/Emitidas/2019/02/comprobante de pago/CEP-20190227-HSBC051240.xml'
    escribir(cep, '<?xml version="1.0" encoding="UTF-8"?><SPEI_Tercero FechaOperacion="2019-02-27"><Beneficiario Nombre="X"/></SPEI_Tercero>')
    const log = importarFacturas(db, root)
    expect(log).toMatchObject({ errores: [], noCfdi: [cep], importados: 0 })
  })

  it('reports the RFCs no Contacto claims, once each', () => {
    escribir('Facturas/Emitidas/2026/a.xml', cfdi('11111111-0000-4444-8888-99AABBCCDDEE'))
    escribir('Facturas/Emitidas/2026/b.xml', cfdi('22222222-0000-4444-8888-99AABBCCDDEE'))
    expect(importarFacturas(db, root).rfcsDesconocidos).toEqual(['EOC180202XY9'])
  })

  it('imports an 8% invoice unchanged and names it in the log with its rate', () => {
    escribir('Facturas/Emitidas/2026/frontera.xml', cfdiXml({ iva: '80.00' }))
    const log = importarFacturas(db, root)
    expect(log.ivasInusuales).toEqual([{ archivo: 'Facturas/Emitidas/2026/frontera.xml', tasa: 8 }])
    expect(db.select().from(ingresos).get()).toMatchObject({ iva: 8_000, total: 108_000 })
  })

  it('logs no unusual IVA for 0% and 16% invoices', () => {
    escribir('Facturas/Emitidas/2026/a.xml', cfdi('11111111-0000-4444-8888-99AABBCCDDEE'))
    escribir('Facturas/Recibidas/2026/b.xml', cfdiXml({ uuid: '22222222-0000-4444-8888-99AABBCCDDEE', iva: '0.00' }))
    expect(importarFacturas(db, root).ivasInusuales).toEqual([])
  })

  it('corrects an earlier import that stored IVA net of retenciones, when its XML is still there', () => {
    escribir('Facturas/Emitidas/2026/a.xml', cfdiXml({ retenciones: '206.67' }))
    importarFacturas(db, root)
    // As migration 0013 left it: net IVA moved whole into retenciones.
    db.update(ingresos).set({ iva: 0, retenciones: 4_667 }).run()
    expect(importarFacturas(db, root).duplicados).toBe(1)
    expect(db.select().from(ingresos).get()).toMatchObject({ subtotal: 100_000, iva: 16_000, retenciones: 20_667, total: 95_333 })
  })

  it('keeps edits to other fields of an earlier Costo when re-reading it', () => {
    escribir('Facturas/Recibidas/2026/b.xml', cfdiXml())
    importarFacturas(db, root)
    db.update(costos).set({ nombre: 'Renombrado' }).run()
    importarFacturas(db, root)
    expect(db.select().from(costos).get()).toMatchObject({ nombre: 'Renombrado', iva: 16_000, retenciones: 0, total: 116_000 })
  })

  it('leaves a row whose amounts were edited after import alone', () => {
    escribir('Facturas/Emitidas/2026/a.xml', cfdiXml({ retenciones: '206.67' }))
    importarFacturas(db, root)
    db.update(ingresos).set({ iva: -5_000, retenciones: 0, total: 95_000 }).run()
    importarFacturas(db, root)
    expect(db.select().from(ingresos).get()).toMatchObject({ iva: -5_000, retenciones: 0, total: 95_000 })
  })

  it('keeps a hand-edited IVA split whose total still matches', () => {
    escribir('Facturas/Emitidas/2026/a.xml', cfdiXml({ retenciones: '206.67' }))
    importarFacturas(db, root)
    db.update(ingresos).set({ iva: 15_000, retenciones: 19_667 }).run()
    importarFacturas(db, root)
    expect(db.select().from(ingresos).get()).toMatchObject({ iva: 15_000, retenciones: 19_667, total: 95_333 })
  })

  it('corrects an earlier import that stored IVA net of retenciones before migration 0013', () => {
    escribir('Facturas/Emitidas/2026/a.xml', cfdiXml({ retenciones: '206.67' }))
    importarFacturas(db, root)
    db.update(ingresos).set({ iva: -4_667, retenciones: 0 }).run()
    importarFacturas(db, root)
    expect(db.select().from(ingresos).get()).toMatchObject({ iva: 16_000, retenciones: 20_667, total: 95_333 })
  })

  it('reports a missing Facturas folder as No disponible rather than failing', () => {
    expect(importarFacturas(db, root)).toMatchObject({ importados: 0, noDisponibles: ['Facturas/Emitidas', 'Facturas/Recibidas'] })
  })
})

const UUID = 'a1b2c3d4-0000-4444-8888-99aabbccddee'
const emitida = (xml: string, nombre = 'a.xml') => escribir(`Facturas/Emitidas/${nombre}`, xml)
const recibida = (xml: string, nombre = 'a.xml') => escribir(`Facturas/Recibidas/${nombre}`, xml)
const importar = () => importarFacturas(db, root)
const contactoConRfc = (rfc = RFC_CLIENTE) =>
  db.insert(contactos).values({ nombre: 'Estudio Ocho', rfc }).returning().get()

describe('una factura emitida', () => {
  it('records it as an invoice Ingreso, facturado and paid on its date', () => {
    emitida(cfdiXml())
    importar()
    expect(db.select().from(ingresos).get()).toMatchObject({
      categoria: 'factura',
      estado: 'pagado',
      estadoFacturacion: 'facturado',
      subtotal: 100_000,
      iva: 16_000,
      total: 116_000,
      fechaRegistro: '2026-02-03',
      fechaPago: '2026-02-03',
      cfdiUuid: UUID
    })
  })

  it('links the Contacto by RFC', () => {
    const c = contactoConRfc()
    emitida(cfdiXml())
    expect(importar().rfcsDesconocidos).toEqual([])
    expect(db.select().from(ingresos).get()!.contactoId).toBe(c.id)
  })

  it('leaves the Ingreso unlinked when no Contacto has the RFC', () => {
    emitida(cfdiXml())
    importar()
    expect(db.select().from(ingresos).get()!.contactoId).toBeNull()
  })

  it('keeps the first import when the same UUID turns up with other amounts', () => {
    emitida(cfdiXml())
    importar()
    emitida(cfdiXml({ subtotal: '9999.00', iva: '0.00' }), 'b.xml')
    expect(importar()).toMatchObject({ importados: 0, duplicados: 2 })
    expect(db.select().from(ingresos).get()!.subtotal).toBe(100_000)
  })

  it('ignores a CFDI that is not an ingreso voucher', () => {
    emitida(cfdiXml({ tipo: 'P' }))
    expect(importar().ignorados).toBe(1)
    expect(db.select().from(ingresos).all()).toHaveLength(0)
  })
})

describe('una factura recibida', () => {
  it('records it as a single paid Costo with its supplier', () => {
    recibida(cfdiXml({ emisor: 'PRV900101QQ1', nombreEmisor: 'HOSTING MX', receptor: RFC_DMM, descripcion: 'Hosting anual' }))
    importar()
    expect(db.select().from(costos).get()).toMatchObject({
      nombre: 'Hosting anual',
      categoria: 'unico',
      estado: 'pagado',
      estimado: false,
      proveedor: 'HOSTING MX',
      subtotal: 100_000,
      fecha: '2026-02-03',
      cfdiUuid: UUID
    })
  })

  it('imports a CFDI once even when the same file sits in both folders', () => {
    emitida(cfdiXml())
    recibida(cfdiXml())
    expect(importar()).toMatchObject({ importados: 1, duplicados: 1 })
    expect(db.select().from(costos).all()).toHaveLength(0)
  })
})

describe('adivinar el Proyecto', () => {
  function proyectoCotizado(total: number, folio = 100) {
    const c = db.select().from(contactos).get() ?? contactoConRfc()
    const q = db
      .insert(cotizaciones)
      .values({ contactoId: c.id, folio, categoria: 'website', estado: 'aceptada', fecha: '2026-01-10', subtotal: total, total })
      .returning()
      .get()
    return db
      .insert(proyectos)
      .values({ nombre: `P${folio}`, contactoId: c.id, cotizacionId: q.id, categoria: 'website', fechaInicio: '2026-01-01' })
      .returning()
      .get()
  }

  it('leaves the guess as a Sugerencia de importación instead of linking it', () => {
    const p = proyectoCotizado(116_000)
    emitida(cfdiXml())
    expect(importar().sugerencias).toBe(1)
    const ingreso = db.select().from(ingresos).get()!
    expect(ingreso.proyectoId).toBeNull()
    const s = db.select().from(sugerenciasImportacion).get()!
    expect(s).toMatchObject({ entidad: 'ingreso', entidadId: ingreso.id, proyectoId: p.id, estado: 'pendiente' })
    expect(s.motivo).toMatch(/monto/)
  })

  it('suggests the only Proyecto open at that date when no amount matches', () => {
    const p = proyectoCotizado(500_000)
    emitida(cfdiXml())
    importar()
    expect(db.select().from(sugerenciasImportacion).get()).toMatchObject({ proyectoId: p.id, motivo: 'fecha' })
  })

  it('suggests nothing when two Proyectos match the amount', () => {
    proyectoCotizado(116_000, 100)
    proyectoCotizado(116_000, 101)
    emitida(cfdiXml())
    expect(importar().sugerencias).toBe(0)
  })

  it('does not consider a Proyecto that had already closed before the CFDI', () => {
    const c = contactoConRfc()
    const q = cotizacionAceptada(c.id)
    db.insert(proyectos)
      .values({ nombre: 'Viejo', contactoId: c.id, cotizacionId: q.id, categoria: 'website', estado: 'completado', fechaInicio: '2025-01-01', fechaFin: '2025-06-30' })
      .run()
    emitida(cfdiXml())
    expect(importar().sugerencias).toBe(0)
  })

  it('makes no guess when the Contacto is unknown', () => {
    const c = contacto()
    proyecto(c.id, cotizacionAceptada(c.id).id)
    emitida(cfdiXml())
    expect(importar().sugerencias).toBe(0)
  })
})

describe('una factura con retenciones', () => {
  it('stores IVA and retenciones apart, and Finanzas reports them', () => {
    emitida(cfdiXml({ retenciones: '206.67' }))
    recibida(cfdiXml({ uuid: 'B1B2C3D4-0000-4444-8888-99AABBCCDDEE', emisor: 'PRV900101QQ1', receptor: RFC_DMM, retenciones: '100.00' }))
    importar()
    expect(db.select().from(ingresos).get()).toMatchObject({ subtotal: 100_000, iva: 16_000, retenciones: 20_667, total: 95_333 })
    expect(db.select().from(costos).get()).toMatchObject({ subtotal: 100_000, iva: 16_000, retenciones: 10_000, total: 106_000 })

    const r = resumenFinanzas(db, 'anio', '2026-12-31', 30)
    expect(r.actual).toMatchObject({ ingresos: 100_000, ivaIngresos: 16_000, retencionesIngresos: 20_667, costos: 100_000, retencionesCostos: 10_000 })
    expect(r.ingresos[0]).toMatchObject({ iva: 16_000, retenciones: 20_667, total: 95_333 })
    expect(r.costos[0]).toMatchObject({ retenciones: 10_000 })
  })
})

describe('después del escaneo de carpetas', () => {
  it('Invoices link after the scan', () => {
    escribir('Clientes/_nombres.csv', 'en disco,contacto,proyecto,cliente final,rfc\n,Sublime Inspiración,,,SIA161024H91\n')
    for (const letra of ['A', 'B', 'C']) {
      const uuid = `${letra}1111111-0000-4444-8888-99AABBCCDDEE`
      escribir(`Facturas/Emitidas/2026/${letra}.xml`, cfdiXml({ uuid, receptor: 'SIA161024H91' }))
    }

    escanearCarpetas(db, root)
    importarFacturas(db, root)
    const sublime = db.select().from(contactos).all().find((c) => c.nombre === 'Sublime Inspiración')!
    expect(sublime.rfc).toBe('SIA161024H91')
    expect(db.select().from(ingresos).all().map((i) => i.contactoId)).toEqual([sublime.id, sublime.id, sublime.id])
  })
})

const PPD = '2a676e07-5512-4908-82db-06a2b537d9df'
const OTRA = 'ea1cd75e-e1a4-448f-828a-1ea0ef784596'
const factura = (opciones: Parameters<typeof cfdiXml>[0] = {}) => cfdiXml({ uuid: PPD, fecha: '2019-08-29', ...opciones })
const facturaPpd = (opciones: Parameters<typeof cfdiXml>[0] = {}) => factura({ metodoPago: 'PPD', ...opciones })
const pago = (parcialidad: number, fecha: string, pagado: string, saldo: string): PagoXml => ({
  factura: PPD,
  parcialidad,
  fecha,
  pagado,
  saldoAnterior: '0',
  saldo
})
const complemento = (nombre: string, ...pagos: PagoXml[]) =>
  emitida(complementoXml({ uuid: `c${pagos[0].parcialidad}${'0'.repeat(7)}-0000-4444-8888-${nombre.padEnd(12, '0')}`, pagos }), `pagos/${nombre}.xml`)
const filas = () => db.select().from(ingresos).orderBy(ingresos.cfdiParcialidad).all()

describe('una factura cancelada', () => {
  it('is not imported when filed in a cancel folder, and the log counts it', () => {
    emitida(factura({ subtotal: '104000.00', iva: '16640.00' }), '2019/08/Canceladas/c266deaa.xml')
    expect(importar()).toMatchObject({ importados: 0, cancelados: 1 })
    expect(filas()).toEqual([])
  })

  it('is not imported from an accented folder, as a Costo, or in USD', () => {
    emitida(factura(), '2023/07/Cancelación/a.xml')
    recibida(cfdiXml({ uuid: OTRA, emisor: 'PRV900101QQ1', receptor: RFC_DMM }), '2025/03/Canceladas/b.xml')
    emitida(cfdiXml({ uuid: 'b1b2c3d4-0000-4444-8888-99aabbccddee', moneda: 'USD', tipoCambio: '18.50' }), '2024/10/Canceladas/c.xml')
    expect(importar().cancelados).toBe(3)
    expect(filas()).toEqual([])
    expect(db.select().from(costos).all()).toEqual([])
  })

  it('is not imported when a kept CFDI replaces it, and a cancelled one replaces nothing', () => {
    emitida(cfdiXml({ uuid: OTRA, fecha: '2020-05-29' }), '2020/05/a.xml')
    emitida(cfdiXml({ uuid: 'c79a953d-d29f-4990-b91c-25d9a675c332', fecha: '2020-08-28', sustituye: [OTRA] }), '2020/08/c.xml')
    emitida(factura(), '2018/11/b.xml')
    emitida(cfdiXml({ uuid: 'ef685f58-9613-4303-b03c-1751e94b6722', tipo: 'P', sustituye: [PPD] }), '2018/12/Canceladas/p.xml')
    expect(importar()).toMatchObject({ importados: 2, sustituidos: 1, cancelados: 1 })
    expect(filas().map((i) => i.cfdiUuid).sort()).toEqual([PPD, 'c79a953d-d29f-4990-b91c-25d9a675c332'])
  })
})

describe('una factura ya importada que resulta cancelada', () => {
  it('becomes cancelado even though it was paid, keeps its links, and stops counting in Finanzas', () => {
    const c = contactoConRfc()
    emitida(factura({ subtotal: '104000.00', iva: '16640.00' }), '2019/08/a.xml')
    importar()
    const [ingreso] = filas()
    db.update(ingresos).set({ proyectoId: proyecto(c.id, cotizacionAceptada(c.id).id).id }).run()
    expect(resumenFinanzas(db, 'anio', '2019-12-31', 30).actual.ingresos).toBe(10_400_000)

    rmSync(join(root, 'Facturas/Emitidas/2019/08/a.xml'))
    emitida(factura({ subtotal: '104000.00', iva: '16640.00' }), '2019/08/Canceladas/a.xml')
    const log = importar()

    expect(filas()).toEqual([expect.objectContaining({ id: ingreso.id, estado: 'cancelado', contactoId: c.id, cfdiUuid: PPD })])
    expect(filas()[0].proyectoId).not.toBeNull()
    expect(log.cambios.cancelados).toEqual([{ entidad: 'ingreso', id: ingreso.id, fecha: '2019-08-29', total: 12_064_000, motivo: 'cancelada' }])
    expect(resumenFinanzas(db, 'anio', '2019-12-31', 30).actual.ingresos).toBe(0)
  })

  it('becomes cancelado when replaced, even with its file gone; the replacement stays', () => {
    emitida(cfdiXml({ uuid: OTRA, fecha: '2020-05-29' }), '2020/05/a.xml')
    importar()
    rmSync(join(root, 'Facturas/Emitidas/2020/05/a.xml'))
    emitida(cfdiXml({ uuid: 'c79a953d-d29f-4990-b91c-25d9a675c332', fecha: '2020-08-28', sustituye: [OTRA] }), '2020/08/c.xml')
    const log = importar()
    expect(filas().map((i) => [i.cfdiUuid, i.estado]).sort()).toEqual([
      ['c79a953d-d29f-4990-b91c-25d9a675c332', 'pagado'],
      [OTRA, 'cancelado']
    ])
    expect(log.cambios.cancelados.map((c) => c.motivo)).toEqual(['sustituida'])
  })

  it('cancels a USD Ingreso keeping its USD original, and a received Costo', () => {
    emitida(cfdiXml({ uuid: OTRA, moneda: 'USD', tipoCambio: '18.50' }), '2023/07/a.xml')
    recibida(cfdiXml({ emisor: 'PRV900101QQ1', receptor: RFC_DMM }), '2025/03/b.xml')
    importar()
    rmSync(join(root, 'Facturas'), { recursive: true })
    emitida(cfdiXml({ uuid: OTRA, moneda: 'USD', tipoCambio: '18.50' }), '2023/07/Canceladas/a.xml')
    recibida(cfdiXml({ emisor: 'PRV900101QQ1', receptor: RFC_DMM }), '2025/03/Canceladas/b.xml')
    importar()
    expect(filas()[0]).toMatchObject({ estado: 'cancelado', montoOriginal: 116_000, monedaOriginal: 'USD' })
    expect(db.select().from(costos).get()).toMatchObject({ estado: 'cancelado' })
    expect(resumenFinanzas(db, 'anio', '2026-12-31', 30).actual.costos).toBe(0)
  })

  it('leaves an Ingreso with a Reembolso alone and reports it', () => {
    emitida(factura(), '2019/08/a.xml')
    importar()
    const [ingreso] = filas()
    reembolsar(db, ingreso.id, 100, '2019-09-01')
    rmSync(join(root, 'Facturas/Emitidas/2019/08/a.xml'))
    emitida(factura(), '2019/08/Canceladas/a.xml')
    const log = importar()
    expect(db.select().from(ingresos).where(eq(ingresos.id, ingreso.id)).get()!.estado).toBe('pagado')
    expect(log.cambios.intactos).toEqual([expect.objectContaining({ id: ingreso.id, motivo: 'reembolso' })])
  })

  it('shows Sin ingresos registrados again once its only covering Ingreso is cancelled', () => {
    const c = contactoConRfc()
    const q = db
      .insert(cotizaciones)
      .values({ contactoId: c.id, folio: 312, categoria: 'website', estado: 'aceptada', fecha: '2019-08-01', subtotal: 100_000, iva: 16_000, total: 116_000 })
      .returning()
      .get()
    const p = proyecto(c.id, q.id)
    emitida(factura(), '2019/08/a.xml')
    importar()
    db.update(ingresos).set({ proyectoId: p.id }).run()
    expect(estadoCobro(db, p.id).falta).toBeNull()

    rmSync(join(root, 'Facturas/Emitidas/2019/08/a.xml'))
    emitida(factura(), '2019/08/Canceladas/a.xml')
    importar()
    expect(estadoCobro(db, p.id).falta?.faltante).toBeGreaterThan(0)
  })

  it('changes nothing on a second run', () => {
    emitida(factura(), '2019/08/Canceladas/a.xml')
    importar()
    expect(importar().cambios).toEqual({ cancelados: [], refechados: [], divididos: [], intactos: [] })
  })
})

describe('una factura PPD con complementos de pago', () => {
  // Appleseed 2a676e07: $254,340.44 paid in two parts a year apart, the complementos overshooting by $9.85.
  const appleseed = () => facturaPpd({ subtotal: '266800.00', iva: '42688.00', retenciones: '55147.56' })
  const dosPagos = () => {
    complemento('p1', pago(1, '2019-09-12', '99146.67', '155193.77'))
    complemento('p2', pago(2, '2020-08-13', '155203.62', '0'))
  }

  it('imports one paid Parcialidad per payment, dated on each FechaPago and adding up to the invoice', () => {
    emitida(appleseed(), '2019/08/f.xml')
    dosPagos()
    importar()
    const [uno, dos] = filas()
    expect([uno, dos].map((i) => [i.cfdiParcialidad, i.estado, i.fechaPago, i.estadoFacturacion, i.fechaRegistro])).toEqual([
      [1, 'pagado', '2019-09-12', 'facturado', '2019-08-29'],
      [2, 'pagado', '2020-08-13', 'facturado', '2019-08-29']
    ])
    expect(uno.total + dos.total).toBe(25_434_044)
    expect(uno.iva + dos.iva).toBe(4_268_800)
    expect(uno.retenciones + dos.retenciones).toBe(5_514_756)
    expect(resumenFinanzas(db, 'anio', '2019-12-31', 30).actual.ingresos).toBe(uno.subtotal)
    expect(resumenFinanzas(db, 'anio', '2020-12-31', 30).actual.ingresos).toBe(dos.subtotal)
  })

  it('dates a single payment that pays it all on the payment day, whole', () => {
    emitida(facturaPpd({ fecha: '2018-10-30', subtotal: '2000.00', iva: '320.00' }), '2018/10/f.xml')
    complemento('p1', pago(1, '2018-11-02', '2320.00', '0'))
    importar()
    expect(filas()).toEqual([expect.objectContaining({ cfdiParcialidad: 0, estado: 'pagado', fechaPago: '2018-11-02', total: 232_000 })])
  })

  it('leaves an open balance as a pending Parcialidad on the invoice date', () => {
    emitida(facturaPpd({ subtotal: '10000.00', iva: '1600.00' }), '2019/08/f.xml')
    complemento('p1', pago(1, '2019-09-12', '4640.00', '6960.00'))
    importar()
    expect(filas().map((i) => [i.cfdiParcialidad, i.estado, i.fechaPago, i.fechaRegistro, i.total])).toEqual([
      [1, 'pagado', '2019-09-12', '2019-08-29', 464_000],
      [2, 'pendiente', null, '2019-08-29', 696_000]
    ])
  })

  it('splits a USD invoice by its USD payments', () => {
    const xml = facturaPpd({ moneda: 'USD', tipoCambio: '18.50', subtotal: '862.07', iva: '137.93' })
    emitida(xml, '2023/06/f.xml')
    complemento('p1', pago(1, '2023-07-01', '400.00', '600.00'))
    complemento('p2', pago(2, '2023-08-01', '600.00', '0'))
    importar()
    const partes = filas()
    expect(partes.map((i) => i.montoOriginal)).toEqual([40_000, 60_000])
    expect(partes[0].total + partes[1].total).toBe(leerCfdi(xml).total)
  })

  it('pays a PPD invoice with no complemento on its own date', () => {
    emitida(facturaPpd({ fecha: '2018-04-10' }), '2018/04/f.xml')
    importar()
    expect(filas()).toEqual([expect.objectContaining({ cfdiParcialidad: 0, estado: 'pagado', fechaPago: '2018-04-10' })])
  })

  it('leaves a guessed Sugerencia de importación for each Parcialidad', () => {
    const c = contactoConRfc()
    db.insert(proyectos).values({ nombre: 'Plataforma', contactoId: c.id, categoria: 'website', fechaInicio: '2019-01-01' }).run()
    emitida(appleseed(), '2019/08/f.xml')
    dosPagos()
    expect(importar().sugerencias).toBe(2)
  })

  it('splits an Ingreso an earlier run imported whole, copying its links, and reports it', () => {
    const c = contactoConRfc()
    const p = proyecto(c.id, cotizacionAceptada(c.id).id)
    emitida(appleseed(), '2019/08/f.xml')
    importar()
    const [antes] = filas()
    db.update(ingresos).set({ proyectoId: p.id, notas: 'Plataforma' }).run()

    dosPagos()
    const log = importar()
    const [uno, dos] = filas()
    expect(uno).toMatchObject({ id: antes.id, cfdiParcialidad: 1, fechaPago: '2019-09-12' })
    expect(dos).toMatchObject({ cfdiParcialidad: 2, fechaPago: '2020-08-13', proyectoId: p.id, contactoId: c.id, notas: 'Plataforma' })
    expect(log.cambios.divididos).toEqual([{ entidad: 'ingreso', id: antes.id, fecha: '2019-08-29', total: 25_434_044, motivo: 'pagos' }])
    expect(importar().cambios.divididos).toEqual([])
  })

  it('re-dates an Ingreso an earlier run imported, when one payment paid it all', () => {
    emitida(facturaPpd({ fecha: '2018-10-30' }), '2018/10/f.xml')
    importar()
    complemento('p1', pago(1, '2018-11-02', '1160.00', '0'))
    const log = importar()
    expect(filas()[0]).toMatchObject({ cfdiParcialidad: 0, fechaPago: '2018-11-02' })
    expect(log.cambios.refechados.map((c) => c.motivo)).toEqual(['pagos'])
  })

  it('leaves an Ingreso edited by hand alone and reports it', () => {
    emitida(appleseed(), '2019/08/f.xml')
    importar()
    db.update(ingresos).set({ fechaPago: '2019-10-01' }).run()
    dosPagos()
    const log = importar()
    expect(filas()).toEqual([expect.objectContaining({ cfdiParcialidad: 0, fechaPago: '2019-10-01' })])
    expect(log.cambios.intactos.map((c) => c.motivo)).toEqual(['editado'])
  })

  it('pays the pending remainder once a later complemento closes the balance, and Cobros drops it', () => {
    emitida(facturaPpd({ subtotal: '10000.00', iva: '1600.00' }), '2019/08/f.xml')
    complemento('p1', pago(1, '2019-09-12', '4640.00', '6960.00'))
    importar()
    expect(resumenFinanzas(db, 'mes', '2026-09-24', 30).cobros.vencidos.map((i) => i.total)).toEqual([696_000])

    complemento('p2', pago(2, '2020-01-15', '6960.00', '0'))
    importar()
    expect(filas().map((i) => [i.cfdiParcialidad, i.estado, i.fechaPago])).toEqual([
      [1, 'pagado', '2019-09-12'],
      [2, 'pagado', '2020-01-15']
    ])
    const cobros = resumenFinanzas(db, 'mes', '2026-09-24', 30).cobros
    expect([...cobros.vencidos, ...cobros.mes, ...cobros.porFacturar]).toEqual([])
  })

  it('numbers Parcialidades by NumParcialidad, and fills a missing payment once it turns up', () => {
    emitida(facturaPpd({ subtotal: '10000.00', iva: '1600.00' }), '2019/08/f.xml')
    complemento('p1', pago(1, '2019-09-01', '2320.00', '9280.00'))
    complemento('p3', pago(3, '2019-11-01', '2320.00', '4640.00'))
    importar()
    expect(filas().map((i) => [i.cfdiParcialidad, i.estado, i.total])).toEqual([
      [1, 'pagado', 232_000],
      [3, 'pagado', 232_000],
      [4, 'pendiente', 696_000]
    ])

    complemento('p2', pago(2, '2019-10-01', '2320.00', '6960.00'))
    importar()
    expect(filas().map((i) => [i.cfdiParcialidad, i.estado, i.fechaPago, i.total])).toEqual([
      [1, 'pagado', '2019-09-01', 232_000],
      [2, 'pagado', '2019-10-01', 232_000],
      [3, 'pagado', '2019-11-01', 232_000],
      [4, 'pendiente', null, 464_000]
    ])
  })

  it('leaves the invoice alone when new complementos would change a paid Parcialidad', () => {
    emitida(facturaPpd({ subtotal: '10000.00', iva: '1600.00' }), '2019/08/f.xml')
    complemento('p1', pago(1, '2019-09-01', '2320.00', '9280.00'))
    complemento('p3', pago(3, '2019-11-01', '9280.00', '0'))
    importar()
    const antes = filas()

    complemento('p2', pago(2, '2019-10-01', '2320.00', '6960.00'))
    const log = importar()
    expect(filas()).toEqual(antes)
    expect(log.cambios.intactos).toEqual([expect.objectContaining({ id: antes[0].id, total: 1_160_000, motivo: 'complementos' })])
  })

  it('never adds the whole invoice next to its Parcialidades when its complementos are cancelled later', () => {
    emitida(facturaPpd({ subtotal: '10000.00', iva: '1600.00' }), '2019/08/f.xml')
    complemento('p1', pago(1, '2019-09-12', '4640.00', '6960.00'))
    importar()
    rmSync(join(root, 'Facturas/Emitidas/pagos'), { recursive: true })
    emitida(complementoXml({ uuid: 'c1000000-0000-4444-8888-p10000000000', pagos: [pago(1, '2019-09-12', '4640.00', '6960.00')] }), 'Canceladas/p1.xml')
    const log = importar()
    expect(filas().map((i) => [i.cfdiParcialidad, i.estado])).toEqual([
      [1, 'pagado'],
      [2, 'pendiente']
    ])
    expect(log.cambios.intactos.map((c) => c.motivo)).toEqual(['complementos'])
  })

  it('carries a waiting Sugerencia de importación to every Parcialidad of a split Ingreso', () => {
    const c = contactoConRfc()
    db.insert(proyectos).values({ nombre: 'Plataforma', contactoId: c.id, categoria: 'website', fechaInicio: '2019-01-01' }).run()
    emitida(appleseed(), '2019/08/f.xml')
    expect(importar().sugerencias).toBe(1)
    dosPagos()
    importar()
    const esperando = db.select().from(sugerenciasImportacion).all().map((s) => s.entidadId).sort()
    expect(esperando).toEqual(filas().map((i) => i.id).sort())
  })

  it('splits an invoice in another foreign currency by its own total', () => {
    const xml = facturaPpd({ moneda: 'EUR', tipoCambio: '20.00', subtotal: '862.07', iva: '137.93' })
    emitida(xml, '2023/06/f.xml')
    complemento('p1', pago(1, '2023-07-01', '400.00', '600.00'))
    complemento('p2', pago(2, '2023-08-01', '600.00', '0'))
    importar()
    const [uno, dos] = filas()
    expect(uno.total).toBe(Math.round(leerCfdi(xml).total * 0.4))
    expect(uno.total + dos.total).toBe(leerCfdi(xml).total)
    expect([uno.montoOriginal, dos.montoOriginal]).toEqual([null, null])
  })
})

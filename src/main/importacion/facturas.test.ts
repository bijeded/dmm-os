import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importarFacturas } from '.'
import { resumenFinanzas } from '../finanzas'
import { contactos, costos, cotizaciones, ingresos, proyectos, sugerenciasImportacion } from '../db/schema'
import { contacto, cotizacionAceptada, db, proyecto, reiniciarDb } from '../db/test-db'
import { cfdiXml, RFC_CLIENTE, RFC_DMM } from '../test-cfdi'

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

  it('reports an unreadable CFDI and keeps going', () => {
    escribir('Facturas/Emitidas/2026/roto.xml', '<html>no</html>')
    escribir('Facturas/Emitidas/2026/b.xml', cfdi('33333333-0000-4444-8888-99AABBCCDDEE'))
    const log = importarFacturas(db, root)
    expect(log.importados).toBe(1)
    expect(log.errores).toEqual([
      { archivo: 'Facturas/Emitidas/2026/roto.xml', error: 'El archivo no es un CFDI' }
    ])
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

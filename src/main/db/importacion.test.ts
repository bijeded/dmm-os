import { beforeEach, describe, expect, it } from 'vitest'
import { coberturaCostos, importarCfdi } from './importacion'
import { contactos, costos, cotizaciones, ingresos, proyectos, sugerenciasImportacion } from './schema'
import { contacto, cotizacionAceptada, db, proyecto, reiniciarDb } from './test-db'

beforeEach(reiniciarDb)

const RFC_DMM = 'DMM170101AB1'
const RFC_CLIENTE = 'EOC180202XY9'

function cfdi({
  uuid = 'A1B2C3D4-0000-4444-8888-99AABBCCDDEE',
  fecha = '2026-02-03',
  tipo = 'I',
  emisor = RFC_DMM,
  nombreEmisor = 'DMM STUDIOS SA DE CV',
  receptor = RFC_CLIENTE,
  subtotal = '1000.00',
  iva = '160.00',
  total = '1160.00',
  descripcion = 'Diseño de sitio web'
} = {}) {
  return `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Fecha="${fecha}T12:00:00" TipoDeComprobante="${tipo}" Moneda="MXN" SubTotal="${subtotal}" Total="${total}">
  <cfdi:Emisor Rfc="${emisor}" Nombre="${nombreEmisor}"/>
  <cfdi:Receptor Rfc="${receptor}" Nombre="ESTUDIO OCHO SA DE CV"/>
  <cfdi:Conceptos><cfdi:Concepto Descripcion="${descripcion}" Importe="${subtotal}"/></cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${iva}"/>
  <cfdi:Complemento><tfd:TimbreFiscalDigital UUID="${uuid}"/></cfdi:Complemento>
</cfdi:Comprobante>`
}

const contactoConRfc = (rfc = RFC_CLIENTE) =>
  db.insert(contactos).values({ nombre: 'Estudio Ocho', rfc }).returning().get()

describe('importar una factura emitida', () => {
  it('records it as an invoice Ingreso, already facturado but not yet paid', () => {
    const r = importarCfdi(db, cfdi(), 'emitida')
    expect(r.resultado).toBe('importado')
    const ingreso = db.select().from(ingresos).get()!
    expect(ingreso).toMatchObject({
      categoria: 'factura',
      estado: 'pendiente',
      estadoFacturacion: 'facturado',
      subtotal: 100_000,
      iva: 16_000,
      total: 116_000,
      fechaRegistro: '2026-02-03',
      cfdiUuid: 'a1b2c3d4-0000-4444-8888-99aabbccddee'
    })
  })

  it('links the Contacto by RFC', () => {
    const c = contactoConRfc()
    importarCfdi(db, cfdi(), 'emitida')
    expect(db.select().from(ingresos).get()!.contactoId).toBe(c.id)
  })

  it('leaves the Ingreso unlinked and reports the RFC when no Contacto has it', () => {
    const r = importarCfdi(db, cfdi(), 'emitida')
    expect(r.rfcDesconocido).toBe(RFC_CLIENTE)
    expect(db.select().from(ingresos).get()!.contactoId).toBeNull()
  })

  it('changes nothing when the same UUID is imported again', () => {
    contactoConRfc()
    importarCfdi(db, cfdi(), 'emitida')
    const segunda = importarCfdi(db, cfdi({ subtotal: '9999.00', total: '9999.00', iva: '0.00' }), 'emitida')
    expect(segunda.resultado).toBe('duplicado')
    expect(db.select().from(ingresos).all()).toHaveLength(1)
    expect(db.select().from(ingresos).get()!.subtotal).toBe(100_000)
  })

  it('ignores a CFDI that is not an ingreso or egreso voucher', () => {
    expect(importarCfdi(db, cfdi({ tipo: 'P' }), 'emitida').resultado).toBe('ignorado')
    expect(db.select().from(ingresos).all()).toHaveLength(0)
  })
})

describe('importar una factura recibida', () => {
  it('records it as a single Costo with its supplier', () => {
    const r = importarCfdi(db, cfdi({ emisor: 'PRV900101QQ1', nombreEmisor: 'HOSTING MX', receptor: RFC_DMM, descripcion: 'Hosting anual' }), 'recibida')
    expect(r.resultado).toBe('importado')
    expect(db.select().from(costos).get()).toMatchObject({
      nombre: 'Hosting anual',
      categoria: 'unico',
      estado: 'pendiente',
      estimado: false,
      proveedor: 'HOSTING MX',
      subtotal: 100_000,
      fecha: '2026-02-03',
      cfdiUuid: 'a1b2c3d4-0000-4444-8888-99aabbccddee'
    })
  })

  it('changes nothing when the same UUID is imported again', () => {
    const xml = cfdi({ receptor: RFC_DMM })
    importarCfdi(db, xml, 'recibida')
    expect(importarCfdi(db, xml, 'recibida').resultado).toBe('duplicado')
    expect(db.select().from(costos).all()).toHaveLength(1)
  })
})

describe('guessing the Proyecto', () => {
  function proyectoCotizado(total: number, fechaInicio = '2026-01-01') {
    const c = contactoConRfc()
    const q = db
      .insert(cotizaciones)
      .values({ contactoId: c.id, folio: 100 + total, categoria: 'website', estado: 'aceptada', fecha: '2026-01-10', subtotal: total, total })
      .returning()
      .get()
    const p = db
      .insert(proyectos)
      .values({ nombre: 'Hospital Jardín', contactoId: c.id, cotizacionId: q.id, categoria: 'website', fechaInicio })
      .returning()
      .get()
    return { contacto: c, proyecto: p }
  }

  it('leaves the guess as a Sugerencia de importación instead of linking it', () => {
    const { proyecto: p } = proyectoCotizado(116_000)
    const r = importarCfdi(db, cfdi(), 'emitida')
    expect(db.select().from(ingresos).get()!.proyectoId).toBeNull()
    const s = db.select().from(sugerenciasImportacion).get()!
    expect(s).toMatchObject({ entidad: 'ingreso', entidadId: r.id, proyectoId: p.id, estado: 'pendiente' })
    expect(s.motivo).toMatch(/monto/)
  })

  it('suggests the only Proyecto open at that date when no amount matches', () => {
    const { proyecto: p } = proyectoCotizado(500_000)
    importarCfdi(db, cfdi(), 'emitida')
    expect(db.select().from(sugerenciasImportacion).get()).toMatchObject({ proyectoId: p.id, motivo: 'fecha' })
  })

  it('suggests nothing when two Proyectos match the amount', () => {
    const c = contactoConRfc()
    for (const folio of [100, 101]) {
      const q = db
        .insert(cotizaciones)
        .values({ contactoId: c.id, folio, categoria: 'website', estado: 'aceptada', fecha: '2026-01-10', subtotal: 116_000, total: 116_000 })
        .returning()
        .get()
      db.insert(proyectos).values({ nombre: `P${folio}`, contactoId: c.id, cotizacionId: q.id, categoria: 'website', fechaInicio: '2026-01-01' }).run()
    }
    importarCfdi(db, cfdi(), 'emitida')
    expect(db.select().from(sugerenciasImportacion).all()).toHaveLength(0)
  })

  it('does not consider a Proyecto that had already closed before the CFDI', () => {
    const c = contactoConRfc()
    const q = cotizacionAceptada(c.id)
    db.insert(proyectos)
      .values({ nombre: 'Viejo', contactoId: c.id, cotizacionId: q.id, categoria: 'website', estado: 'completado', fechaInicio: '2025-01-01', fechaFin: '2025-06-30' })
      .run()
    importarCfdi(db, cfdi(), 'emitida')
    expect(db.select().from(sugerenciasImportacion).all()).toHaveLength(0)
  })

  it('makes no guess when the Contacto is unknown', () => {
    const c = contacto()
    proyecto(c.id, cotizacionAceptada(c.id).id)
    importarCfdi(db, cfdi(), 'emitida')
    expect(db.select().from(sugerenciasImportacion).all()).toHaveLength(0)
  })
})

describe('coberturaCostos', () => {
  it('marks Sin datos the years whose Costos were never imported', () => {
    importarCfdi(db, cfdi({ receptor: RFC_DMM, fecha: '2026-02-03' }), 'recibida')
    expect(coberturaCostos(db, 2024, 2026)).toEqual([
      { anio: 2024, sinDatos: true },
      { anio: 2025, sinDatos: true },
      { anio: 2026, sinDatos: false }
    ])
  })
})

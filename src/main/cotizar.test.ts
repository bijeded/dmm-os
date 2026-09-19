import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { costos, cotizaciones, definicionesCosto, definicionesIngreso, ingresos, proyectos, vigenciasPrecio } from './db/schema'
import { generarPeriodos } from './db/periodos'
import { contacto, db, reiniciarDb } from './db/test-db'
import {
  aceptarCotizacion,
  archivoPdf,
  borrarCotizacion,
  cancelarCotizacion,
  enviarCotizacion,
  expirarCotizaciones,
  fichaCotizacion,
  guardarCotizacion,
  listarCotizaciones,
  rechazarCotizacion
} from './cotizar'
import type { CotizacionNueva } from '../shared/dominio'

let root: string
let contactoId: number
const imprimir = vi.fn(async (html: string) => new TextEncoder().encode(`%PDF ${html.length}`))

beforeEach(() => {
  reiniciarDb()
  root = mkdtempSync(join(tmpdir(), 'dmm-cotizar-'))
  contactoId = contacto('Clínica Sol').id
  imprimir.mockClear()
})

const nueva = (cambios: Partial<CotizacionNueva> = {}): CotizacionNueva => ({
  contactoId,
  nombre: 'Rediseño sitio web',
  categoria: 'website',
  fecha: '2026-09-12',
  validezDias: 30,
  moneda: 'MXN',
  partidas: [
    { concepto: 'Sitio web', categoria: 'website', cantidad: 1, precio: 2_400_000 },
    { concepto: 'Blog', categoria: 'website', cantidad: 2, precio: 300_000 }
  ],
  conIva: true,
  facturacion: 'unica',
  parcialidades: null,
  stack: null,
  terminos: null,
  notas: null,
  costosEstimados: [{ concepto: 'Hosting', monto: 200_000, categoria: 'unico', parcialidades: null }],
  ...cambios
})

const enviada = async (cambios: Partial<CotizacionNueva> = {}) => {
  const { id } = guardarCotizacion(db, nueva(cambios))
  return enviarCotizacion(db, root, id, imprimir)
}

describe('guardar', () => {
  it('saves a draft without Folio, with totals from its items', () => {
    const f = guardarCotizacion(db, nueva())
    expect(f).toMatchObject({ folio: null, estado: 'borrador', subtotal: 3_000_000, iva: 480_000, total: 3_480_000, contacto: 'Clínica Sol' })
    expect(f.costosEstimados).toEqual([{ concepto: 'Hosting', monto: 200_000, categoria: 'unico', parcialidades: null }])
  })

  it('edits a draft in place', () => {
    const { id } = guardarCotizacion(db, nueva())
    const f = guardarCotizacion(db, nueva({ id, conIva: false, nombre: 'Landing' }))
    expect(f).toMatchObject({ id, nombre: 'Landing', iva: 0, total: 3_000_000 })
  })

  it('refuses a quote without name or items, or parcialidades without a count', () => {
    expect(() => guardarCotizacion(db, nueva({ nombre: ' ' }))).toThrow('nombre')
    expect(() => guardarCotizacion(db, nueva({ partidas: [] }))).toThrow('concepto')
    expect(() => guardarCotizacion(db, nueva({ facturacion: 'parcialidades', parcialidades: 1 }))).toThrow('parcialidades')
  })

  it('refuses to edit a quote once sent', async () => {
    const f = await enviada()
    expect(() => guardarCotizacion(db, nueva({ id: f.id }))).toThrow('borrador')
  })
})

describe('enviar', () => {
  it('assigns the next Folio and archives the PDF under Cotizaciones/<year>/', async () => {
    db.insert(cotizaciones).values({ contactoId, folio: 519, folioSufijo: 'b', categoria: 'app', estado: 'rechazada', fecha: '2025-01-01' }).run()
    const f = await enviada()
    expect(f).toMatchObject({ folio: '520', estado: 'enviada', pdf: 'Cotizaciones/2026/260912-DMM520-Rediseño sitio web.pdf' })
    expect(readFileSync(join(root, f.pdf!), 'utf8')).toMatch(/^%PDF/)
    const html = imprimir.mock.calls[0][0]
    expect(html).toContain('DMM520')
    expect(html).toContain('Clínica Sol')
    // Estimated costs are never shown to the Contacto.
    expect(html).not.toContain('Hosting')
  })

  it('names the file safely', () => {
    expect(archivoPdf({ folio: 7, fecha: '2027-01-05', nombre: 'Web / App: v2' })).toBe('Cotizaciones/2027/270105-DMM7-Web - App- v2.pdf')
  })

  it('keeps the draft untouched when printing fails', async () => {
    const { id } = guardarCotizacion(db, nueva())
    await expect(enviarCotizacion(db, root, id, async () => Promise.reject(new Error('sin impresora')))).rejects.toThrow('sin impresora')
    expect(fichaCotizacion(db, id)).toMatchObject({ estado: 'borrador', folio: null, pdf: null })
    expect(existsSync(join(root, 'Cotizaciones'))).toBe(false)
  })

  it('only sends drafts', async () => {
    const f = await enviada()
    await expect(enviarCotizacion(db, root, f.id, imprimir)).rejects.toThrow('borrador')
  })
})

describe('aceptar', () => {
  it('creates the Proyecto, a pending Ingreso por facturar with blank dates, and the estimated Costos', async () => {
    const f = aceptarCotizacion(db, root, (await enviada()).id, '2026-09-20')
    expect(f.estado).toBe('aceptada')
    const p = db.select().from(proyectos).where(eq(proyectos.id, f.proyectoId!)).get()!
    expect(p).toMatchObject({ nombre: 'Rediseño sitio web', contactoId, cotizacionId: f.id, categoria: 'website', estado: 'en_curso', fechaInicio: '2026-09-20' })
    expect(db.select().from(ingresos).all()).toMatchObject([
      { estado: 'pendiente', categoria: 'factura', estadoFacturacion: 'por_facturar', subtotal: 3_000_000, iva: 480_000, total: 3_480_000, fechaRegistro: null, fechaPago: null, proyectoId: p.id, cotizacionId: f.id, contactoId }
    ])
    expect(db.select().from(costos).all()).toMatchObject([
      { nombre: 'Hosting', estimado: true, estado: 'pendiente', categoria: 'unico', subtotal: 200_000, total: 200_000, proyectoId: p.id, cotizacionId: f.id }
    ])
  })

  it('splits parcialidades into pending Ingresos that add up to the total', async () => {
    aceptarCotizacion(db, root, (await enviada({ facturacion: 'parcialidades', parcialidades: 3, conIva: false, partidas: [{ concepto: 'x', categoria: 'app', cantidad: 1, precio: 1000 }] })).id, '2026-09-20')
    const is = db.select().from(ingresos).all()
    expect(is.map((i) => i.subtotal)).toEqual([334, 333, 333])
    expect(is.map((i) => i.notas)).toEqual(['Parcialidad 1 de 3', 'Parcialidad 2 de 3', 'Parcialidad 3 de 3'])
  })

  it('turns monthly billing into a monthly Ingreso definition from the month it was accepted', async () => {
    const f = aceptarCotizacion(db, root, (await enviada({ facturacion: 'mensual' })).id, '2026-09-20')
    expect(db.select().from(definicionesIngreso).all()).toMatchObject([{ tipo: 'mensual', periodoInicio: '2026-09', subtotal: 3_000_000, total: 3_480_000, proyectoId: f.proyectoId }])
    expect(db.select().from(ingresos).all()).toMatchObject([{ periodo: '2026-09', total: 3_480_000, proyectoId: f.proyectoId }])
  })

  it('creates the Proyecto folder in the DMM OS root', async () => {
    aceptarCotizacion(db, root, (await enviada()).id, '2026-09-20')
    expect(existsSync(join(root, 'Proyectos/Clínica Sol - Rediseño sitio web'))).toBe(true)
  })

  it('refuses a sent quote past its validity, marking it expirada', async () => {
    const { id } = await enviada({ fecha: '2026-09-01', validezDias: 30 })
    expect(() => aceptarCotizacion(db, root, id, '2026-10-02')).toThrow('enviada')
    expect(fichaCotizacion(db, id).estado).toBe('expirada')
    expect(db.select().from(proyectos).all()).toEqual([])
  })

  it('converts a USD quote to MXN at the given exchange rate, keeping the USD amount', async () => {
    const { id } = await enviada({
      moneda: 'USD',
      partidas: [{ concepto: 'App', categoria: 'app', cantidad: 1, precio: 100_000 }],
      costosEstimados: [{ concepto: 'Servidor', monto: 10_000, categoria: 'unico', parcialidades: null }]
    })
    expect(() => aceptarCotizacion(db, root, id, '2026-09-20')).toThrow('tipo de cambio')
    aceptarCotizacion(db, root, id, '2026-09-20', 18.5)
    expect(db.select().from(ingresos).all()).toMatchObject([{ subtotal: 1_850_000, iva: 296_000, total: 2_146_000, montoOriginal: 116_000, monedaOriginal: 'USD' }])
    expect(db.select().from(costos).all()).toMatchObject([{ subtotal: 185_000, total: 185_000, montoOriginal: 10_000, monedaOriginal: 'USD' }])
    expect(db.select().from(cotizaciones).where(eq(cotizaciones.id, id)).get()?.tipoCambio).toBe(18.5)
  })

  it('turns recurring estimated costs into Costo definitions from the month it was accepted', async () => {
    const f = aceptarCotizacion(
      db,
      root,
      (
        await enviada({
          costosEstimados: [
            { concepto: 'Hosting', monto: 50_000, categoria: 'mensual', parcialidades: null },
            { concepto: 'Laptop', monto: 250_000, categoria: 'msi', parcialidades: 12 },
            { concepto: 'Dominio', monto: 30_000, categoria: 'anual', parcialidades: null }
          ]
        })
      ).id,
      '2026-09-20'
    )
    expect(db.select().from(costos).all().map((c) => c.periodo)).toEqual(['2026-09', '2026-09', '2026-09'])
    expect(db.select().from(definicionesCosto).all()).toMatchObject([
      { nombre: 'Hosting', tipo: 'mensual', periodoInicio: '2026-09', diaDelMes: 20, numeroParcialidades: null, proyectoId: f.proyectoId },
      { nombre: 'Laptop', tipo: 'msi', periodoInicio: '2026-09', numeroParcialidades: 12, proyectoId: f.proyectoId },
      { nombre: 'Dominio', tipo: 'anual', periodoInicio: '2026-09', proyectoId: f.proyectoId }
    ])
    expect(db.select().from(vigenciasPrecio).all().map((v) => [v.desde, v.subtotal])).toEqual([
      ['2026-09', 50_000],
      ['2026-09', 250_000],
      ['2026-09', 30_000]
    ])
  })

  it('keeps a monthly estimated cost running after the quote is cancelled, until stopped in Finanzas', async () => {
    const f = aceptarCotizacion(
      db,
      root,
      (await enviada({ costosEstimados: [{ concepto: 'Hosting', monto: 50_000, categoria: 'mensual', parcialidades: null }] })).id,
      '2026-09-20'
    )
    expect(db.select().from(definicionesCosto).get()).toMatchObject({ cotizacionId: f.id })
    cancelarCotizacion(db, f.id)
    generarPeriodos(db, '2026-11')
    expect(db.select().from(costos).all().map((c) => c.periodo)).toEqual(['2026-09', '2026-10', '2026-11'])
  })

  it('refuses MSI estimated costs without an installment count', () => {
    expect(() => guardarCotizacion(db, nueva({ costosEstimados: [{ concepto: 'Laptop', monto: 1, categoria: 'msi', parcialidades: null }] }))).toThrow('MSI')
  })

  it('only accepts sent quotes', () => {
    const { id } = guardarCotizacion(db, nueva())
    expect(() => aceptarCotizacion(db, root, id, '2026-09-20')).toThrow('enviada')
  })
})

describe('expirar', () => {
  it('moves a sent quote to expirada once its validity has run out', async () => {
    const { id } = await enviada({ fecha: '2026-09-01', validezDias: 30 })
    expirarCotizaciones(db, '2026-10-01')
    expect(fichaCotizacion(db, id).estado).toBe('enviada')
    expirarCotizaciones(db, '2026-10-02')
    expect(fichaCotizacion(db, id).estado).toBe('expirada')
    expect(() => aceptarCotizacion(db, root, id, '2026-10-02')).toThrow('enviada')
  })

  it('leaves drafts and answered quotes alone', async () => {
    const borrador = guardarCotizacion(db, nueva({ fecha: '2020-01-01' }))
    const aceptada = aceptarCotizacion(db, root, (await enviada({ fecha: '2020-01-01' })).id, '2020-01-02')
    expirarCotizaciones(db, '2026-10-02')
    expect(fichaCotizacion(db, borrador.id).estado).toBe('borrador')
    expect(fichaCotizacion(db, aceptada.id).estado).toBe('aceptada')
  })
})

describe('rechazar, cancelar y borrar', () => {
  it('rejects a sent quote', async () => {
    expect(rechazarCotizacion(db, (await enviada()).id).estado).toBe('rechazada')
  })

  it('cancelling an accepted quote cancels its Proyecto and pending money', async () => {
    const f = aceptarCotizacion(db, root, (await enviada()).id, '2026-09-20')
    expect(cancelarCotizacion(db, f.id).estado).toBe('cancelada')
    expect(db.select().from(proyectos).get()!.estado).toBe('cancelado')
    expect(db.select().from(ingresos).get()!.estado).toBe('cancelado')
    expect(db.select().from(costos).get()!.estado).toBe('cancelado')
  })

  it('deletes drafts only', async () => {
    const { id } = guardarCotizacion(db, nueva())
    borrarCotizacion(db, id)
    expect(db.select().from(cotizaciones).all()).toEqual([])
    const f = await enviada()
    expect(() => borrarCotizacion(db, f.id)).toThrow('cancélala')
  })
})

describe('listar', () => {
  it('lists drafts first, then by Folio descending, with the stat cards and categories', async () => {
    const a = await enviada()
    const b = await enviada({ categoria: 'ai', partidas: [{ concepto: 'Bot', categoria: 'ai', cantidad: 1, precio: 1_000_000 }] })
    aceptarCotizacion(db, root, a.id, '2026-09-20')
    guardarCotizacion(db, nueva({ nombre: 'Borrador' }))

    const l = listarCotizaciones(db)
    expect(l.cotizaciones.map((c) => c.folio)).toEqual([null, b.folio, a.folio])
    expect(l.cotizaciones[1]).toMatchObject({ contacto: 'Clínica Sol', categoria: 'ai', subtotal: 1_000_000, estado: 'enviada', pdf: true })
    expect(l.resumen).toEqual({ total: 2, enviadas: 1, conversion: 50, montoAbiertas: 1_000_000, promedio: 2_000_000 })
    expect(l.porCategoria).toMatchObject({ website: 1, ai: 1, app: 0 })
  })
})

describe('acciones', () => {
  it('lists the actions each estado allows', async () => {
    expect(guardarCotizacion(db, nueva()).acciones).toEqual(['editar', 'borrar', 'enviar'])
    const f = await enviada()
    expect(f.acciones).toEqual(['aceptar', 'rechazar', 'cancelar'])
    expect(aceptarCotizacion(db, root, f.id, '2026-09-20').acciones).toEqual(['cancelar'])
    expect(cancelarCotizacion(db, f.id).acciones).toEqual([])
    const r = await enviada()
    expect(rechazarCotizacion(db, r.id).acciones).toEqual([])
  })
})

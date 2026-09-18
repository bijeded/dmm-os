import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { costos, cotizaciones, definicionesIngreso, ingresos, proyectos } from './db/schema'
import { contacto, db, reiniciarDb } from './db/test-db'
import {
  aceptarCotizacion,
  archivoPdf,
  borrarCotizacion,
  cancelarCotizacion,
  enviarCotizacion,
  fichaCotizacion,
  guardarCotizacion,
  listarCotizaciones,
  rechazarCotizacion
} from './cotizar'
import type { CotizacionNueva } from '../shared/ipc'

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
  costosEstimados: [{ concepto: 'Hosting', monto: 200_000 }],
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
    expect(f.costosEstimados).toEqual([{ concepto: 'Hosting', monto: 200_000 }])
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
    const f = aceptarCotizacion(db, (await enviada()).id, '2026-09-20')
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
    aceptarCotizacion(db, (await enviada({ facturacion: 'parcialidades', parcialidades: 3, conIva: false, partidas: [{ concepto: 'x', categoria: 'app', cantidad: 1, precio: 1000 }] })).id, '2026-09-20')
    const is = db.select().from(ingresos).all()
    expect(is.map((i) => i.subtotal)).toEqual([334, 333, 333])
    expect(is.map((i) => i.notas)).toEqual(['Parcialidad 1 de 3', 'Parcialidad 2 de 3', 'Parcialidad 3 de 3'])
  })

  it('turns monthly billing into a monthly Ingreso definition from the month it was accepted', async () => {
    const f = aceptarCotizacion(db, (await enviada({ facturacion: 'mensual' })).id, '2026-09-20')
    expect(db.select().from(definicionesIngreso).all()).toMatchObject([{ tipo: 'mensual', periodoInicio: '2026-09', subtotal: 3_000_000, total: 3_480_000, proyectoId: f.proyectoId }])
    expect(db.select().from(ingresos).all()).toEqual([])
  })

  it('only accepts sent quotes', () => {
    const { id } = guardarCotizacion(db, nueva())
    expect(() => aceptarCotizacion(db, id, '2026-09-20')).toThrow('enviada')
  })
})

describe('rechazar, cancelar y borrar', () => {
  it('rejects a sent quote', async () => {
    expect(rechazarCotizacion(db, (await enviada()).id).estado).toBe('rechazada')
  })

  it('cancelling an accepted quote cancels its Proyecto and pending money', async () => {
    const f = aceptarCotizacion(db, (await enviada()).id, '2026-09-20')
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
    aceptarCotizacion(db, a.id, '2026-09-20')
    guardarCotizacion(db, nueva({ nombre: 'Borrador' }))

    const l = listarCotizaciones(db)
    expect(l.cotizaciones.map((c) => c.folio)).toEqual([null, b.folio, a.folio])
    expect(l.cotizaciones[1]).toMatchObject({ contacto: 'Clínica Sol', categoria: 'ai', subtotal: 1_000_000, estado: 'enviada', pdf: true })
    expect(l.resumen).toEqual({ total: 2, enviadas: 1, conversion: 50, montoAbiertas: 1_000_000, promedio: 2_000_000 })
    expect(l.porCategoria).toMatchObject({ website: 1, ai: 1, app: 0 })
  })
})

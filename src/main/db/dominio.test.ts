import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from './index'
import {
  asignarCosto,
  borrar,
  cancelar,
  generarPeriodos,
  RegistroVinculadoError,
  registrarReembolso
} from './dominio'
import {
  contactos,
  costos,
  cotizaciones,
  definicionesCosto,
  definicionesIngreso,
  ingresos,
  proyectos,
  vigenciasPrecio
} from './schema'

const migrationsFolder = resolve(import.meta.dirname, '../../../drizzle')
let db: Db

beforeEach(() => {
  db = openDatabase(':memory:', migrationsFolder).db
})

function contacto(nombre = 'Estudio Ocho') {
  return db.insert(contactos).values({ nombre }).returning().get()
}

function cotizacionAceptada(contactoId: number, folio = 100) {
  return db
    .insert(cotizaciones)
    .values({ contactoId, folio, categoria: 'website', estado: 'aceptada', fecha: '2026-01-10' })
    .returning()
    .get()
}

function proyecto(contactoId: number, cotizacionId: number | null) {
  return db
    .insert(proyectos)
    .values({ nombre: 'Hospital Jardín', contactoId, cotizacionId, categoria: 'website' })
    .returning()
    .get()
}

const ingresoBase = { fechaRegistro: '2026-02-01', subtotal: 1000, iva: 160, total: 1160 }

describe('schema constraints', () => {
  it('allows at most one Proyecto per Cotización', () => {
    const c = contacto()
    const q = cotizacionAceptada(c.id)
    proyecto(c.id, q.id)
    expect(() => proyecto(c.id, q.id)).toThrow(/UNIQUE/)
  })

  it('requires Folio exactly when the Cotización is no longer a draft', () => {
    const c = contacto()
    const base = { contactoId: c.id, categoria: 'app' as const, fecha: '2026-01-01' }
    expect(() => db.insert(cotizaciones).values({ ...base, folio: 5 }).run()).toThrow(/CHECK/)
    expect(() => db.insert(cotizaciones).values({ ...base, estado: 'enviada' }).run()).toThrow(
      /CHECK/
    )
    db.insert(cotizaciones).values(base).run()
  })

  it('keeps personal Proyectos free of Contacto and Cotización', () => {
    const c = contacto()
    expect(() =>
      db
        .insert(proyectos)
        .values({ nombre: 'x', etiqueta: 'personal', contactoId: c.id, categoria: 'ai' })
        .run()
    ).toThrow(/CHECK/)
  })

  it('gives Estado de facturación only to invoice Ingresos', () => {
    expect(() =>
      db.insert(ingresos).values({ ...ingresoBase, categoria: 'factura' }).run()
    ).toThrow(/CHECK/)
    expect(() =>
      db
        .insert(ingresos)
        .values({ ...ingresoBase, categoria: 'sin_factura', estadoFacturacion: 'facturado' })
        .run()
    ).toThrow(/CHECK/)
  })

  it('is idempotent by CFDI UUID', () => {
    const v = { ...ingresoBase, categoria: 'sin_factura' as const, cfdiUuid: 'abc' }
    db.insert(ingresos).values(v).run()
    expect(() => db.insert(ingresos).values(v).run()).toThrow(/UNIQUE/)
  })
})

describe('borrar', () => {
  it('deletes an unlinked Contacto', () => {
    const c = contacto()
    borrar(db, 'contacto', c.id)
    expect(db.select().from(contactos).all()).toEqual([])
  })

  it('refuses to delete a linked record', () => {
    const c = contacto()
    cotizacionAceptada(c.id)
    expect(() => borrar(db, 'contacto', c.id)).toThrow(RegistroVinculadoError)
  })
})

describe('cancelar', () => {
  it('cascades between Cotización and Proyecto, keeping paid money', () => {
    const c = contacto()
    const q = cotizacionAceptada(c.id)
    const p = proyecto(c.id, q.id)
    const pagado = db
      .insert(ingresos)
      .values({ ...ingresoBase, categoria: 'sin_factura', estado: 'pagado', proyectoId: p.id })
      .returning()
      .get()
    const pendiente = db
      .insert(ingresos)
      .values({ ...ingresoBase, categoria: 'sin_factura', cotizacionId: q.id })
      .returning()
      .get()
    const estimado = db
      .insert(costos)
      .values({
        nombre: 'hosting',
        categoria: 'unico',
        estimado: true,
        subtotal: 10,
        total: 10,
        fecha: '2026-02-01',
        cotizacionId: q.id
      })
      .returning()
      .get()

    cancelar(db, 'proyecto', p.id)

    const estado = <T extends { id: number; estado: string }>(rows: T[], id: number) =>
      rows.find((r) => r.id === id)?.estado
    expect(db.select().from(cotizaciones).get()?.estado).toBe('cancelada')
    expect(db.select().from(proyectos).get()?.estado).toBe('cancelado')
    expect(estado(db.select().from(ingresos).all(), pagado.id)).toBe('pagado')
    expect(estado(db.select().from(ingresos).all(), pendiente.id)).toBe('cancelado')
    expect(estado(db.select().from(costos).all(), estimado.id)).toBe('cancelado')
  })

  it('cancelling the Cotización cancels its Proyecto', () => {
    const c = contacto()
    const q = cotizacionAceptada(c.id)
    proyecto(c.id, q.id)
    cancelar(db, 'cotizacion', q.id)
    expect(db.select().from(proyectos).get()?.estado).toBe('cancelado')
  })
})

describe('registrarReembolso', () => {
  it('creates a negative Ingreso linked to the original', () => {
    const o = db
      .insert(ingresos)
      .values({ ...ingresoBase, categoria: 'sin_factura', estado: 'pagado' })
      .returning()
      .get()
    const r = registrarReembolso(db, o.id, { subtotal: 500, iva: 80, fecha: '2026-03-05' })
    expect(r).toMatchObject({ reembolsoDeId: o.id, total: -580, fechaPago: '2026-03-05' })
  })
})

describe('generarPeriodos', () => {
  it('generates monthly Ingresos up to the current month, idempotently', () => {
    const c = contacto()
    const q = cotizacionAceptada(c.id)
    const p = proyecto(c.id, q.id)
    db.insert(definicionesIngreso)
      .values({
        cotizacionId: q.id,
        proyectoId: p.id,
        contactoId: c.id,
        tipo: 'mensual',
        categoria: 'factura',
        subtotal: 5000,
        iva: 800,
        total: 5800,
        diaDelMes: 31,
        periodoInicio: '2026-01'
      })
      .run()

    generarPeriodos(db, '2026-03')
    generarPeriodos(db, '2026-03')

    const rows = db.select().from(ingresos).all()
    expect(rows.map((r) => [r.periodo, r.fechaRegistro, r.estadoFacturacion])).toEqual([
      ['2026-01', '2026-01-31', 'por_facturar'],
      ['2026-02', '2026-02-28', 'por_facturar'],
      ['2026-03', '2026-03-31', 'por_facturar']
    ])
  })

  it('stops a monthly series once its Proyecto is completed', () => {
    const c = contacto()
    const p = proyecto(c.id, null)
    db.insert(definicionesIngreso)
      .values({
        proyectoId: p.id,
        tipo: 'mensual',
        categoria: 'sin_factura',
        subtotal: 1,
        total: 1,
        periodoInicio: '2026-01'
      })
      .run()
    generarPeriodos(db, '2026-01')
    db.update(proyectos).set({ estado: 'completado' }).where(eq(proyectos.id, p.id)).run()
    generarPeriodos(db, '2026-04')
    expect(db.select().from(ingresos).all()).toHaveLength(1)
  })

  it('limits installments and applies Vigencia de precio from its date forward', () => {
    const d = db
      .insert(definicionesCosto)
      .values({
        nombre: 'Claude Max',
        tipo: 'msi',
        numeroParcialidades: 3,
        diaDelMes: 5,
        periodoInicio: '2026-01'
      })
      .returning()
      .get()
    db.insert(vigenciasPrecio)
      .values([
        { definicionCostoId: d.id, desde: '2026-01', subtotal: 100, total: 100 },
        { definicionCostoId: d.id, desde: '2026-02', subtotal: 200, total: 200 }
      ])
      .run()

    generarPeriodos(db, '2026-01')
    db.insert(vigenciasPrecio)
      .values({ definicionCostoId: d.id, desde: '2026-01', subtotal: 999, total: 999 })
      .onConflictDoUpdate({
        target: [vigenciasPrecio.definicionCostoId, vigenciasPrecio.desde],
        set: { subtotal: 999, total: 999 }
      })
      .run()
    generarPeriodos(db, '2026-06')

    expect(db.select().from(costos).all().map((r) => [r.periodo, r.total])).toEqual([
      ['2026-01', 100],
      ['2026-02', 200],
      ['2026-03', 200]
    ])
  })
})

describe('asignarCosto', () => {
  it('splits by tokens, or evenly without usage data, without losing centavos', () => {
    const c = contacto()
    const a = proyecto(c.id, null)
    const b = db
      .insert(proyectos)
      .values({ nombre: 'B-Genius', contactoId: c.id, categoria: 'ai' })
      .returning()
      .get()
    const costo = db
      .insert(costos)
      .values({ nombre: 'Claude', categoria: 'mensual', subtotal: 1001, total: 1001, fecha: '2026-01-05' })
      .returning()
      .get()

    const porTokens = asignarCosto(db, costo.id, [
      { proyectoId: a.id, tokens: 300 },
      { proyectoId: b.id, tokens: 100 }
    ])
    expect(porTokens.map((x) => x.monto)).toEqual([751, 250])

    const parejo = asignarCosto(db, costo.id, [
      { proyectoId: a.id, tokens: null },
      { proyectoId: b.id, tokens: null }
    ])
    expect(parejo.map((x) => x.monto)).toEqual([501, 500])
    expect(db.select().from(costos).all()).toHaveLength(1)
  })
})

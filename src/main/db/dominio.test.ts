import { beforeEach, describe, expect, it } from 'vitest'
import { asignarCosto } from './dominio'
import { costos, cotizaciones, ingresos, proyectos } from './schema'
import { contacto, cotizacionAceptada, db, ingresoBase, proyecto, reiniciarDb } from './test-db'

beforeEach(reiniciarDb)

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

import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { cancelar } from './cancelacion'
import { generarPeriodos } from './periodos'
import {
  costos,
  definicionesCosto,
  definicionesIngreso,
  ingresos,
  proyectos,
  vigenciasPrecio
} from './schema'
import { contacto, cotizacionAceptada, db, proyecto, reiniciarDb } from './test-db'

beforeEach(reiniciarDb)

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

  it('stops installment Ingresos once the Cotización is cancelled', () => {
    const c = contacto()
    const q = cotizacionAceptada(c.id)
    db.insert(definicionesIngreso)
      .values({
        cotizacionId: q.id,
        tipo: 'parcialidades',
        numeroParcialidades: 6,
        categoria: 'sin_factura',
        subtotal: 1,
        total: 1,
        periodoInicio: '2026-01'
      })
      .run()
    generarPeriodos(db, '2026-01')
    cancelar(db, 'cotizacion', q.id)
    generarPeriodos(db, '2026-04')
    expect(db.select().from(ingresos).all().map((r) => r.estado)).toEqual(['cancelado'])
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

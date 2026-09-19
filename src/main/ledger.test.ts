import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { costos, cotizaciones, definicionesCosto, definicionesIngreso, ingresos, proyectos, vigenciasPrecio } from './db/schema'
import { contacto, db, proyecto, reiniciarDb } from './db/test-db'
import { alDia } from './ledger'

let contactoId: number

beforeEach(() => {
  reiniciarDb()
  contactoId = contacto().id
})

/** A monthly Costo series from August, on the Proyecto given. */
function mensual(proyectoId: number | null) {
  const d = db
    .insert(definicionesCosto)
    .values({ nombre: 'Hosting', tipo: 'mensual', proyectoId, diaDelMes: 5, periodoInicio: '2026-08' })
    .returning()
    .get()
  db.insert(vigenciasPrecio).values({ definicionCostoId: d.id, desde: '2026-08', subtotal: 1000, iva: 160, total: 1160 }).run()
}

/** A monthly Ingreso series from August, on the Proyecto given. */
function ingresoMensual(proyectoId: number | null) {
  db.insert(definicionesIngreso)
    .values({ proyectoId, contactoId, tipo: 'mensual', categoria: 'sin_factura', subtotal: 5000, iva: 0, total: 5000, periodoInicio: '2026-08' })
    .run()
}

const periodosIngreso = () => db.select({ periodo: ingresos.periodo }).from(ingresos).all().map((i) => i.periodo)

const periodos = () => db.select({ periodo: costos.periodo }).from(costos).all().map((c) => c.periodo)

describe('alDia', () => {
  it('generates the Periodos up to hoy and never twice, across a month boundary', () => {
    mensual(null)
    alDia(db, '2026-09-30')
    alDia(db, '2026-09-30')
    alDia(db, '2026-10-01')
    alDia(db, '2026-10-01')
    expect(periodos()).toEqual(['2026-08', '2026-09', '2026-10'])
  })

  it('generates Ingreso Periodos once too, across a month boundary', () => {
    ingresoMensual(null)
    alDia(db, '2026-09-30')
    alDia(db, '2026-10-01')
    alDia(db, '2026-10-01')
    expect(periodosIngreso()).toEqual(['2026-08', '2026-09', '2026-10'])
  })

  it.each(['completado', 'cancelado'] as const)('does not generate for a %s Proyecto', (estado) => {
    const p = proyecto(contactoId, null)
    db.update(proyectos).set({ estado }).where(eq(proyectos.id, p.id)).run()
    mensual(p.id)
    ingresoMensual(p.id)
    alDia(db, '2026-10-01')
    expect(periodos()).toEqual([])
    expect(periodosIngreso()).toEqual([])
  })

  it('expires a sent Cotización past its validity', () => {
    const c = db
      .insert(cotizaciones)
      .values({ contactoId, folio: 1, categoria: 'website', estado: 'enviada', fecha: '2026-09-01', validezDias: 15 })
      .returning()
      .get()
    const estado = () => db.select().from(cotizaciones).where(eq(cotizaciones.id, c.id)).get()!.estado
    alDia(db, '2026-09-16')
    expect(estado()).toBe('enviada')
    alDia(db, '2026-09-17')
    expect(db.select().from(cotizaciones).where(eq(cotizaciones.id, c.id)).get()!.estado).toBe('expirada')
  })
})

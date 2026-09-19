import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { costos, cotizaciones, definicionesCosto, proyectos, vigenciasPrecio } from './db/schema'
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

  it('does not generate for a closed Proyecto', () => {
    const p = proyecto(contactoId, null)
    db.update(proyectos).set({ estado: 'completado' }).where(eq(proyectos.id, p.id)).run()
    mensual(p.id)
    alDia(db, '2026-10-01')
    expect(periodos()).toEqual([])
  })

  it('expires a sent Cotización past its validity', () => {
    const c = db
      .insert(cotizaciones)
      .values({ contactoId, folio: 1, categoria: 'website', estado: 'enviada', fecha: '2026-09-01', validezDias: 15 })
      .returning()
      .get()
    alDia(db, '2026-09-17')
    expect(db.select().from(cotizaciones).where(eq(cotizaciones.id, c.id)).get()!.estado).toBe('expirada')
  })
})

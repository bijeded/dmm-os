import { beforeEach, describe, expect, it } from 'vitest'
import { borrar, cancelar, RegistroVinculadoError } from './cancelacion'
import { contactos, costos, cotizaciones, ingresos, proyectos } from './schema'
import { contacto, cotizacionAceptada, db, ingresoBase, proyecto, reiniciarDb } from './test-db'

beforeEach(reiniciarDb)

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

  it('asks each lifecycle first: a completed Proyecto keeps its Cotización from cancelling', () => {
    const c = contacto()
    const q = cotizacionAceptada(c.id)
    const p = proyecto(c.id, q.id)
    db.update(proyectos).set({ estado: 'completado' }).run()
    expect(() => cancelar(db, 'cotizacion', q.id)).toThrow(/en curso o pausado/)
    expect(() => cancelar(db, 'proyecto', p.id)).toThrow(/en curso o pausado/)
    expect(db.select().from(cotizaciones).get()?.estado).toBe('aceptada')
    expect(db.select().from(proyectos).get()?.estado).toBe('completado')
  })

  it('refuses a draft Cotización with its own message', () => {
    const c = contacto()
    const q = cotizacionAceptada(c.id)
    db.update(cotizaciones).set({ estado: 'borrador', folio: null }).run()
    expect(() => cancelar(db, 'cotizacion', q.id)).toThrow(/enviada o aceptada/)
  })
})

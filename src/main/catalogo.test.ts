import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { borrarConcepto, guardarConcepto, listarCatalogo, partidaDe } from './catalogo'
import { cotizaciones } from './db/schema'
import { contacto, db, reiniciarDb } from './db/test-db'

beforeEach(reiniciarDb)

const sitio = { concepto: 'Sitio web · 6 secc.', categoria: 'website' as const, precio: 2_400_000 }

describe('Catálogo', () => {
  it('lists concepts by name', () => {
    guardarConcepto(db, { concepto: 'Tienda en línea', categoria: 'ecommerce', precio: 4_200_000 })
    guardarConcepto(db, { concepto: 'Chatbot AI', categoria: 'ai', precio: 1_800_000 })
    expect(listarCatalogo(db).map((c) => c.concepto)).toEqual(['Chatbot AI', 'Tienda en línea'])
  })

  it('edits a concept in place', () => {
    const [c] = guardarConcepto(db, sitio)
    guardarConcepto(db, { ...sitio, id: c.id, precio: 2_600_000 })
    expect(listarCatalogo(db)).toEqual([{ ...sitio, id: c.id, precio: 2_600_000 }])
  })

  it('refuses a concept without a name or with a negative or fractional price', () => {
    expect(() => guardarConcepto(db, { ...sitio, concepto: '  ' })).toThrow('El concepto necesita nombre')
    expect(() => guardarConcepto(db, { ...sitio, precio: -1 })).toThrow('El precio')
    expect(() => guardarConcepto(db, { ...sitio, precio: 1.5 })).toThrow('El precio')
    expect(listarCatalogo(db)).toEqual([])
  })

  it('deletes a concept', () => {
    const [c] = guardarConcepto(db, sitio)
    expect(borrarConcepto(db, c.id)).toEqual([])
  })

  it('a Cotización copies the price at creation; later edits and deletes do not touch it', () => {
    const [c] = guardarConcepto(db, sitio)
    const partida = partidaDe(db, c.id, 2)
    expect(partida).toEqual({ concepto: sitio.concepto, categoria: 'website', cantidad: 2, precio: 2_400_000 })

    const cot = db
      .insert(cotizaciones)
      .values({ contactoId: contacto().id, categoria: 'website', fecha: '2026-09-18', items: [partida] })
      .returning()
      .get()
    guardarConcepto(db, { ...sitio, id: c.id, precio: 9_900_000 })
    borrarConcepto(db, c.id)

    expect(db.select().from(cotizaciones).where(eq(cotizaciones.id, cot.id)).get()!.items).toEqual([partida])
  })

  it('has no price to copy from a concept that does not exist', () => {
    expect(() => partidaDe(db, 999)).toThrow('No existe el concepto')
  })
})

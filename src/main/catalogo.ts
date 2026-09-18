import { eq } from 'drizzle-orm'
import type { Db } from './db'
import { catalogo } from './db/schema'
import type { ConceptoCatalogo, ConceptoNuevo, PartidaCotizacion } from '../shared/ipc'

const campos = { id: catalogo.id, concepto: catalogo.concepto, categoria: catalogo.categoria, precio: catalogo.precio }

export function listarCatalogo(db: Db): ConceptoCatalogo[] {
  return db
    .select(campos)
    .from(catalogo)
    .all()
    .sort((a, b) => a.concepto.localeCompare(b.concepto, 'es', { sensitivity: 'base' }))
}

export function guardarConcepto(db: Db, { id, concepto, categoria, precio }: ConceptoNuevo): ConceptoCatalogo[] {
  const nombre = concepto.trim()
  if (!nombre) throw new Error('El concepto necesita nombre')
  if (!Number.isInteger(precio) || precio < 0) throw new Error('El precio debe ser un monto positivo')
  const valores = { concepto: nombre, categoria, precio }
  if (id === undefined) db.insert(catalogo).values(valores).run()
  else db.update(catalogo).set(valores).where(eq(catalogo.id, id)).run()
  return listarCatalogo(db)
}

export function borrarConcepto(db: Db, id: number): ConceptoCatalogo[] {
  db.delete(catalogo).where(eq(catalogo.id, id)).run()
  return listarCatalogo(db)
}

/** What a new Cotización stores for a concept: its price as of now, copied, never linked. */
export function partidaDe(db: Db, id: number, cantidad = 1): PartidaCotizacion {
  const c = db.select(campos).from(catalogo).where(eq(catalogo.id, id)).get()
  if (!c) throw new Error('No existe el concepto')
  return { concepto: c.concepto, categoria: c.categoria, cantidad, precio: c.precio }
}

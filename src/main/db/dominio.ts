import { eq } from 'drizzle-orm'
import type { Db } from './index'
import { asignacionesCosto, costos } from './schema'

/**
 * Asignación de costo: splits a Costo's subtotal across Proyectos by token usage,
 * evenly when there is no usage data. Replaces previous allocations for that Costo.
 */
export function asignarCosto(
  db: Db,
  costoId: number,
  usos: { proyectoId: number; tokens: number | null }[]
) {
  const costo = db.select().from(costos).where(eq(costos.id, costoId)).get()
  if (!costo) throw new Error(`costo ${costoId} no existe`)
  if (usos.length === 0) return []
  const totalTokens = usos.reduce((s, u) => s + (u.tokens ?? 0), 0)
  const pesos = usos.map((u) => (totalTokens > 0 ? (u.tokens ?? 0) / totalTokens : 1 / usos.length))
  const montos = pesos.map((p) => Math.floor(costo.subtotal * p))
  const resto = costo.subtotal - montos.reduce((s, m) => s + m, 0)
  montos[pesos.indexOf(Math.max(...pesos))] += resto

  return db.transaction((tx) => {
    tx.delete(asignacionesCosto).where(eq(asignacionesCosto.costoId, costoId)).run()
    return usos.map((u, i) =>
      tx
        .insert(asignacionesCosto)
        .values({ costoId, proyectoId: u.proyectoId, tokens: u.tokens, monto: montos[i] })
        .returning()
        .get()
    )
  })
}

import { sql } from 'drizzle-orm'
import type { CoberturaAnual } from '../../shared/ipc'
import type { Db } from './index'
import { costos } from './schema'

/**
 * Sin datos: a year whose Costos were never imported. Its margin and profit are shown as
 * Sin datos rather than estimated from the Ingresos alone.
 */
export function coberturaCostos(db: Db, desde: number, hasta: number): CoberturaAnual[] {
  const conDatos = new Set(
    db
      .select({ anio: sql<string>`substr(${costos.fecha}, 1, 4)` })
      .from(costos)
      .groupBy(sql`substr(${costos.fecha}, 1, 4)`)
      .all()
      .map((r) => Number(r.anio))
  )
  return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i).map((anio) => ({
    anio,
    sinDatos: !conDatos.has(anio)
  }))
}

import { and, eq, or } from 'drizzle-orm'
import type { Db } from './index'
import { contactos, costos, cotizaciones, ingresos, proyectos } from './schema'

export class RegistroVinculadoError extends Error {
  constructor(entidad: string, id: number) {
    super(`${entidad} ${id} tiene registros vinculados; cancélalo en lugar de borrarlo`)
    this.name = 'RegistroVinculadoError'
  }
}

const tablasBorrables = { contacto: contactos, cotizacion: cotizaciones, proyecto: proyectos }

/** Borrar vs cancelar: deleting a record with linked records is refused. */
export function borrar(db: Db, entidad: keyof typeof tablasBorrables, id: number) {
  const tabla = tablasBorrables[entidad]
  try {
    db.delete(tabla).where(eq(tabla.id, id)).run()
  } catch (e) {
    // ON DELETE RESTRICT surfaces as SQLITE_CONSTRAINT_TRIGGER, so match the message.
    if (e instanceof Error && e.message.includes('FOREIGN KEY constraint failed')) {
      throw new RegistroVinculadoError(entidad, id)
    }
    throw e
  }
}

/** Cancelling a Cotización or its Proyecto cancels both (Cancelación con pagos). */
export function cancelar(db: Db, entidad: 'cotizacion' | 'proyecto', id: number) {
  db.transaction((tx) => {
    let cotizacionId: number | null
    let proyectoId: number | null
    if (entidad === 'proyecto') {
      const p = tx.select().from(proyectos).where(eq(proyectos.id, id)).get()
      if (!p) throw new Error(`proyecto ${id} no existe`)
      proyectoId = p.id
      cotizacionId = p.cotizacionId
    } else {
      cotizacionId = id
      proyectoId =
        tx.select({ id: proyectos.id }).from(proyectos).where(eq(proyectos.cotizacionId, id)).get()
          ?.id ?? null
    }

    if (proyectoId !== null) {
      tx.update(proyectos).set({ estado: 'cancelado' }).where(eq(proyectos.id, proyectoId)).run()
    }
    if (cotizacionId !== null) {
      tx.update(cotizaciones)
        .set({ estado: 'cancelada' })
        .where(eq(cotizaciones.id, cotizacionId))
        .run()
    }

    const deIngreso = or(
      proyectoId !== null ? eq(ingresos.proyectoId, proyectoId) : undefined,
      cotizacionId !== null ? eq(ingresos.cotizacionId, cotizacionId) : undefined
    )
    const deCosto = or(
      proyectoId !== null ? eq(costos.proyectoId, proyectoId) : undefined,
      cotizacionId !== null ? eq(costos.cotizacionId, cotizacionId) : undefined
    )

    tx.update(ingresos)
      .set({ estado: 'cancelado' })
      .where(and(eq(ingresos.estado, 'pendiente'), deIngreso))
      .run()
    tx.update(costos)
      .set({ estado: 'cancelado' })
      .where(and(eq(costos.estado, 'pendiente'), eq(costos.estimado, true), deCosto))
      .run()
  })
}

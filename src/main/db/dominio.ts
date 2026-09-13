import { and, eq, inArray, lte, or } from 'drizzle-orm'
import type { Db } from './index'
import {
  asignacionesCosto,
  contactos,
  costos,
  cotizaciones,
  definicionesCosto,
  definicionesIngreso,
  ingresos,
  proyectos,
  vigenciasPrecio
} from './schema'

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

/** Reembolso: a negative Ingreso linked to the original, dated when the money went back. */
export function registrarReembolso(
  db: Db,
  ingresoId: number,
  r: { subtotal: number; iva: number; fecha: string }
) {
  const original = db.select().from(ingresos).where(eq(ingresos.id, ingresoId)).get()
  if (!original) throw new Error(`ingreso ${ingresoId} no existe`)
  return db
    .insert(ingresos)
    .values({
      categoria: original.categoria,
      estado: 'pagado',
      estadoFacturacion: original.estadoFacturacion,
      subtotal: -Math.abs(r.subtotal),
      iva: -Math.abs(r.iva),
      total: -(Math.abs(r.subtotal) + Math.abs(r.iva)),
      proyectoId: original.proyectoId,
      cotizacionId: original.cotizacionId,
      contactoId: original.contactoId,
      fechaRegistro: r.fecha,
      fechaPago: r.fecha,
      reembolsoDeId: original.id
    })
    .returning()
    .get()
}

export function periodoDe(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

function sumarMeses(periodo: string, n: number): string {
  const [y, m] = periodo.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

function fechaEnPeriodo(periodo: string, dia: number): string {
  const [y, m] = periodo.split('-').map(Number)
  const ultimo = new Date(y, m, 0).getDate()
  return `${periodo}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`
}

function periodosHasta(
  inicio: string,
  hasta: string,
  fin: string | null,
  cada: number,
  maximo: number | null
): string[] {
  const out: string[] = []
  for (let p = inicio; p <= hasta && (!fin || p <= fin); p = sumarMeses(p, cada)) {
    if (maximo !== null && out.length >= maximo) break
    out.push(p)
  }
  return out
}

/**
 * Periodo generado: lazily creates Ingreso/Costo rows from definitions up to `periodoActual`.
 * Idempotent (unique on definition + period). Monthly Ingreso series stop once the Proyecto is
 * completed or cancelled.
 */
export function generarPeriodos(db: Db, periodoActual: string) {
  db.transaction((tx) => {
    const cerrados = new Set(
      tx
        .select({ id: proyectos.id })
        .from(proyectos)
        .where(inArray(proyectos.estado, ['completado', 'cancelado']))
        .all()
        .map((p) => p.id)
    )

    for (const d of tx.select().from(definicionesIngreso).all()) {
      if (d.tipo === 'mensual' && d.proyectoId !== null && cerrados.has(d.proyectoId)) continue
      const periodos = periodosHasta(
        d.periodoInicio,
        periodoActual,
        d.periodoFin,
        1,
        d.numeroParcialidades
      )
      for (const periodo of periodos) {
        tx.insert(ingresos)
          .values({
            categoria: d.categoria,
            estadoFacturacion: d.categoria === 'factura' ? 'por_facturar' : null,
            subtotal: d.subtotal,
            iva: d.iva,
            total: d.total,
            montoOriginal: d.montoOriginal,
            monedaOriginal: d.monedaOriginal,
            proyectoId: d.proyectoId,
            cotizacionId: d.cotizacionId,
            contactoId: d.contactoId,
            fechaRegistro: fechaEnPeriodo(periodo, d.diaDelMes),
            periodo,
            definicionId: d.id
          })
          .onConflictDoNothing()
          .run()
      }
    }

    for (const d of tx.select().from(definicionesCosto).all()) {
      const periodos = periodosHasta(
        d.periodoInicio,
        periodoActual,
        d.periodoFin,
        d.tipo === 'anual' ? 12 : 1,
        d.numeroParcialidades
      )
      for (const periodo of periodos) {
        const [vigencia] = tx
          .select()
          .from(vigenciasPrecio)
          .where(
            and(eq(vigenciasPrecio.definicionCostoId, d.id), lte(vigenciasPrecio.desde, periodo))
          )
          .orderBy(vigenciasPrecio.desde)
          .all()
          .slice(-1)
        if (!vigencia) continue
        tx.insert(costos)
          .values({
            nombre: d.nombre,
            categoria: d.tipo,
            subtotal: vigencia.subtotal,
            iva: vigencia.iva,
            total: vigencia.total,
            montoOriginal: vigencia.montoOriginal,
            monedaOriginal: vigencia.monedaOriginal,
            proveedor: d.proveedor,
            fecha: fechaEnPeriodo(periodo, d.diaDelMes),
            periodo,
            definicionId: d.id,
            proyectoId: d.proyectoId
          })
          .onConflictDoNothing()
          .run()
      }
    }
  })
}

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

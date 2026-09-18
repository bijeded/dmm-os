import { and, eq, inArray, lte } from 'drizzle-orm'
import type { Db } from './index'
import {
  costos,
  cotizaciones,
  definicionesCosto,
  definicionesIngreso,
  ingresos,
  proyectos,
  vigenciasPrecio
} from './schema'

export function periodoDe(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

export function sumarMeses(periodo: string, n: number): string {
  const [y, m] = periodo.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

export function fechaEnPeriodo(periodo: string, dia: number): string {
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
 * Idempotent (unique on definition + period). Ingreso series stop once their Proyecto or
 * Cotización is cancelled; monthly series also stop when the Proyecto is completed.
 * Monthly Costo series stop when their Proyecto is completed or cancelled; MSI and annual
 * Costo series run to their end date or installment count regardless.
 */
export function generarPeriodos(db: Db, periodoActual: string) {
  db.transaction((tx) => {
    const proyectosCerrados = new Map(
      tx
        .select({ id: proyectos.id, estado: proyectos.estado })
        .from(proyectos)
        .where(inArray(proyectos.estado, ['completado', 'cancelado']))
        .all()
        .map((p) => [p.id, p.estado])
    )
    const cotizacionesCanceladas = new Set(
      tx
        .select({ id: cotizaciones.id })
        .from(cotizaciones)
        .where(eq(cotizaciones.estado, 'cancelada'))
        .all()
        .map((c) => c.id)
    )

    for (const d of tx.select().from(definicionesIngreso).all()) {
      const estadoProyecto = d.proyectoId !== null ? proyectosCerrados.get(d.proyectoId) : undefined
      const cancelada =
        estadoProyecto === 'cancelado' ||
        (d.cotizacionId !== null && cotizacionesCanceladas.has(d.cotizacionId))
      // Cancelled series stop; monthly series also stop once the Proyecto is completed.
      if (cancelada || (d.tipo === 'mensual' && estadoProyecto === 'completado')) continue
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
      // Monthly Costos stop with their Proyecto; MSI and annual ones are committed and run to their end.
      // A monthly cost estimated in a Cotización runs until it is stopped in Finanzas.
      if (d.tipo === 'mensual' && d.cotizacionId === null && d.proyectoId !== null && proyectosCerrados.has(d.proyectoId)) continue
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

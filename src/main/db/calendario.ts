import { eq, inArray } from 'drizzle-orm'
import { fechaEnPeriodo, sumarMeses } from '../../shared/fechas'
import type { Db } from './index'
import { cotizaciones, definicionesCosto, definicionesIngreso, proyectos, vigenciasPrecio } from './schema'

/** A transaction, which reads exactly like the database itself. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

type DefinicionIngreso = typeof definicionesIngreso.$inferSelect
type DefinicionCosto = typeof definicionesCosto.$inferSelect
type Vigencia = typeof vigenciasPrecio.$inferSelect

export interface PeriodoIngreso {
  definicion: DefinicionIngreso
  periodo: string
  fecha: string
}

export interface PeriodoCosto {
  definicion: DefinicionCosto
  periodo: string
  fecha: string
  /** The Vigencia de precio that applies, or `null` when none covers the period yet: nothing is due for it. */
  precio: Vigencia | null
}

/** The periods from `inicio` up to `hasta`, every `cada` months, within the end date and the parcialidad count. */
function periodos(inicio: string, hasta: string, fin: string | null, cada: number, parcialidades: number | null): string[] {
  const out: string[] = []
  for (let p = inicio; p <= hasta && (fin === null || p <= fin); p = sumarMeses(p, cada)) {
    if (parcialidades !== null && out.length >= parcialidades) break
    out.push(p)
  }
  return out
}

/**
 * The Periodo schedule: every period each Ingreso and Costo definition has up to `hasta`, dated,
 * and for a Costo at the Vigencia de precio that applies. Ingresos step monthly, as do monthly and
 * MSI Costos; annual Costos step yearly. An Ingreso series stops once its Proyecto or Cotización is
 * cancelled, and a monthly one also once its Proyecto is completed. A monthly Costo series stops
 * with its closed Proyecto unless it came from a Cotización; MSI and annual Costos are committed
 * and run to their end.
 */
export function calendarioPeriodos(db: Db | Tx, hasta: string): { ingresos: PeriodoIngreso[]; costos: PeriodoCosto[] } {
  const proyectosCerrados = new Map(
    db
      .select({ id: proyectos.id, estado: proyectos.estado })
      .from(proyectos)
      .where(inArray(proyectos.estado, ['completado', 'cancelado']))
      .all()
      .map((p) => [p.id, p.estado])
  )
  const cotizacionesCanceladas = new Set(
    db.select({ id: cotizaciones.id }).from(cotizaciones).where(eq(cotizaciones.estado, 'cancelada')).all().map((c) => c.id)
  )
  const vigencias = new Map<number, Vigencia[]>()
  for (const v of db.select().from(vigenciasPrecio).orderBy(vigenciasPrecio.desde).all()) {
    vigencias.set(v.definicionCostoId, [...(vigencias.get(v.definicionCostoId) ?? []), v])
  }

  const ingresoSigue = (d: DefinicionIngreso) => {
    const estadoProyecto = d.proyectoId !== null ? proyectosCerrados.get(d.proyectoId) : undefined
    if (estadoProyecto === 'cancelado' || (d.cotizacionId !== null && cotizacionesCanceladas.has(d.cotizacionId))) return false
    return !(d.tipo === 'mensual' && estadoProyecto === 'completado')
  }
  const costoSigue = (d: DefinicionCosto) =>
    !(d.tipo === 'mensual' && d.cotizacionId === null && d.proyectoId !== null && proyectosCerrados.has(d.proyectoId))
  const precioEn = (d: DefinicionCosto, periodo: string) => (vigencias.get(d.id) ?? []).filter((v) => v.desde <= periodo).at(-1) ?? null

  return {
    ingresos: db
      .select()
      .from(definicionesIngreso)
      .all()
      .filter(ingresoSigue)
      .flatMap((d) =>
        periodos(d.periodoInicio, hasta, d.periodoFin, 1, d.numeroParcialidades).map((periodo) => ({
          definicion: d,
          periodo,
          fecha: fechaEnPeriodo(periodo, d.diaDelMes)
        }))
      ),
    costos: db
      .select()
      .from(definicionesCosto)
      .all()
      .filter(costoSigue)
      .flatMap((d) =>
        periodos(d.periodoInicio, hasta, d.periodoFin, d.tipo === 'anual' ? 12 : 1, d.numeroParcialidades).map((periodo) => ({
          definicion: d,
          periodo,
          fecha: fechaEnPeriodo(periodo, d.diaDelMes),
          precio: precioEn(d, periodo)
        }))
      )
  }
}

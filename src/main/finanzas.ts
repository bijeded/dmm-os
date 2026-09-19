import { and, eq, lte } from 'drizzle-orm'
import type { Db } from './db'
import { coberturaCostos } from './db/cobertura'
import { fechaEnPeriodo, sumarAnios, sumarDias, sumarMeses } from '../shared/fechas'
import { monedaDe } from './dinero'
import { alDia } from './ledger'
import { accionesCosto, origenCosto, type Costo, type Definicion } from './ciclo-costo'
import { accionesIngreso, origenIngreso, reembolsableIngreso, restante, type Ingreso } from './ciclo-ingreso'
import {
  asignacionesCosto,
  contactos,
  costos,
  definicionesCosto,
  ingresos,
  proyectos,
  vigenciasPrecio
} from './db/schema'
import type { CifrasFinanzas, FilaCosto, FilaIngreso, PagoProximo, PeriodoFinanzas, PuntoFinanzas, Rango, ResumenFinanzas } from '../shared/dominio'

/** Days after which an unpaid invoice is Cobranza vencida, unless configured otherwise. */
export const DIAS_VENCIDA = 30

/** How far ahead Próximos pagos looks. */
const DIAS_PROXIMOS = 60

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const anioDe = (fecha: string) => Number(fecha.slice(0, 4))

/** How many years back the comparison span lies: the same period last year, or the five before. */
const aniosAtras = (periodo: PeriodoFinanzas) => (periodo === 'cinco_anios' ? 5 : 1)

/**
 * The period to date, and the same days a period earlier: this year's Q3 so far against last
 * year's Q3 to the same day. Todo el tiempo starts at the year of `primero` and has nothing to
 * compare against.
 */
export function rangos(periodo: PeriodoFinanzas, hoy: string, primero = hoy): { rango: Rango; anterior: Rango | null } {
  const y = anioDe(hoy)
  const m = Number(hoy.slice(5, 7))
  const desde = {
    mes: hoy.slice(0, 8) + '01',
    trimestre: `${y}-${String(m - ((m - 1) % 3)).padStart(2, '0')}-01`,
    anio: `${y}-01-01`,
    cinco_anios: `${y - 4}-01-01`,
    todo: `${anioDe(primero)}-01-01`
  }[periodo]
  const rango = { desde, hasta: hoy }
  if (periodo === 'todo') return { rango, anterior: null }
  const n = aniosAtras(periodo)
  return { rango, anterior: { desde: sumarAnios(desde, -n), hasta: sumarAnios(hoy, -n) } }
}


/** When an Ingreso counts: the day it was paid, else the day it was registered. */
const fechaIngreso = (i: Ingreso) => i.fechaPago ?? i.fechaRegistro

/** Money that did or will move: cancelled and uncollectible Ingresos, and cancelled Costos, don't count. */
const cuentaIngreso = (i: Ingreso) => (i.estado === 'pendiente' || i.estado === 'pagado') && fechaIngreso(i) !== null
const cuentaCosto = (c: Costo) => c.estado !== 'cancelado'

const dentro = (fecha: string | null, rango: Rango) => fecha !== null && fecha >= rango.desde && fecha <= rango.hasta

/** The Ingresos and Costos that count within `rango`. */
const delRango = (todosIngresos: Ingreso[], todosCostos: Costo[], rango: Rango) => ({
  ingresos: todosIngresos.filter((i) => cuentaIngreso(i) && dentro(fechaIngreso(i), rango)),
  costos: todosCostos.filter((c) => cuentaCosto(c) && dentro(c.fecha, rango))
})

function cifras(todosIngresos: Ingreso[], todosCostos: Costo[], rango: Rango, sinDatos: Set<number>): CifrasFinanzas {
  const { ingresos: delPeriodo, costos: costosDelPeriodo } = delRango(todosIngresos, todosCostos, rango)
  const suma = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0)
  const ingresosTotal = suma(delPeriodo, (i) => i.subtotal)
  const costosTotal = suma(costosDelPeriodo, (c) => c.subtotal)
  const sinCostos = [...sinDatos].some((anio) => anio >= anioDe(rango.desde) && anio <= anioDe(rango.hasta))
  return {
    ingresos: ingresosTotal,
    ingresosFactura: suma(delPeriodo.filter((i) => i.categoria === 'factura'), (i) => i.subtotal),
    ingresosSinFactura: suma(delPeriodo.filter((i) => i.categoria === 'sin_factura'), (i) => i.subtotal),
    ivaIngresos: suma(delPeriodo, (i) => i.iva),
    retencionesIngresos: suma(delPeriodo, (i) => i.retenciones),
    costos: costosTotal,
    ivaCostos: suma(costosDelPeriodo, (c) => c.iva),
    retencionesCostos: suma(costosDelPeriodo, (c) => c.retenciones),
    utilidad: sinCostos ? null : ingresosTotal - costosTotal
  }
}

/** The chart's buckets: weeks of a month, months of a quarter or year, years beyond that. */
function cubetas(periodo: PeriodoFinanzas, rango: Rango): { etiqueta: string; clave: (fecha: string) => boolean }[] {
  if (periodo === 'mes') {
    const ultimoDia = Number(rango.hasta.slice(8, 10))
    return Array.from({ length: Math.ceil(ultimoDia / 7) }, (_, k) => {
      const [a, b] = [k * 7 + 1, Math.min(k * 7 + 7, ultimoDia)]
      return { etiqueta: `${a}–${b}`, clave: (f: string) => Number(f.slice(8, 10)) >= a && Number(f.slice(8, 10)) <= b }
    })
  }
  if (periodo === 'trimestre' || periodo === 'anio') {
    const out = []
    for (let periodoMes = rango.desde.slice(0, 7); periodoMes <= rango.hasta.slice(0, 7); periodoMes = sumarMeses(periodoMes, 1)) {
      const mes = periodoMes.slice(5, 7)
      out.push({ etiqueta: MESES[Number(mes) - 1], clave: (f: string) => f.slice(5, 7) === mes })
    }
    return out
  }
  const desde = anioDe(rango.desde)
  return Array.from({ length: anioDe(rango.hasta) - desde + 1 }, (_, k) => ({
    etiqueta: String(desde + k),
    clave: (f: string) => anioDe(f) === desde + k
  }))
}

function serie(periodo: PeriodoFinanzas, todosIngresos: Ingreso[], todosCostos: Costo[], rango: Rango, anterior: Rango | null): PuntoFinanzas[] {
  // The earlier span is moved forward onto the current one, so both fall into the same buckets.
  const movimientos = (span: Rango, anios: number) => {
    const { ingresos: delSpan, costos: costosDelSpan } = delRango(todosIngresos, todosCostos, span)
    return {
      ingresos: delSpan.map((i) => ({ fecha: sumarAnios(fechaIngreso(i)!, anios), monto: i.subtotal })),
      costos: costosDelSpan.map((c) => ({ fecha: sumarAnios(c.fecha, anios), monto: c.subtotal }))
    }
  }
  const ahora = movimientos(rango, 0)
  const antes = anterior ? movimientos(anterior, aniosAtras(periodo)) : null
  const sumar = (montos: { fecha: string; monto: number }[], clave: (fecha: string) => boolean) =>
    montos.filter((m) => clave(m.fecha)).reduce((total, m) => total + m.monto, 0)
  return cubetas(periodo, rango).map(({ etiqueta, clave }) => ({
    etiqueta,
    ingresos: sumar(ahora.ingresos, clave),
    costos: sumar(ahora.costos, clave),
    ingresosAnterior: antes ? sumar(antes.ingresos, clave) : null,
    costosAnterior: antes ? sumar(antes.costos, clave) : null
  }))
}

/**
 * The next period of each series still running that is not generated yet, within the horizon.
 * A monthly series stops with its closed Proyecto unless it came from a Cotización, as in
 * `generarPeriodos`.
 */
function siguientesPeriodos(db: Db, defs: Definicion[], periodoActual: string, hoy: string, hasta: string): PagoProximo[] {
  const cerrados = new Set(
    db
      .select({ id: proyectos.id, estado: proyectos.estado })
      .from(proyectos)
      .all()
      .filter((p) => p.estado === 'completado' || p.estado === 'cancelado')
      .map((p) => p.id)
  )
  return defs.flatMap((d) => {
    if (d.tipo === 'mensual' && d.cotizacionId === null && d.proyectoId !== null && cerrados.has(d.proyectoId)) return []
    const cada = d.tipo === 'anual' ? 12 : 1
    let k = 0
    let p = d.periodoInicio
    for (; p <= periodoActual; p = sumarMeses(p, cada)) k++
    if (d.periodoFin !== null && p > d.periodoFin) return []
    if (d.numeroParcialidades !== null && k >= d.numeroParcialidades) return []
    const fecha = fechaEnPeriodo(p, d.diaDelMes)
    if (fecha < hoy || fecha > hasta) return []
    const vigencia = db
      .select()
      .from(vigenciasPrecio)
      .where(and(eq(vigenciasPrecio.definicionCostoId, d.id), lte(vigenciasPrecio.desde, p)))
      .orderBy(vigenciasPrecio.desde)
      .all()
      .at(-1)
    return vigencia ? [{ fecha, nombre: d.nombre, proveedor: d.proveedor, categoria: d.tipo, total: vigencia.total }] : []
  })
}

/**
 * Finanzas for a period: brings the ledger up to hoy, then reads revenue, costs
 * and profit (subtotals, IVA apart) against the same span a period earlier, the chart, what is
 * still to be collected and paid, and what comes up next.
 */
export function resumenFinanzas(db: Db, periodo: PeriodoFinanzas, hoy: string, diasVencida: number): ResumenFinanzas {
  const periodoActual = hoy.slice(0, 7)
  alDia(db, hoy)

  const todosIngresos = db.select().from(ingresos).all()
  const todosCostos = db.select().from(costos).all()
  const defs = db.select().from(definicionesCosto).all()
  const definicion = new Map(defs.map((d) => [d.id, d]))
  const nombreContacto = new Map(db.select({ id: contactos.id, nombre: contactos.nombre }).from(contactos).all().map((c) => [c.id, c.nombre]))
  const nombreProyecto = new Map(db.select({ id: proyectos.id, nombre: proyectos.nombre }).from(proyectos).all().map((p) => [p.id, p.nombre]))

  const fechas = [...todosIngresos.filter(cuentaIngreso).map((i) => fechaIngreso(i)!), ...todosCostos.filter(cuentaCosto).map((c) => c.fecha)]
  const primero = fechas.reduce((min, f) => (f < min ? f : min), hoy)
  const { rango, anterior: rangoAnterior } = rangos(periodo, hoy, primero)

  const desde = anioDe(rangoAnterior?.desde ?? rango.desde)
  const sinDatos = new Set(coberturaCostos(db, desde, anioDe(hoy)).filter((c) => c.sinDatos).map((c) => c.anio))
  const aniosSinDatos = (span: Rango | null) => (span ? [...sinDatos].filter((anio) => anio >= anioDe(span.desde) && anio <= anioDe(span.hasta)) : [])

  const asignados = new Set(db.select({ costoId: asignacionesCosto.costoId }).from(asignacionesCosto).all().map((a) => a.costoId))
  const reembolsosDe = new Map<number, Ingreso[]>()
  for (const i of todosIngresos) if (i.reembolsoDeId !== null) reembolsosDe.set(i.reembolsoDeId, [...(reembolsosDe.get(i.reembolsoDeId) ?? []), i])
  const limiteVencida = sumarDias(hoy, -diasVencida)
  const filaIngreso = (i: Ingreso): FilaIngreso => ({
    id: i.id,
    fecha: fechaIngreso(i),
    contacto: i.contactoId === null ? null : (nombreContacto.get(i.contactoId) ?? null),
    proyecto: i.proyectoId === null ? null : (nombreProyecto.get(i.proyectoId) ?? null),
    categoria: i.categoria,
    estadoFacturacion: i.estadoFacturacion,
    estado: i.estado,
    subtotal: i.subtotal,
    iva: i.iva,
    retenciones: i.retenciones,
    total: i.total,
    origen: origenIngreso(i),
    vencida: i.estado === 'pendiente' && i.estadoFacturacion === 'facturado' && i.fechaRegistro !== null && i.fechaRegistro < limiteVencida,
    moneda: monedaDe(i),
    reembolsable: reembolsableIngreso(i) ? restante(i, reembolsosDe.get(i.id) ?? []).original : 0,
    reembolsoDeId: i.reembolsoDeId,
    notas: i.notas,
    acciones: accionesIngreso(i, { reembolsos: reembolsosDe.get(i.id) ?? [] })
  })
  const filaCosto = (c: Costo): FilaCosto => ({
    id: c.id,
    fecha: c.fecha,
    nombre: c.nombre,
    proveedor: c.proveedor,
    proyecto: c.proyectoId === null ? null : (nombreProyecto.get(c.proyectoId) ?? null),
    categoria: c.categoria,
    estado: c.estado,
    estimado: c.estimado,
    subtotal: c.subtotal,
    iva: c.iva,
    retenciones: c.retenciones,
    total: c.total,
    origen: origenCosto(c),
    acciones: accionesCosto(c, {
      definicion: c.definicionId === null ? undefined : definicion.get(c.definicionId),
      periodoActual,
      asignado: asignados.has(c.id)
    })
  })

  const porFecha = <T>(f: (x: T) => string | null) => (a: T, b: T) => (f(a) ?? '').localeCompare(f(b) ?? '')
  const pendientesCosto = todosCostos.filter((c) => c.estado === 'pendiente').sort(porFecha((c) => c.fecha))
  const horizonte = sumarDias(hoy, DIAS_PROXIMOS)
  const proximosPagos = [
    ...pendientesCosto
      .filter((c) => c.fecha >= hoy && c.fecha <= horizonte)
      .map((c) => ({ fecha: c.fecha, nombre: c.nombre, proveedor: c.proveedor, categoria: c.categoria, total: c.total })),
    ...siguientesPeriodos(db, defs, periodoActual, hoy, horizonte)
  ].sort(porFecha((p) => p.fecha))

  const actual = cifras(todosIngresos, todosCostos, rango, sinDatos)
  const cobrado = todosIngresos.filter((i) => i.estado === 'pagado' && dentro(i.fechaPago, rango)).sort(porFecha(fechaIngreso)).reverse().map(filaIngreso)
  const cobranza = todosIngresos.filter((i) => i.estado === 'pendiente').sort(porFecha(fechaIngreso)).map(filaIngreso)
  // Reembolsos are negative, so this is what actually stayed in the bank.
  const real = cobrado.reduce((s, i) => s + i.subtotal, 0)
  // An invoice not yet issued may have no date; it still counts as now.
  const hastaEsteMes = cobranza.filter((i) => i.fecha === null || i.fecha.slice(0, 7) <= periodoActual)
  const porFacturar = (i: FilaIngreso) => i.estadoFacturacion === 'por_facturar'

  return {
    periodo,
    rango,
    rangoAnterior,
    actual,
    anterior: rangoAnterior ? cifras(todosIngresos, todosCostos, rangoAnterior, sinDatos) : null,
    serie: serie(periodo, todosIngresos, todosCostos, rango, rangoAnterior),
    sinDatos: [...new Set([...aniosSinDatos(rangoAnterior), ...aniosSinDatos(rango)])].sort(),
    cobrado,
    cobranza,
    real,
    utilidadReal: actual.utilidad === null ? null : real - actual.costos,
    cobros: {
      mes: hastaEsteMes.filter((i) => !i.vencida && !porFacturar(i)),
      vencidos: hastaEsteMes.filter((i) => i.vencida),
      porFacturar: hastaEsteMes.filter(porFacturar)
    },
    costosPendientes: pendientesCosto.map(filaCosto),
    ingresos: todosIngresos.filter((i) => i.estado !== 'cancelado' && dentro(fechaIngreso(i), rango)).sort(porFecha(fechaIngreso)).reverse().map(filaIngreso),
    costos: todosCostos.filter((c) => cuentaCosto(c) && dentro(c.fecha, rango)).sort(porFecha((c) => c.fecha)).reverse().map(filaCosto),
    proximosPagos,
    diasVencida
  }
}

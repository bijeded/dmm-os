import { and, eq, lte } from 'drizzle-orm'
import type { Db } from './db'
import { coberturaCostos } from './db/cobertura'
import { fechaEnPeriodo, generarPeriodos, sumarMeses } from './db/periodos'
import { RegistroVinculadoError } from './db/cancelacion'
import { registrarReembolso } from './db/dominio'
import {
  asignacionesCosto,
  contactos,
  costos,
  definicionesCosto,
  ingresos,
  proyectos,
  vigenciasPrecio
} from './db/schema'
import type {
  AccionCosto,
  AccionIngreso,
  CifrasFinanzas,
  CostoNuevo,
  FilaCosto,
  FilaIngreso,
  IngresoNuevo,
  PagoProximo,
  PeriodoFinanzas,
  PuntoFinanzas,
  Rango,
  ResumenFinanzas
} from '../shared/ipc'

/** Days after which an unpaid invoice is Cobranza vencida, unless configured otherwise. */
export const DIAS_VENCIDA = 30

/** How far ahead Próximos pagos looks. */
const DIAS_PROXIMOS = 60

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const anioDe = (fecha: string) => Number(fecha.slice(0, 4))

/** The same day `n` years earlier; a leap day becomes the last day of February. */
function restarAnios(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const ultimo = new Date(y - n, m, 0).getDate()
  return `${y - n}-${String(m).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`
}

function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** How many years back the comparison span lies: the same period last year, or the five before. */
const atras = (periodo: PeriodoFinanzas) => (periodo === 'cinco_anios' ? 5 : 1)

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
  const n = atras(periodo)
  return { rango, anterior: { desde: restarAnios(desde, n), hasta: restarAnios(hoy, n) } }
}

type Ingreso = typeof ingresos.$inferSelect
type Costo = typeof costos.$inferSelect

/** When an Ingreso counts: the day it was paid, else the day it was registered. */
const fechaIngreso = (i: Ingreso) => i.fechaPago ?? i.fechaRegistro

/** Money that did or will move: cancelled and uncollectible Ingresos, and cancelled Costos, don't count. */
const cuentaIngreso = (i: Ingreso) => (i.estado === 'pendiente' || i.estado === 'pagado') && fechaIngreso(i) !== null
const cuentaCosto = (c: Costo) => c.estado !== 'cancelado'

const dentro = (fecha: string | null, r: Rango) => fecha !== null && fecha >= r.desde && fecha <= r.hasta

function cifras(is: Ingreso[], cs: Costo[], r: Rango, sinDatos: Set<number>): CifrasFinanzas {
  const ins = is.filter((i) => cuentaIngreso(i) && dentro(fechaIngreso(i), r))
  const cos = cs.filter((c) => cuentaCosto(c) && dentro(c.fecha, r))
  const suma = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0)
  const ingresosTotal = suma(ins, (i) => i.subtotal)
  const costosTotal = suma(cos, (c) => c.subtotal)
  const sinCostos = [...sinDatos].some((a) => a >= anioDe(r.desde) && a <= anioDe(r.hasta))
  return {
    ingresos: ingresosTotal,
    ingresosFactura: suma(ins.filter((i) => i.categoria === 'factura'), (i) => i.subtotal),
    ingresosSinFactura: suma(ins.filter((i) => i.categoria === 'sin_factura'), (i) => i.subtotal),
    ivaIngresos: suma(ins, (i) => i.iva),
    costos: costosTotal,
    ivaCostos: suma(cos, (c) => c.iva),
    utilidad: sinCostos ? null : ingresosTotal - costosTotal
  }
}

/** The chart's buckets: weeks of a month, months of a quarter or year, years beyond that. */
function cubetas(periodo: PeriodoFinanzas, r: Rango): { etiqueta: string; clave: (fecha: string) => boolean }[] {
  if (periodo === 'mes') {
    const ultimoDia = Number(r.hasta.slice(8, 10))
    return Array.from({ length: Math.ceil(ultimoDia / 7) }, (_, k) => {
      const [a, b] = [k * 7 + 1, Math.min(k * 7 + 7, ultimoDia)]
      return { etiqueta: `${a}–${b}`, clave: (f: string) => Number(f.slice(8, 10)) >= a && Number(f.slice(8, 10)) <= b }
    })
  }
  if (periodo === 'trimestre' || periodo === 'anio') {
    const out = []
    for (let p = r.desde.slice(0, 7); p <= r.hasta.slice(0, 7); p = sumarMeses(p, 1)) {
      const mes = p.slice(5, 7)
      out.push({ etiqueta: MESES[Number(mes) - 1], clave: (f: string) => f.slice(5, 7) === mes })
    }
    return out
  }
  const desde = anioDe(r.desde)
  return Array.from({ length: anioDe(r.hasta) - desde + 1 }, (_, k) => ({
    etiqueta: String(desde + k),
    clave: (f: string) => anioDe(f) === desde + k
  }))
}

function serie(periodo: PeriodoFinanzas, is: Ingreso[], cs: Costo[], r: Rango, anterior: Rango | null): PuntoFinanzas[] {
  const n = atras(periodo)
  // The earlier span is moved forward onto the current one, so both fall into the same buckets.
  const movimientos = (rr: Rango, corrimiento: number) => ({
    ingresos: is.filter((i) => cuentaIngreso(i) && dentro(fechaIngreso(i), rr)).map((i) => ({ fecha: restarAnios(fechaIngreso(i)!, -corrimiento), monto: i.subtotal })),
    costos: cs.filter((c) => cuentaCosto(c) && dentro(c.fecha, rr)).map((c) => ({ fecha: restarAnios(c.fecha, -corrimiento), monto: c.subtotal }))
  })
  const ahora = movimientos(r, 0)
  const antes = anterior ? movimientos(anterior, n) : null
  const sumar = (ms: { fecha: string; monto: number }[], clave: (f: string) => boolean) => ms.filter((m) => clave(m.fecha)).reduce((s, m) => s + m.monto, 0)
  return cubetas(periodo, r).map(({ etiqueta, clave }) => ({
    etiqueta,
    ingresos: sumar(ahora.ingresos, clave),
    costos: sumar(ahora.costos, clave),
    ingresosAnterior: antes ? sumar(antes.ingresos, clave) : null,
    costosAnterior: antes ? sumar(antes.costos, clave) : null
  }))
}

const origenIngreso = (i: Ingreso): FilaIngreso['origen'] =>
  i.cfdiUuid !== null ? 'cfdi' : i.definicionId !== null ? 'periodo' : i.cotizacionId !== null ? 'cotizacion' : 'manual'

const origenCosto = (c: Costo): FilaCosto['origen'] => (c.cfdiUuid !== null ? 'cfdi' : c.definicionId !== null ? 'recurrente' : 'manual')

/** Borrar vs cancelar: only a hand-entered Ingreso no Reembolso points at. */
const borrableIngreso = (i: Ingreso, reembolsado: boolean) => origenIngreso(i) === 'manual' && !reembolsado

/** Borrar vs cancelar: only a hand-entered one-time Costo nothing is attributed from. */
const borrableCosto = (c: Costo, asignado: boolean) => origenCosto(c) === 'manual' && c.cotizacionId === null && !asignado

function accionesIngreso(i: Ingreso, conReembolsos: Set<number>): AccionIngreso[] {
  const puede: Record<AccionIngreso, boolean> = {
    pagar: i.estado === 'pendiente',
    cancelar: i.estado === 'pendiente',
    borrar: borrableIngreso(i, conReembolsos.has(i.id)),
    reembolsar: i.estado === 'pagado' && i.total > 0 && i.reembolsoDeId === null
  }
  return (Object.keys(puede) as AccionIngreso[]).filter((a) => puede[a])
}

type Definicion = typeof definicionesCosto.$inferSelect

/** A monthly or annual series can be stopped while it still runs; MSI is already committed. */
const detenible = (d: Definicion | undefined, periodoActual: string) =>
  d !== undefined && d.tipo !== 'msi' && (d.periodoFin === null || d.periodoFin > periodoActual)

function accionesCosto(c: Costo, definicion: Definicion | undefined, periodoActual: string, asignado: boolean): AccionCosto[] {
  const puede: Record<AccionCosto, boolean> = {
    pagar: c.estado === 'pendiente',
    cancelar: c.estado === 'pendiente',
    borrar: borrableCosto(c, asignado),
    detener: detenible(definicion, periodoActual)
  }
  return (Object.keys(puede) as AccionCosto[]).filter((a) => puede[a])
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
 * Finanzas for a period: generates the periods due up to this month, then reads revenue, costs
 * and profit (subtotals, IVA apart) against the same span a period earlier, the chart, what is
 * still to be collected and paid, and what comes up next.
 */
export function resumenFinanzas(db: Db, periodo: PeriodoFinanzas, hoy: string, diasVencida: number): ResumenFinanzas {
  const periodoActual = hoy.slice(0, 7)
  generarPeriodos(db, periodoActual)

  const is = db.select().from(ingresos).all()
  const cs = db.select().from(costos).all()
  const defs = db.select().from(definicionesCosto).all()
  const definicion = new Map(defs.map((d) => [d.id, d]))
  const nombreContacto = new Map(db.select({ id: contactos.id, nombre: contactos.nombre }).from(contactos).all().map((c) => [c.id, c.nombre]))
  const nombreProyecto = new Map(db.select({ id: proyectos.id, nombre: proyectos.nombre }).from(proyectos).all().map((p) => [p.id, p.nombre]))

  const fechas = [...is.filter(cuentaIngreso).map((i) => fechaIngreso(i)!), ...cs.filter(cuentaCosto).map((c) => c.fecha)]
  const primero = fechas.reduce((min, f) => (f < min ? f : min), hoy)
  const { rango, anterior: rangoAnterior } = rangos(periodo, hoy, primero)

  const desde = anioDe(rangoAnterior?.desde ?? rango.desde)
  const sinDatos = new Set(coberturaCostos(db, desde, anioDe(hoy)).filter((c) => c.sinDatos).map((c) => c.anio))
  const aniosVistos = (r: Rango | null) => (r ? [...sinDatos].filter((a) => a >= anioDe(r.desde) && a <= anioDe(r.hasta)) : [])

  const asignados = new Set(db.select({ costoId: asignacionesCosto.costoId }).from(asignacionesCosto).all().map((a) => a.costoId))
  const conReembolsos = new Set(is.flatMap((i) => (i.reembolsoDeId === null ? [] : [i.reembolsoDeId])))
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
    total: i.total,
    origen: origenIngreso(i),
    vencida: i.estado === 'pendiente' && i.estadoFacturacion === 'facturado' && i.fechaRegistro !== null && i.fechaRegistro < limiteVencida,
    reembolsoDeId: i.reembolsoDeId,
    notas: i.notas,
    acciones: accionesIngreso(i, conReembolsos)
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
    total: c.total,
    origen: origenCosto(c),
    acciones: accionesCosto(c, c.definicionId === null ? undefined : definicion.get(c.definicionId), periodoActual, asignados.has(c.id))
  })

  const porFecha = <T>(f: (x: T) => string | null) => (a: T, b: T) => (f(a) ?? '').localeCompare(f(b) ?? '')
  const pendientesCosto = cs.filter((c) => c.estado === 'pendiente').sort(porFecha((c) => c.fecha))
  const horizonte = sumarDias(hoy, DIAS_PROXIMOS)
  const proximosPagos = [
    ...pendientesCosto
      .filter((c) => c.fecha >= hoy && c.fecha <= horizonte)
      .map((c) => ({ fecha: c.fecha, nombre: c.nombre, proveedor: c.proveedor, categoria: c.categoria, total: c.total })),
    ...siguientesPeriodos(db, defs, periodoActual, hoy, horizonte)
  ].sort(porFecha((p) => p.fecha))

  return {
    periodo,
    rango,
    rangoAnterior,
    actual: cifras(is, cs, rango, sinDatos),
    anterior: rangoAnterior ? cifras(is, cs, rangoAnterior, sinDatos) : null,
    serie: serie(periodo, is, cs, rango, rangoAnterior),
    sinDatos: [...new Set([...aniosVistos(rangoAnterior), ...aniosVistos(rango)])].sort(),
    cobranza: is.filter((i) => i.estado === 'pendiente').sort(porFecha(fechaIngreso)).map(filaIngreso),
    costosPendientes: pendientesCosto.map(filaCosto),
    ingresos: is.filter((i) => i.estado !== 'cancelado' && dentro(fechaIngreso(i), rango)).sort(porFecha(fechaIngreso)).reverse().map(filaIngreso),
    costos: cs.filter((c) => cuentaCosto(c) && dentro(c.fecha, rango)).sort(porFecha((c) => c.fecha)).reverse().map(filaCosto),
    proximosPagos,
    diasVencida
  }
}

function exigirMonto(subtotal: number, iva: number) {
  if (!Number.isInteger(subtotal) || subtotal <= 0) throw new Error('El monto debe ser mayor a cero')
  if (!Number.isInteger(iva) || iva < 0) throw new Error('El IVA no puede ser negativo')
}

function exigirFecha(fecha: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('La fecha no es válida')
}

function leerIngreso(db: Db, id: number) {
  const i = db.select().from(ingresos).where(eq(ingresos.id, id)).get()
  if (!i) throw new Error(`El ingreso ${id} no existe`)
  return i
}

function leerCosto(db: Db, id: number) {
  const c = db.select().from(costos).where(eq(costos.id, id)).get()
  if (!c) throw new Error(`El costo ${id} no existe`)
  return c
}

/** A hand-entered Ingreso; given a Proyecto, its Contacto is the Proyecto's. */
export function nuevoIngreso(db: Db, n: IngresoNuevo, hoy: string) {
  exigirMonto(n.subtotal, n.iva)
  exigirFecha(n.fecha)
  let contactoId = n.contactoId
  if (n.proyectoId !== null) {
    const p = db.select().from(proyectos).where(eq(proyectos.id, n.proyectoId)).get()
    if (!p) throw new Error(`El proyecto ${n.proyectoId} no existe`)
    contactoId = p.contactoId
  }
  const pagado = n.pagado && n.fecha <= hoy
  db.insert(ingresos)
    .values({
      categoria: n.categoria,
      estadoFacturacion: n.categoria === 'factura' ? (n.facturado ? 'facturado' : 'por_facturar') : null,
      estado: pagado ? 'pagado' : 'pendiente',
      subtotal: n.subtotal,
      iva: n.iva,
      total: n.subtotal + n.iva,
      proyectoId: n.proyectoId,
      contactoId,
      fechaRegistro: n.fecha,
      fechaPago: pagado ? n.fecha : null,
      notas: n.notas?.trim() || null
    })
    .run()
}

/** A one-time Costo, or the definition of a monthly, MSI or annual one and its first price. */
export function nuevoCosto(db: Db, n: CostoNuevo, hoy: string) {
  const nombre = n.nombre.trim()
  if (!nombre) throw new Error('El costo necesita un nombre')
  exigirMonto(n.subtotal, n.iva)
  exigirFecha(n.fecha)
  if (n.categoria === 'msi' && (!n.parcialidades || n.parcialidades < 2)) throw new Error('Un costo a MSI necesita al menos 2 parcialidades')
  const montos = { subtotal: n.subtotal, iva: n.iva, total: n.subtotal + n.iva }
  const proveedor = n.proveedor?.trim() || null

  if (n.categoria === 'unico') {
    const pagado = n.pagado && n.fecha <= hoy
    db.insert(costos)
      .values({
        nombre,
        categoria: 'unico',
        estado: pagado ? 'pagado' : 'pendiente',
        ...montos,
        proveedor,
        referencia: n.referencia?.trim() || null,
        fecha: n.fecha,
        fechaPago: pagado ? n.fecha : null,
        proyectoId: n.proyectoId
      })
      .run()
    return
  }

  const periodoInicio = n.fecha.slice(0, 7)
  db.transaction((tx) => {
    const definicionCostoId = tx
      .insert(definicionesCosto)
      .values({
        nombre,
        proveedor,
        tipo: n.categoria as 'mensual' | 'msi' | 'anual',
        proyectoId: n.proyectoId,
        suscripcionIa: n.suscripcionIa,
        diaDelMes: Number(n.fecha.slice(8, 10)),
        periodoInicio,
        numeroParcialidades: n.categoria === 'msi' ? n.parcialidades : null
      })
      .returning({ id: definicionesCosto.id })
      .get().id
    tx.insert(vigenciasPrecio).values({ definicionCostoId, desde: periodoInicio, ...montos }).run()
  })
  generarPeriodos(db, hoy.slice(0, 7))
}

export function pagarIngreso(db: Db, id: number, hoy: string) {
  if (leerIngreso(db, id).estado !== 'pendiente') throw new Error('Solo se marca pagado un ingreso pendiente')
  db.update(ingresos).set({ estado: 'pagado', fechaPago: hoy }).where(eq(ingresos.id, id)).run()
}

export function cancelarIngreso(db: Db, id: number) {
  if (leerIngreso(db, id).estado !== 'pendiente') throw new Error('Solo se cancela un ingreso pendiente')
  db.update(ingresos).set({ estado: 'cancelado' }).where(eq(ingresos.id, id)).run()
}

/** Borrar vs cancelar: an imported, generated or quoted Ingreso, or one with a Reembolso, is cancelled instead. */
export function borrarIngreso(db: Db, id: number) {
  const i = leerIngreso(db, id)
  const reembolsado = db.select({ id: ingresos.id }).from(ingresos).where(eq(ingresos.reembolsoDeId, id)).get()
  if (!borrableIngreso(i, reembolsado !== undefined)) throw new RegistroVinculadoError('El ingreso', id)
  db.delete(ingresos).where(eq(ingresos.id, id)).run()
}

/** Reembolso against a paid Ingreso, never more than what is left of it; a USD one needs its USD amount. */
export function reembolsar(db: Db, id: number, subtotal: number, iva: number, fecha: string, montoOriginal?: number) {
  exigirMonto(subtotal, iva)
  exigirFecha(fecha)
  const i = leerIngreso(db, id)
  if (i.estado !== 'pagado' || i.total <= 0 || i.reembolsoDeId !== null) throw new Error('Solo se reembolsa un ingreso pagado')
  const devuelto = db
    .select({ total: ingresos.total })
    .from(ingresos)
    .where(eq(ingresos.reembolsoDeId, id))
    .all()
    .reduce((s, r) => s - r.total, 0)
  if (devuelto + subtotal + iva > i.total) throw new Error('No se puede reembolsar más de lo pagado')
  registrarReembolso(db, id, { subtotal, iva, fecha, montoOriginal })
}

export function pagarCosto(db: Db, id: number, hoy: string) {
  if (leerCosto(db, id).estado !== 'pendiente') throw new Error('Solo se marca pagado un costo pendiente')
  db.update(costos).set({ estado: 'pagado', fechaPago: hoy }).where(eq(costos.id, id)).run()
}

export function cancelarCosto(db: Db, id: number) {
  if (leerCosto(db, id).estado !== 'pendiente') throw new Error('Solo se cancela un costo pendiente')
  db.update(costos).set({ estado: 'cancelado' }).where(eq(costos.id, id)).run()
}

/** Borrar vs cancelar: only a hand-entered one-time Costo nothing is attributed from. */
export function borrarCosto(db: Db, id: number) {
  const c = leerCosto(db, id)
  const asignado = db.select({ id: asignacionesCosto.id }).from(asignacionesCosto).where(eq(asignacionesCosto.costoId, id)).get()
  if (!borrableCosto(c, asignado !== undefined)) throw new RegistroVinculadoError('El costo', id)
  db.delete(costos).where(eq(costos.id, id)).run()
}

/** Ends the monthly or annual series the Costo belongs to after this month; MSI is committed. */
export function detenerCosto(db: Db, id: number, hoy: string) {
  const c = leerCosto(db, id)
  const periodoActual = hoy.slice(0, 7)
  const d = c.definicionId === null ? undefined : db.select().from(definicionesCosto).where(eq(definicionesCosto.id, c.definicionId)).get()
  if (!d || !detenible(d, periodoActual)) throw new Error('Este costo no pertenece a una serie que se pueda detener')
  db.update(definicionesCosto).set({ periodoFin: periodoActual }).where(eq(definicionesCosto.id, d.id)).run()
}

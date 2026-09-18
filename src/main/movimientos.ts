import { eq } from 'drizzle-orm'
import type { Db } from './db'
import { RegistroVinculadoError } from './db/cancelacion'
import { generarPeriodos } from './db/periodos'
import { asignacionesCosto, costos, definicionesCosto, ingresos, proyectos, vigenciasPrecio } from './db/schema'
import { monedaDe, montoEn, tasaDe } from './dinero'
import { ivaDe } from '../shared/formato'
import type { AccionCosto, AccionIngreso, CostoNuevo, FilaCosto, FilaIngreso, IngresoNuevo } from '../shared/dominio'

// Movimientos: Ingresos and Costos entered, paid, cancelled, deleted, refunded or stopped, and the
// rules for which of those each one allows now. The Finanzas rows show exactly these actions.

export type Ingreso = typeof ingresos.$inferSelect
export type Costo = typeof costos.$inferSelect

export const origenIngreso = (i: Ingreso): FilaIngreso['origen'] =>
  i.cfdiUuid !== null ? 'cfdi' : i.definicionId !== null ? 'periodo' : i.cotizacionId !== null ? 'cotizacion' : 'manual'

export const origenCosto = (c: Costo): FilaCosto['origen'] => (c.cfdiUuid !== null ? 'cfdi' : c.definicionId !== null ? 'recurrente' : 'manual')

/** Borrar vs cancelar: only a hand-entered Ingreso no Reembolso points at. */
const borrableIngreso = (i: Ingreso, reembolsado: boolean) => origenIngreso(i) === 'manual' && !reembolsado

/** Borrar vs cancelar: only a hand-entered one-time Costo nothing is attributed from. */
const borrableCosto = (c: Costo, asignado: boolean) => origenCosto(c) === 'manual' && c.cotizacionId === null && !asignado

export const reembolsableIngreso = (i: Ingreso) => i.estado === 'pagado' && i.total > 0 && i.reembolsoDeId === null

/**
 * What is left to give back of an Ingreso after its Reembolsos: in pesos, its IVA, and in its own
 * currency (`original`, USD cents for a USD Ingreso, else the same as `total`).
 */
export function restante(i: Ingreso, reembolsos: Ingreso[]) {
  const moneda = monedaDe(i)
  const suma = (f: (r: Ingreso) => number) => [i, ...reembolsos].reduce((s, r) => s + f(r), 0)
  return { moneda, total: suma((r) => r.total), iva: suma((r) => r.iva), original: suma((r) => montoEn(r, moneda)) }
}

export function accionesIngreso(i: Ingreso, reembolsos: Ingreso[] | undefined): AccionIngreso[] {
  const puede: Record<AccionIngreso, boolean> = {
    pagar: i.estado === 'pendiente',
    cancelar: i.estado === 'pendiente',
    borrar: borrableIngreso(i, reembolsos !== undefined),
    reembolsar: reembolsableIngreso(i) && restante(i, reembolsos ?? []).original > 0
  }
  return (Object.keys(puede) as AccionIngreso[]).filter((a) => puede[a])
}

export type Definicion = typeof definicionesCosto.$inferSelect

/** A monthly or annual series can be stopped while it still runs; MSI is already committed. */
const detenible = (d: Definicion | undefined, periodoActual: string) =>
  d !== undefined && d.tipo !== 'msi' && (d.periodoFin === null || d.periodoFin > periodoActual)

export function accionesCosto(c: Costo, definicion: Definicion | undefined, periodoActual: string, asignado: boolean): AccionCosto[] {
  const puede: Record<AccionCosto, boolean> = {
    pagar: c.estado === 'pendiente',
    cancelar: c.estado === 'pendiente',
    borrar: borrableCosto(c, asignado),
    detener: detenible(definicion, periodoActual)
  }
  return (Object.keys(puede) as AccionCosto[]).filter((a) => puede[a])
}

/**
 * Reembolso: a negative Ingreso linked to the original, dated when the money went back. A USD
 * Ingreso is refunded in USD too (`montoOriginal`), so a USD Cotización counts it against what
 * was paid.
 */
function registrarReembolso(
  db: Db,
  ingresoId: number,
  r: { subtotal: number; iva: number; fecha: string; montoOriginal?: number }
) {
  const original = db.select().from(ingresos).where(eq(ingresos.id, ingresoId)).get()
  if (!original) throw new Error(`ingreso ${ingresoId} no existe`)
  const usd = monedaDe(original) === 'USD'
  if (usd && r.montoOriginal === undefined) throw new Error('Un reembolso de un ingreso en USD necesita el monto en USD')
  return db
    .insert(ingresos)
    .values({
      categoria: original.categoria,
      estado: 'pagado',
      estadoFacturacion: original.estadoFacturacion,
      subtotal: -Math.abs(r.subtotal),
      iva: -Math.abs(r.iva),
      total: -(Math.abs(r.subtotal) + Math.abs(r.iva)),
      montoOriginal: usd ? -Math.abs(r.montoOriginal!) : null,
      monedaOriginal: usd ? ('USD' as const) : null,
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

const reembolsosDe = (db: Db, id: number) => db.select().from(ingresos).where(eq(ingresos.reembolsoDeId, id)).all()

/** What can be done with Ingreso `id` now: the same rule shows its buttons and guards its commands. */
function accionesDeIngreso(db: Db, id: number) {
  const i = leerIngreso(db, id)
  const reembolsos = reembolsosDe(db, id)
  return { i, acciones: accionesIngreso(i, reembolsos.length > 0 ? reembolsos : undefined) }
}

function leerCosto(db: Db, id: number) {
  const c = db.select().from(costos).where(eq(costos.id, id)).get()
  if (!c) throw new Error(`El costo ${id} no existe`)
  return c
}

/** What can be done with Costo `id` now in `hoy`'s month, as the Finanzas rows show it. */
function accionesDeCosto(db: Db, id: number, hoy: string) {
  const c = leerCosto(db, id)
  const definicion = c.definicionId === null ? undefined : db.select().from(definicionesCosto).where(eq(definicionesCosto.id, c.definicionId)).get()
  const asignado = db.select({ id: asignacionesCosto.id }).from(asignacionesCosto).where(eq(asignacionesCosto.costoId, id)).get() !== undefined
  return { c, definicion, acciones: accionesCosto(c, definicion, hoy.slice(0, 7), asignado) }
}

/** A hand-entered Ingreso; given a Proyecto, its Contacto is the Proyecto's. */
export function nuevoIngreso(db: Db, n: IngresoNuevo, hoy: string) {
  // Uninvoiced income carries no IVA.
  const iva = ivaDe(n.subtotal, n.categoria === 'factura' && n.conIva)
  exigirMonto(n.subtotal, iva)
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
      iva,
      total: n.subtotal + iva,
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
  const iva = ivaDe(n.subtotal, n.conIva)
  exigirMonto(n.subtotal, iva)
  exigirFecha(n.fecha)
  if (n.categoria === 'msi' && (!n.parcialidades || n.parcialidades < 2)) throw new Error('Un costo a MSI necesita al menos 2 parcialidades')
  const montos = { subtotal: n.subtotal, iva, total: n.subtotal + iva }
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
  if (!accionesDeIngreso(db, id).acciones.includes('pagar')) throw new Error('Solo se marca pagado un ingreso pendiente')
  db.update(ingresos).set({ estado: 'pagado', fechaPago: hoy }).where(eq(ingresos.id, id)).run()
}

export function cancelarIngreso(db: Db, id: number) {
  if (!accionesDeIngreso(db, id).acciones.includes('cancelar')) throw new Error('Solo se cancela un ingreso pendiente')
  db.update(ingresos).set({ estado: 'cancelado' }).where(eq(ingresos.id, id)).run()
}

/** Borrar vs cancelar: an imported, generated or quoted Ingreso, or one with a Reembolso, is cancelled instead. */
export function borrarIngreso(db: Db, id: number) {
  if (!accionesDeIngreso(db, id).acciones.includes('borrar')) throw new RegistroVinculadoError('El ingreso', id)
  db.delete(ingresos).where(eq(ingresos.id, id)).run()
}

/**
 * Reembolso of `monto` (the total, in the Ingreso's own currency) against a paid Ingreso, dated
 * today, never more than what is left of it. A USD one converts at the Ingreso's own rate; IVA is
 * in the Ingreso's proportion; giving back all that is left takes the exact remainders.
 */
export function reembolsar(db: Db, id: number, monto: number, hoy: string) {
  if (!Number.isInteger(monto) || monto <= 0) throw new Error('El monto debe ser mayor a cero')
  const i = leerIngreso(db, id)
  if (!reembolsableIngreso(i)) throw new Error('Solo se reembolsa un ingreso pagado')
  const tasa = monedaDe(i) === 'USD' ? tasaDe(i) : 1
  if (tasa === null) throw new Error('El ingreso en USD no tiene su monto en USD')
  const queda = restante(i, reembolsosDe(db, id))
  if (monto > queda.original) throw new Error('No se puede reembolsar más de lo pagado')
  const todo = monto === queda.original
  const total = todo ? queda.total : Math.min(queda.total, Math.round(monto * tasa))
  const iva = todo ? queda.iva : Math.min(queda.iva, Math.round((total * i.iva) / i.total))
  registrarReembolso(db, id, { subtotal: total - iva, iva, fecha: hoy, montoOriginal: queda.moneda === 'USD' ? monto : undefined })
}

export function pagarCosto(db: Db, id: number, hoy: string) {
  if (!accionesDeCosto(db, id, hoy).acciones.includes('pagar')) throw new Error('Solo se marca pagado un costo pendiente')
  db.update(costos).set({ estado: 'pagado', fechaPago: hoy }).where(eq(costos.id, id)).run()
}

export function cancelarCosto(db: Db, id: number, hoy: string) {
  if (!accionesDeCosto(db, id, hoy).acciones.includes('cancelar')) throw new Error('Solo se cancela un costo pendiente')
  db.update(costos).set({ estado: 'cancelado' }).where(eq(costos.id, id)).run()
}

/** Borrar vs cancelar: only a hand-entered one-time Costo nothing is attributed from. */
export function borrarCosto(db: Db, id: number, hoy: string) {
  if (!accionesDeCosto(db, id, hoy).acciones.includes('borrar')) throw new RegistroVinculadoError('El costo', id)
  db.delete(costos).where(eq(costos.id, id)).run()
}

/** Ends the monthly or annual series the Costo belongs to after this month; MSI is committed. */
export function detenerCosto(db: Db, id: number, hoy: string) {
  const { definicion: d, acciones } = accionesDeCosto(db, id, hoy)
  if (!d || !acciones.includes('detener')) throw new Error('Este costo no pertenece a una serie que se pueda detener')
  db.update(definicionesCosto).set({ periodoFin: hoy.slice(0, 7) }).where(eq(definicionesCosto.id, d.id)).run()
}

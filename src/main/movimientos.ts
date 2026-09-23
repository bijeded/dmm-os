import { eq } from 'drizzle-orm'
import type { Db } from './db'
import { costos, definicionesCosto, ingresos, proyectos, vigenciasPrecio } from './db/schema'
import { monedaDe, montos, tasaDe } from './dinero'
import { exigirCosto, type ContextoCosto } from './ciclo-costo'
import { exigirIngreso, MENSAJE_REEMBOLSO_EXCEDIDO, restante, type ContextoIngreso } from './ciclo-ingreso'
import { transaccionConPeriodos } from './ledger'
import { exigirCentavos } from '../shared/montos'
import type { CostoNuevo, IngresoNuevo } from '../shared/dominio'

// Movimientos: Ingresos and Costos entered, paid, cancelled, deleted, refunded or stopped. Which of
// those each one allows now is its lifecycle's (ciclo-ingreso, ciclo-costo), as the Finanzas rows show.

/**
 * Reembolso: a negative Ingreso linked to the original, dated when the money went back. A USD
 * Ingreso is refunded in USD too (`montoOriginal`), so a USD Cotización counts it against what
 * was paid.
 */
function registrarReembolso(
  db: Db,
  ingresoId: number,
  r: { subtotal: number; iva: number; retenciones: number; fecha: string; montoOriginal?: number }
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
      retenciones: -Math.abs(r.retenciones),
      total: -(Math.abs(r.subtotal) + Math.abs(r.iva) - Math.abs(r.retenciones)),
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

function exigirFecha(fecha: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('La fecha no es válida')
}

function leerIngreso(db: Db, id: number) {
  const i = db.select().from(ingresos).where(eq(ingresos.id, id)).get()
  if (!i) throw new Error(`El ingreso ${id} no existe`)
  return i
}

const reembolsosDe = (db: Db, id: number) => db.select().from(ingresos).where(eq(ingresos.reembolsoDeId, id)).all()

/** Ingreso `id` and what its lifecycle needs to judge it. */
function ingresoConContexto(db: Db, id: number): { i: ReturnType<typeof leerIngreso>; ctx: ContextoIngreso } {
  return { i: leerIngreso(db, id), ctx: { reembolsos: reembolsosDe(db, id) } }
}

function leerCosto(db: Db, id: number) {
  const c = db.select().from(costos).where(eq(costos.id, id)).get()
  if (!c) throw new Error(`El costo ${id} no existe`)
  return c
}

/** Costo `id` and what its lifecycle needs to judge it in `hoy`'s month. */
function costoConContexto(db: Db, id: number, hoy: string): { c: ReturnType<typeof leerCosto>; ctx: ContextoCosto } {
  const c = leerCosto(db, id)
  const definicion = c.definicionId === null ? undefined : db.select().from(definicionesCosto).where(eq(definicionesCosto.id, c.definicionId)).get()
  return { c, ctx: { definicion, periodoActual: hoy.slice(0, 7) } }
}

/** A hand-entered Ingreso; given a Proyecto, its Contacto is the Proyecto's. */
export function nuevoIngreso(db: Db, n: IngresoNuevo, hoy: string) {
  exigirCentavos(n.subtotal)
  // Uninvoiced income carries no IVA.
  const registrados = montos(n.subtotal, { iva: n.categoria === 'factura' && n.conIva })
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
      ...registrados,
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
  exigirCentavos(n.subtotal)
  exigirFecha(n.fecha)
  if (n.categoria === 'msi' && (!n.parcialidades || n.parcialidades < 2)) throw new Error('Un costo a MSI necesita al menos 2 parcialidades')
  // A one-time Costo and a recurring one's first vigencia are built alike.
  const registrados = montos(n.subtotal, { iva: n.conIva })
  const proveedor = n.proveedor?.trim() || null

  if (n.categoria === 'unico') {
    const pagado = n.pagado && n.fecha <= hoy
    db.insert(costos)
      .values({
        nombre,
        categoria: 'unico',
        estado: pagado ? 'pagado' : 'pendiente',
        ...registrados,
        proveedor,
        referencia: n.referencia?.trim() || null,
        fecha: n.fecha,
        fechaPago: pagado ? n.fecha : null,
        proyectoId: n.proyectoId,
        suscripcionIa: n.suscripcionIa
      })
      .run()
    return
  }

  const periodoInicio = n.fecha.slice(0, 7)
  transaccionConPeriodos(db, hoy, (tx) => {
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
    tx.insert(vigenciasPrecio).values({ definicionCostoId, desde: periodoInicio, ...registrados }).run()
  })
}

export function pagarIngreso(db: Db, id: number, hoy: string) {
  const { i, ctx } = ingresoConContexto(db, id)
  exigirIngreso('pagar', i, ctx)
  db.update(ingresos).set({ estado: 'pagado', fechaPago: hoy }).where(eq(ingresos.id, id)).run()
}

export function cancelarIngreso(db: Db, id: number) {
  const { i, ctx } = ingresoConContexto(db, id)
  exigirIngreso('cancelar', i, ctx)
  db.update(ingresos).set({ estado: 'cancelado' }).where(eq(ingresos.id, id)).run()
}

/** Borrar vs cancelar: an imported, generated or quoted Ingreso, or one with a Reembolso, is cancelled instead. */
export function borrarIngreso(db: Db, id: number) {
  const { i, ctx } = ingresoConContexto(db, id)
  exigirIngreso('borrar', i, ctx)
  db.delete(ingresos).where(eq(ingresos.id, id)).run()
}

/**
 * Reembolso of `monto` (the total, in the Ingreso's own currency) against a paid Ingreso, dated
 * today, never more than what is left of it. A USD one converts at the Ingreso's own rate; IVA and
 * retenciones are in the Ingreso's proportion; giving back all that is left takes the exact remainders.
 */
export function reembolsar(db: Db, id: number, monto: number, hoy: string) {
  exigirCentavos(monto)
  const { i, ctx } = ingresoConContexto(db, id)
  exigirIngreso('reembolsar', i, ctx)
  const tasa = monedaDe(i) === 'USD' ? tasaDe(i) : 1
  if (tasa === null) throw new Error('El ingreso en USD no tiene su monto en USD')
  const queda = restante(i, ctx.reembolsos)
  if (monto > queda.original) throw new Error(MENSAJE_REEMBOLSO_EXCEDIDO)
  const todo = monto === queda.original
  const total = todo ? queda.total : Math.min(queda.total, Math.round(monto * tasa))
  const iva = todo ? queda.iva : Math.min(queda.iva, Math.round((total * i.iva) / i.total))
  const retenciones = todo ? queda.retenciones : Math.min(queda.retenciones, Math.round((total * i.retenciones) / i.total))
  registrarReembolso(db, id, { subtotal: total - iva + retenciones, iva, retenciones, fecha: hoy, montoOriginal: queda.moneda === 'USD' ? monto : undefined })
}

export function pagarCosto(db: Db, id: number, hoy: string) {
  const { c, ctx } = costoConContexto(db, id, hoy)
  exigirCosto('pagar', c, ctx)
  db.update(costos).set({ estado: 'pagado', fechaPago: hoy }).where(eq(costos.id, id)).run()
}

export function cancelarCosto(db: Db, id: number, hoy: string) {
  const { c, ctx } = costoConContexto(db, id, hoy)
  exigirCosto('cancelar', c, ctx)
  db.update(costos).set({ estado: 'cancelado' }).where(eq(costos.id, id)).run()
}

/** Borrar vs cancelar: only a hand-entered one-time Costo nothing is attributed from. */
export function borrarCosto(db: Db, id: number, hoy: string) {
  const { c, ctx } = costoConContexto(db, id, hoy)
  exigirCosto('borrar', c, ctx)
  db.delete(costos).where(eq(costos.id, id)).run()
}

/** Ends the monthly or annual series the Costo belongs to after this month; MSI is committed. */
export function detenerCosto(db: Db, id: number, hoy: string) {
  const { c, ctx } = costoConContexto(db, id, hoy)
  exigirCosto('detener', c, ctx)
  db.update(definicionesCosto).set({ periodoFin: ctx.periodoActual }).where(eq(definicionesCosto.id, c.definicionId!)).run()
}

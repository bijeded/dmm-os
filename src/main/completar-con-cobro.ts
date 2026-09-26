import { and, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm'
import type { Db } from './db'
import { cotizaciones, ingresos, proyectos, sugerenciasImportacion } from './db/schema'
import { estadoCobro } from './cobranza'
import { exigirProyecto } from './ciclo-proyecto'
import { montoEn, montos, type MontosRegistrados } from './dinero'
import { pagarIngreso } from './movimientos'
import { responderEn } from './sugerencias'
import { exigirCentavos, TASA_IVA } from '../shared/montos'
import type { CobroAlCompletar, FacturaPorVincular, Moneda, OpcionesCobro } from '../shared/dominio'

// Completar con cobro: when Completar finds a Proyecto not fully paid, the dialog records what was
// paid, and what never will be as Incobrable, then completes it. The guard stays the only gate:
// the Proyecto completes only if what this writes leaves nothing missing.

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Ingreso = typeof ingresos.$inferSelect

export const MENSAJE_FECHA_FUTURA = 'La fecha de pago no puede ser futura'
export const MENSAJE_MONTO_EXCEDIDO = 'El monto no puede ser mayor a lo que falta'
export const MENSAJE_PENDIENTES_CAMBIARON = 'Los pagos pendientes cambiaron; vuelve a abrir Completar'

/** A USD invoice's subtotal in USD, from its USD total in the proportion of its pesos (as `precioFacturado` reads it). */
const subtotalUsd = (original: number, subtotal: number, total: number) => Math.round((original * subtotal) / (total || 1))

function leerProyecto(db: Db, id: number) {
  const p = db.select().from(proyectos).where(eq(proyectos.id, id)).get()
  if (!p) throw new Error(`El proyecto ${id} no existe`)
  const c = p.cotizacionId === null ? undefined : db.select().from(cotizaciones).where(eq(cotizaciones.id, p.cotizacionId)).get()
  return { p, c }
}

/**
 * The Contacto's issued invoices on no Proyecto, not cancelled, in the Cotización's currency: one
 * per CFDI, its Parcialidades together, its total net of their Reembolsos (what stayed). Those whose
 * subtotal is the Cotización's come first (a USD one within 1%, for the rounding of its USD amount),
 * then the newest.
 */
function facturasPorVincular(db: Db, contactoId: number | null, moneda: Moneda, subtotalCotizacion: number | null): FacturaPorVincular[] {
  if (contactoId === null) return []
  const porUuid = new Map<string, Ingreso[]>()
  for (const i of db
    .select()
    .from(ingresos)
    .where(and(eq(ingresos.contactoId, contactoId), isNotNull(ingresos.cfdiUuid), isNull(ingresos.proyectoId), ne(ingresos.estado, 'cancelado')))
    .all()) {
    if ((i.monedaOriginal === 'USD') !== (moneda === 'USD')) continue
    porUuid.set(i.cfdiUuid!, [...(porUuid.get(i.cfdiUuid!) ?? []), i])
  }
  const reembolsos = reembolsosDe(db, [...porUuid.values()].flat().map((i) => i.id))
  const facturas = [...porUuid.entries()].map(([cfdiUuid, filas]) => {
    const suma = (f: (i: Ingreso) => number) => filas.reduce((s, i) => s + f(i), 0)
    const devuelto = reembolsos.filter((r) => filas.some((i) => i.id === r.reembolsoDeId)).reduce((s, r) => s + montoEn(r, moneda), 0)
    const total = suma((i) => montoEn(i, moneda)) + devuelto
    const subtotal = moneda === 'USD' ? subtotalUsd(total, suma((i) => i.subtotal), suma((i) => i.total)) : suma((i) => i.subtotal)
    const coincide =
      subtotalCotizacion !== null && (moneda === 'USD' ? Math.abs(subtotal - subtotalCotizacion) <= subtotalCotizacion * 0.01 : subtotal === subtotalCotizacion)
    return {
      cfdiUuid,
      fecha: filas.reduce((f, i) => (i.fechaRegistro && i.fechaRegistro < f ? i.fechaRegistro : f), filas[0].fechaRegistro ?? ''),
      subtotal,
      total,
      pendiente: filas.some((i) => i.estado === 'pendiente'),
      coincide
    }
  })
  return facturas.sort((a, b) => Number(b.coincide) - Number(a.coincide) || b.fecha.localeCompare(a.fecha) || a.cfdiUuid.localeCompare(b.cfdiUuid))
}

/** The Reembolsos given back against Ingresos `ids`: they go wherever their Ingreso goes. */
const reembolsosDe = (db: Db, ids: number[]) => (ids.length ? db.select().from(ingresos).where(inArray(ingresos.reembolsoDeId, ids)).all() : [])

/** What the Completar con cobro dialog shows for Proyecto `id`. Refused when its estado allows no Completar. */
export function opcionesCobro(db: Db, id: number): OpcionesCobro {
  const { p, c } = leerProyecto(db, id)
  // Only the estado is judged here: being unpaid is what the dialog is for.
  exigirProyecto('completar', p.estado, { pagadoCompleto: true })
  const cobro = estadoCobro(db, id)
  const conTotal = c !== undefined && c.facturacion !== 'mensual'
  const moneda: Moneda = c?.moneda === 'USD' ? 'USD' : 'MXN'
  const suyos = db.select().from(ingresos).where(eq(ingresos.proyectoId, id)).all()
  const monto = (i: Ingreso) => montoEn(i, moneda, c?.tipoCambio)
  const pendientes = suyos
    .filter((i) => i.estado === 'pendiente')
    .map((i) => ({ id: i.id, fecha: i.fechaRegistro, categoria: i.categoria, monto: monto(i) }))
  const faltante = cobro.falta?.faltante ?? 0
  return {
    moneda,
    subtotalCotizacion: conTotal ? c.subtotal : null,
    totalCotizacion: conTotal ? c.total : null,
    saldado: conTotal ? c.total - faltante : 0,
    pendientes,
    falta: Math.max(0, faltante - pendientes.reduce((s, i) => s + i.monto, 0)),
    tipoCambio: c?.tipoCambio ?? null,
    facturas: facturasPorVincular(db, p.contactoId, moneda, conTotal ? c.subtotal : null)
  }
}

const entero = (x: unknown): x is number => Number.isInteger(x)

/** The dialog's answer, which arrives over IPC unchecked: anything but its shape is refused. What it means is `planCobro`'s to judge. */
export function cobroValido(x: unknown): CobroAlCompletar {
  const c = x as Partial<Record<keyof CobroAlCompletar, unknown>> | null
  const pago = (typeof c?.pago === 'object' ? c.pago : undefined) as Record<string, unknown> | null | undefined
  const pagoValido =
    pago === null ||
    (pago !== undefined &&
      ((pago.tipo === 'sin_factura' && entero(pago.monto)) ||
        (pago.tipo === 'cfdi' && typeof pago.cfdiUuid === 'string') ||
        (pago.tipo === 'factura_fuera_de_disco' && entero(pago.monto) && typeof pago.conIva === 'boolean')))
  if (
    typeof c !== 'object' ||
    c === null ||
    typeof c.fecha !== 'string' ||
    !Array.isArray(c.pendientes) ||
    !c.pendientes.every(entero) ||
    !Array.isArray(c.incobrables) ||
    !c.incobrables.every(entero) ||
    !pagoValido ||
    !(c.tipoCambio === null || typeof c.tipoCambio === 'number')
  )
    throw new Error('Cobro no válido')
  return c as CobroAlCompletar
}

/** An Ingreso Completar con cobro writes: paid, or Incobrable for what will never be paid. */
export interface IngresoAlCompletar extends MontosRegistrados {
  categoria: 'factura' | 'sin_factura'
  estadoFacturacion: 'facturado' | null
  estado: 'pagado' | 'incobrable'
}

/** What the dialog's answer writes, once checked against what it was offered. */
export interface PlanCobro {
  fecha: string
  pagar: number[]
  incobrables: number[]
  nuevos: IngresoAlCompletar[]
  /** The CFDI to link to the Proyecto. */
  cfdi: string | null
}

/**
 * Checks the dialog's answer against `o` and works out what it writes: pending Ingresos paid on
 * the Fecha de pago or marked Incobrable, what is still missing paid without an invoice, by a
 * linked CFDI or by an invoice not on disk, and any shortfall recorded as one Incobrable Ingreso.
 * Amounts are totals in the Cotización's currency; a USD one converts at the dialog's rate and
 * keeps its USD amount. Uninvoiced and Incobrable Ingresos carry no IVA; an invoice not on disk has
 * 16% IVA inside its total unless turned off.
 */
export function planCobro(o: OpcionesCobro, cobro: CobroAlCompletar, hoy: string): PlanCobro {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cobro.fecha)) throw new Error('La fecha no es válida')
  if (cobro.fecha > hoy) throw new Error(MENSAJE_FECHA_FUTURA)
  const ids = new Set(o.pendientes.map((i) => i.id))
  // Every pending Ingreso not marked Incobrable is paid, so the dialog must have shown exactly these.
  if (cobro.pendientes.length !== ids.size || !cobro.pendientes.every((id) => ids.has(id))) throw new Error(MENSAJE_PENDIENTES_CAMBIARON)
  if (!cobro.incobrables.every((id) => ids.has(id))) throw new Error('Ese ingreso ya no está pendiente')
  const incobrables = new Set(cobro.incobrables)

  const usd = o.moneda === 'USD'
  const tasaUsd = usd ? cobro.tipoCambio : null
  if (usd && o.falta > 0 && !(typeof tasaUsd === 'number' && Number.isFinite(tasaUsd) && tasaUsd > 0)) throw new Error('Escribe el tipo de cambio')
  const registrar = (subtotal: number, iva: number | boolean = false) => montos(subtotal, { iva, tasaUsd })
  const nuevos: IngresoAlCompletar[] = []
  let cfdi: string | null = null

  if (o.falta > 0) {
    const pago = cobro.pago
    if (!pago) throw new Error('Indica si el pago fue con factura')
    let recibido: number
    if (pago.tipo === 'cfdi') {
      const factura = o.facturas.find((f) => f.cfdiUuid === pago.cfdiUuid)
      if (!factura) throw new Error('Esa factura ya no se puede vincular')
      cfdi = factura.cfdiUuid
      recibido = factura.total
    } else {
      recibido = exigirCentavos(pago.monto)
      if (recibido > o.falta) throw new Error(MENSAJE_MONTO_EXCEDIDO)
      if (pago.tipo === 'sin_factura') {
        nuevos.push({ ...registrar(recibido), categoria: 'sin_factura', estadoFacturacion: null, estado: 'pagado' })
      } else {
        const subtotal = pago.conIva ? Math.round(recibido / (1 + TASA_IVA)) : recibido
        nuevos.push({ ...registrar(subtotal, recibido - subtotal), categoria: 'factura', estadoFacturacion: 'facturado', estado: 'pagado' })
      }
    }
    const resto = o.falta - recibido
    if (resto > 0) nuevos.push({ ...registrar(resto), categoria: 'sin_factura', estadoFacturacion: null, estado: 'incobrable' })
  }

  return {
    fecha: cobro.fecha,
    pagar: o.pendientes.filter((i) => !incobrables.has(i.id)).map((i) => i.id),
    incobrables: [...incobrables],
    nuevos,
    cfdi
  }
}

/**
 * Writes `plan` for Proyecto `id` inside `tx`: pays and marks its pending Ingresos, adds the new
 * ones, and links the CFDI, paying what of it is pending and answering any *vincular* Sugerencia
 * still waiting on it with this Proyecto, as answering it in Logs would.
 */
export function registrarCobro(tx: Tx, id: number, plan: PlanCobro, hoy: string): void {
  const { p } = leerProyecto(tx, id)
  for (const i of plan.pagar) pagarIngreso(tx, i, plan.fecha)
  if (plan.incobrables.length)
    tx.update(ingresos)
      .set({ estado: 'incobrable' })
      .where(and(inArray(ingresos.id, plan.incobrables), eq(ingresos.proyectoId, id), eq(ingresos.estado, 'pendiente')))
      .run()
  for (const n of plan.nuevos) {
    tx.insert(ingresos)
      .values({ ...n, proyectoId: id, contactoId: p.contactoId, fechaRegistro: plan.fecha, fechaPago: n.estado === 'pagado' ? plan.fecha : null })
      .run()
  }
  if (plan.cfdi === null) return
  const filas = tx
    .select()
    .from(ingresos)
    .where(and(eq(ingresos.cfdiUuid, plan.cfdi), eq(ingresos.contactoId, p.contactoId!), isNull(ingresos.proyectoId), ne(ingresos.estado, 'cancelado')))
    .all()
  const filaIds = filas.map((i) => i.id)
  for (const s of tx
    .select()
    .from(sugerenciasImportacion)
    .where(
      and(
        eq(sugerenciasImportacion.estado, 'pendiente'),
        eq(sugerenciasImportacion.accion, 'vincular'),
        eq(sugerenciasImportacion.entidad, 'ingreso'),
        inArray(sugerenciasImportacion.entidadId, filaIds)
      )
    )
    .all())
    responderEn(tx, s, { elegidas: [id] }, hoy)
  const movidos = [...filaIds, ...reembolsosDe(tx, filaIds).map((r) => r.id)]
  tx.update(ingresos).set({ proyectoId: id }).where(inArray(ingresos.id, movidos)).run()
  for (const i of filas) if (i.estado === 'pendiente') pagarIngreso(tx, i.id, plan.fecha)
}

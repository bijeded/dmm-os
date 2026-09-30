import { and, eq, ne } from 'drizzle-orm'
import type { Db } from './db'
import { costos, definicionesCosto, ingresos, proyectos, vigenciasPrecio } from './db/schema'
import { monedaDe, montoEn, montos, reembolso, subtotalEn, tasaDe } from './dinero'
import { exigirCosto } from './ciclo-costo'
import { bloqueosIngreso, exigirIngreso, restante, type Ingreso } from './ciclo-ingreso'
import { fechaIngreso, transaccionConPeriodos } from './ledger'
import { exigirCentavos } from '../shared/montos'
import { CATEGORIAS_INGRESO, type CampoBloqueado, type CostoNuevo, type IngresoEditable, type IngresoEditado, type IngresoNuevo } from '../shared/dominio'
import { esFecha, periodoDe } from '../shared/fechas'

// Movimientos: Ingresos and Costos entered, paid, cancelled, deleted, refunded or stopped. Which of
// those each one allows now is its lifecycle's (ciclo-ingreso, ciclo-costo), as the Finanzas rows show.

function exigirFecha(fecha: string) {
  if (!esFecha(fecha)) throw new Error('La fecha no es válida')
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

/** Ingreso `i` as Editar ingreso opens it, in its own currency, with what it cannot change. */
function editable(i: Ingreso, reembolsos: Ingreso[]): IngresoEditable {
  const moneda = monedaDe(i)
  const esReembolso = i.reembolsoDeId !== null
  return {
    id: i.id,
    moneda,
    estado: i.estado,
    reembolsoDeId: i.reembolsoDeId,
    bloqueados: bloqueosIngreso(i, { reembolsos }),
    fecha: fechaIngreso(i) ?? '',
    // A Reembolso is edited as what it gives back, as it was recorded.
    monto: esReembolso ? 0 - montoEn(i, moneda) : subtotalEn(i),
    tipoCambio: esReembolso ? null : tasaDe(i),
    categoria: i.categoria,
    conIva: i.iva !== 0,
    facturado: i.estadoFacturacion === 'facturado',
    proyectoId: i.proyectoId,
    contactoId: i.contactoId,
    notas: i.notas
  }
}

/** Editar ingreso opens: Ingreso `id`'s current values, once its lifecycle allows editing it. */
export function ingresoParaEditar(db: Db, id: number): IngresoEditable {
  const { ingreso, reembolsos } = exigirIngreso(db, 'editar', id)
  return editable(ingreso, reembolsos)
}

/** What Editar ingreso sends over IPC, checked field by field and taken without anything else. */
export function ingresoEditadoValido(x: unknown): IngresoEditado {
  const e = (typeof x === 'object' && x !== null ? x : {}) as Partial<Record<keyof IngresoEditado, unknown>>
  const idONull = (v: unknown) => v === null || (typeof v === 'number' && Number.isInteger(v) && v > 0)
  if (
    typeof e.fecha !== 'string' ||
    typeof e.monto !== 'number' ||
    !(e.tipoCambio === null || (typeof e.tipoCambio === 'number' && Number.isFinite(e.tipoCambio))) ||
    !CATEGORIAS_INGRESO.includes(e.categoria as IngresoEditado['categoria']) ||
    typeof e.conIva !== 'boolean' ||
    typeof e.facturado !== 'boolean' ||
    !idONull(e.proyectoId) ||
    !idONull(e.contactoId) ||
    !(e.notas === null || typeof e.notas === 'string')
  )
    throw new Error('Ingreso no válido')
  const { fecha, monto, tipoCambio, categoria, conIva, facturado, proyectoId, contactoId, notas } = e as IngresoEditado
  return { fecha, monto, tipoCambio, categoria, conIva, facturado, proyectoId, contactoId, notas }
}

const MENSAJE_BLOQUEADO: Record<CampoBloqueado, string> = {
  categoria: 'Este ingreso no cambia de tipo ni de IVA',
  facturacion: 'Este ingreso no cambia su estado de facturación',
  proyecto: 'Este ingreso no cambia de proyecto ni de contacto',
  tipoCambio: 'Este ingreso no cambia su tipo de cambio'
}

/**
 * Editar ingreso: saves `e` over Ingreso `id` in place. What is unchanged stays exactly as stored:
 * amounts are recomputed only when an amount, rate, categoría or IVA changed, and both dates only
 * when the fecha did. Its estado and periodo never change. Its Reembolsos follow its Proyecto,
 * Contacto and Estado de facturación.
 */
export function editarIngreso(db: Db, id: number, e: IngresoEditado, hoy: string) {
  exigirFecha(e.fecha)
  exigirCentavos(e.monto)
  const { ingreso: i, reembolsos } = exigirIngreso(db, 'editar', id)
  const antes = editable(i, reembolsos)
  const esReembolso = i.reembolsoDeId !== null
  const moneda = monedaDe(i)
  const conIva = e.categoria === 'factura' && e.conIva
  const facturado = e.categoria === 'factura' && e.facturado
  const proyectoId = e.proyectoId
  let contactoId = e.contactoId
  // The Contacto comes from the Proyecto: a new one gives its own, the same one keeps what is stored.
  if (proyectoId !== null && proyectoId === antes.proyectoId) contactoId = antes.contactoId
  else if (proyectoId !== null) {
    const p = db.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()
    if (!p) throw new Error(`El proyecto ${proyectoId} no existe`)
    contactoId = p.contactoId
  }
  // A USD Ingreso's rate: a new one when given, otherwise the one it was recorded at.
  const tasaNueva = moneda === 'USD' && !esReembolso ? e.tipoCambio : null
  const tipoCambio = tasaNueva ?? antes.tipoCambio

  const cambia: Record<CampoBloqueado, boolean> = {
    categoria: e.categoria !== antes.categoria || conIva !== antes.conIva,
    facturacion: e.categoria === 'factura' && facturado !== antes.facturado,
    proyecto: proyectoId !== antes.proyectoId || contactoId !== antes.contactoId,
    tipoCambio: tasaNueva !== null && tasaNueva !== antes.tipoCambio
  }
  for (const campo of antes.bloqueados) if (cambia[campo]) throw new Error(MENSAJE_BLOQUEADO[campo])
  if (e.fecha !== antes.fecha) {
    if (i.fechaPago !== null && e.fecha > hoy) throw new Error('Un ingreso pagado no puede tener fecha posterior a hoy')
    // Money is given back after it was received: a Reembolso never predates its Ingreso.
    const pagadoEl = esReembolso ? fechaIngreso(db.select().from(ingresos).where(eq(ingresos.id, i.reembolsoDeId!)).get()!) : null
    if (pagadoEl !== null && e.fecha < pagadoEl) throw new Error('Un reembolso no puede ser anterior al ingreso que devuelve')
    const devueltoEl = reembolsos.map((r) => fechaIngreso(r)).filter((f) => f !== null)
    if (devueltoEl.some((f) => e.fecha > f)) throw new Error('Un ingreso no puede ser posterior a sus reembolsos')
  }

  let registrados: Partial<ReturnType<typeof montos>> = {}
  if (e.monto !== antes.monto || cambia.categoria || cambia.tipoCambio) {
    if (esReembolso) {
      const original = db.select().from(ingresos).where(eq(ingresos.id, i.reembolsoDeId!)).get()!
      const otros = db
        .select()
        .from(ingresos)
        .where(and(eq(ingresos.reembolsoDeId, original.id), ne(ingresos.id, i.id)))
        .all()
      registrados = reembolso(e.monto, { de: original, queda: restante(original, otros), tasaUsd: tasaDe(original) })
    } else {
      if (moneda === 'USD' && !(tipoCambio !== null && tipoCambio > 0)) throw new Error('Escribe un tipo de cambio mayor a cero')
      registrados = montos(e.monto, { iva: conIva, retenciones: moneda === 'MXN' ? i.retenciones : 0, tasaUsd: moneda === 'USD' ? tipoCambio : null })
      const devuelto = 0 - reembolsos.reduce((s, r) => s + montoEn(r, moneda), 0)
      if (montoEn({ ...i, ...registrados }, moneda) < devuelto) throw new Error('El monto no puede ser menor a lo ya reembolsado')
    }
  }

  const estadoFacturacion = e.categoria === 'factura' ? (facturado ? 'facturado' : 'por_facturar') : null
  db.transaction((tx) => {
    tx.update(ingresos)
      .set({
        ...registrados,
        ...(!esReembolso && { categoria: e.categoria, estadoFacturacion, proyectoId, contactoId }),
        ...(e.fecha !== antes.fecha && { fechaRegistro: e.fecha, fechaPago: i.fechaPago === null ? null : e.fecha }),
        notas: e.notas?.trim() || null
      })
      .where(eq(ingresos.id, id))
      .run()
    if (!esReembolso && reembolsos.length > 0)
      tx.update(ingresos).set({ estadoFacturacion, proyectoId, contactoId }).where(eq(ingresos.reembolsoDeId, id)).run()
  })
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

  const periodoInicio = periodoDe(n.fecha)
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
  exigirIngreso(db, 'pagar', id)
  db.update(ingresos).set({ estado: 'pagado', fechaPago: hoy }).where(eq(ingresos.id, id)).run()
}

export function cancelarIngreso(db: Db, id: number) {
  exigirIngreso(db, 'cancelar', id)
  db.update(ingresos).set({ estado: 'cancelado' }).where(eq(ingresos.id, id)).run()
}

/** Borrar vs cancelar: an imported, generated or quoted Ingreso, or one with a Reembolso, is cancelled instead. */
export function borrarIngreso(db: Db, id: number) {
  exigirIngreso(db, 'borrar', id)
  db.delete(ingresos).where(eq(ingresos.id, id)).run()
}

/**
 * Reembolso of `monto` (the total, in the Ingreso's own currency) against a paid Ingreso: a negative
 * Ingreso linked to it, dated today, with the amounts the money module's Reembolso rule gives.
 */
export function reembolsar(db: Db, id: number, monto: number, hoy: string) {
  exigirCentavos(monto)
  const { ingreso: i, queda } = exigirIngreso(db, 'reembolsar', id)
  const tasaUsd = tasaDe(i)
  if (monedaDe(i) === 'USD' && tasaUsd === null) throw new Error('El ingreso en USD no tiene su monto en USD')
  db
    .insert(ingresos)
    .values({
      ...reembolso(monto, { de: i, queda, tasaUsd }),
      categoria: i.categoria,
      estado: 'pagado',
      estadoFacturacion: i.estadoFacturacion,
      proyectoId: i.proyectoId,
      cotizacionId: i.cotizacionId,
      contactoId: i.contactoId,
      fechaRegistro: hoy,
      fechaPago: hoy,
      reembolsoDeId: i.id
    })
    .run()
}

export function pagarCosto(db: Db, id: number, hoy: string) {
  exigirCosto(db, 'pagar', id, hoy)
  db.update(costos).set({ estado: 'pagado', fechaPago: hoy }).where(eq(costos.id, id)).run()
}

export function cancelarCosto(db: Db, id: number, hoy: string) {
  exigirCosto(db, 'cancelar', id, hoy)
  db.update(costos).set({ estado: 'cancelado' }).where(eq(costos.id, id)).run()
}

/** Borrar vs cancelar: only a hand-entered one-time Costo nothing is attributed from. */
export function borrarCosto(db: Db, id: number, hoy: string) {
  exigirCosto(db, 'borrar', id, hoy)
  db.delete(costos).where(eq(costos.id, id)).run()
}

/** Ends the monthly or annual series the Costo belongs to after this month; MSI is committed. */
export function detenerCosto(db: Db, id: number, hoy: string) {
  const c = exigirCosto(db, 'detener', id, hoy)
  db.update(definicionesCosto).set({ periodoFin: periodoDe(hoy) }).where(eq(definicionesCosto.id, c.definicionId!)).run()
}

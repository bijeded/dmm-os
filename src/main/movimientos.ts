import { eq } from 'drizzle-orm'
import type { Db } from './db'
import { costos, definicionesCosto, ingresos, proyectos, vigenciasPrecio } from './db/schema'
import { monedaDe, montos, reembolso, tasaDe } from './dinero'
import { exigirCosto } from './ciclo-costo'
import { exigirIngreso } from './ciclo-ingreso'
import { transaccionConPeriodos } from './ledger'
import { exigirCentavos } from '../shared/montos'
import type { CostoNuevo, IngresoNuevo } from '../shared/dominio'

// Movimientos: Ingresos and Costos entered, paid, cancelled, deleted, refunded or stopped. Which of
// those each one allows now is its lifecycle's (ciclo-ingreso, ciclo-costo), as the Finanzas rows show.

function exigirFecha(fecha: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('La fecha no es válida')
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
  db.update(definicionesCosto).set({ periodoFin: hoy.slice(0, 7) }).where(eq(definicionesCosto.id, c.definicionId!)).run()
}

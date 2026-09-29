import { and, eq, inArray, ne, or, type SQL } from 'drizzle-orm'
import type { Db } from './db'
import { borrar } from './db/cancelacion'
import { contactos, cotizaciones, definicionesIngreso, ingresos, proyectos, sugerenciasImportacion } from './db/schema'
import { exigirCotizacion } from './ciclo-cotizacion'
import { exigirIngreso, type Ingreso } from './ciclo-ingreso'
import { rechazoCambiarContacto } from './ciclo-proyecto'
import { mejorEscrito } from './nombres'
import { responderEn } from './sugerencias'
import type { EntidadCambioContacto, OpcionesAsignar, PreviaCambioContacto } from '../shared/dominio'

// Correcting which Contacto records belong to, and which Proyecto an invoice belongs to, in the
// app: Fusionar Contacto, Cambiar Contacto and Asignar proyecto. Each command moves everything or
// nothing, and changes no estado, amount or date.

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** The Reembolsos given back against Ingresos `ids`: they go wherever their Ingreso goes. */
export const reembolsosDe = (db: Db | Tx, ids: number[]) =>
  ids.length ? db.select().from(ingresos).where(inArray(ingresos.reembolsoDeId, ids)).all() : []

/**
 * Merges Contacto `duplicadoId` into `originalId`: everything that pointed at the duplicate points
 * at the original, the original fills its empty details from the duplicate, and the duplicate is
 * gone. A *fusionar* Sugerencia keeps the better-written spelling (`mejorEscrito`); Fusionar en…
 * keeps the name of the Contacto the owner chose (`destino`), fills its notas too, and is refused
 * when the two hold different RFCs.
 */
export function fusionarEn(tx: Tx, duplicadoId: number, originalId: number, nombre: 'mejorEscrito' | 'destino'): void {
  const duplicado = tx.select().from(contactos).where(eq(contactos.id, duplicadoId)).get()
  const original = tx.select().from(contactos).where(eq(contactos.id, originalId)).get()
  if (!duplicado || !original) throw new Error('No se puede fusionar: falta uno de los Contactos')
  if (duplicadoId === originalId) throw new Error('Un Contacto no se fusiona consigo mismo')
  const manual = nombre === 'destino'
  if (manual && duplicado.rfc && original.rfc && duplicado.rfc !== original.rfc)
    throw new Error(`No se puede fusionar: ${duplicado.nombre} tiene el RFC ${duplicado.rfc} y ${original.nombre} el RFC ${original.rfc}`)

  // Costos reach a Contacto through their Proyecto or Cotización, so moving those moves them.
  for (const tabla of [cotizaciones, proyectos, ingresos, definicionesIngreso]) {
    tx.update(tabla).set({ contactoId: originalId }).where(eq(tabla.contactoId, duplicadoId)).run()
  }
  // Another pending merge may point at the duplicate; it now points at the Contacto that remains.
  // One that asked to merge the remaining Contacto into the duplicate is done by this merge.
  tx.update(sugerenciasImportacion)
    .set({ contactoId: originalId })
    .where(eq(sugerenciasImportacion.contactoId, duplicadoId))
    .run()
  tx.update(sugerenciasImportacion)
    .set({ estado: 'aceptada' })
    .where(
      and(
        eq(sugerenciasImportacion.estado, 'pendiente'),
        eq(sugerenciasImportacion.accion, 'fusionar'),
        eq(sugerenciasImportacion.entidadId, originalId),
        eq(sugerenciasImportacion.contactoId, originalId)
      )
    )
    .run()
  // The duplicate is deleted before the original is updated: it may hold the RFC, which only
  // one Contacto may claim.
  tx.delete(contactos).where(eq(contactos.id, duplicadoId)).run()
  tx.update(contactos)
    .set({
      nombre: manual ? original.nombre : mejorEscrito(original.nombre, duplicado.nombre),
      rfc: original.rfc ?? duplicado.rfc,
      empresa: original.empresa ?? duplicado.empresa,
      email: original.email ?? duplicado.email,
      telefono: original.telefono ?? duplicado.telefono,
      direccion: original.direccion ?? duplicado.direccion,
      ...(manual && { notas: original.notas ?? duplicado.notas })
    })
    .where(eq(contactos.id, originalId))
    .run()
}

/**
 * Fusionar en…: merges Contacto `id` into `destinoId` and returns the destino. A pending
 * suggestion to merge this Contacto is answered by it: *aceptada* when it proposed the destino,
 * *corregida* when it proposed another.
 */
export function fusionarContacto(db: Db, id: number, destinoId: number): number {
  db.transaction((tx) => {
    const sobreEste = and(
      eq(sugerenciasImportacion.estado, 'pendiente'),
      eq(sugerenciasImportacion.accion, 'fusionar'),
      eq(sugerenciasImportacion.entidad, 'contacto'),
      eq(sugerenciasImportacion.entidadId, id)
    )
    for (const s of tx.select().from(sugerenciasImportacion).where(sobreEste).all()) {
      tx.update(sugerenciasImportacion)
        .set({ estado: s.contactoId === destinoId ? 'aceptada' : 'corregida' })
        .where(eq(sugerenciasImportacion.id, s.id))
        .run()
    }
    fusionarEn(tx, id, destinoId, 'destino')
  })
  return destinoId
}

/**
 * Deletes Contacto `id` when nothing is left that names it (Borrar vs cancelar allows it), with any
 * pending suggestion to merge it, and returns its name; `null` when it keeps something.
 */
function borrarSiVacioEn(tx: Tx, id: number): string | null {
  const contacto = tx.select().from(contactos).where(eq(contactos.id, id)).get()
  if (!contacto) return null
  const conAlgo = [cotizaciones, proyectos, ingresos, definicionesIngreso].some(
    (tabla) => tx.select({ id: tabla.id }).from(tabla).where(eq(tabla.contactoId, id)).get() !== undefined
  )
  if (conAlgo) return null
  tx.delete(sugerenciasImportacion)
    .where(
      and(
        eq(sugerenciasImportacion.estado, 'pendiente'),
        eq(sugerenciasImportacion.entidad, 'contacto'),
        eq(sugerenciasImportacion.entidadId, id)
      )
    )
    .run()
  borrar(tx, 'contacto', id)
  return contacto.nombre
}

/** The Cotización and the Proyecto it led to, from either one. */
function leerPar(db: Db | Tx, entidad: EntidadCambioContacto, id: number) {
  if (entidad === 'cotizacion') {
    const cotizacion = db.select().from(cotizaciones).where(eq(cotizaciones.id, id)).get()
    if (!cotizacion) throw new Error(`La cotización ${id} no existe`)
    return { cotizacion, proyecto: db.select().from(proyectos).where(eq(proyectos.cotizacionId, id)).get() }
  }
  const proyecto = db.select().from(proyectos).where(eq(proyectos.id, id)).get()
  if (!proyecto) throw new Error(`El proyecto ${id} no existe`)
  const cotizacion = proyecto.cotizacionId === null ? undefined : db.select().from(cotizaciones).where(eq(cotizaciones.id, proyecto.cotizacionId)).get()
  return { cotizacion, proyecto }
}

/** Cambiar contacto inside `tx`: what it moved, and the Contacto it left with nothing and deleted. */
function cambiarEn(tx: Tx, entidad: EntidadCambioContacto, id: number, contactoId: number): PreviaCambioContacto {
  const { cotizacion, proyecto } = leerPar(tx, entidad, id)
  // Only its estado decides whether a Cotización's Contacto can change.
  if (cotizacion) exigirCotizacion('cambiarContacto', cotizacion.estado, { proyecto: null })
  const rechazo = proyecto ? rechazoCambiarContacto(proyecto) : null
  if (rechazo) throw new Error(rechazo)
  const destino = tx.select().from(contactos).where(eq(contactos.id, contactoId)).get()
  if (!destino) throw new Error(`El contacto ${contactoId} no existe`)
  const desde = cotizacion?.contactoId ?? proyecto!.contactoId!
  if (desde === contactoId) throw new Error(`Ya es de ${destino.nombre}`)

  const delPar = (tabla: typeof ingresos | typeof definicionesIngreso): SQL =>
    or(...[proyecto && eq(tabla.proyectoId, proyecto.id), cotizacion && eq(tabla.cotizacionId, cotizacion.id)].filter((c) => c !== undefined))!
  const suyos = tx.select().from(ingresos).where(delPar(ingresos)).all()
  const definiciones = tx.select({ id: definicionesIngreso.id }).from(definicionesIngreso).where(delPar(definicionesIngreso)).all()

  // An invoice names its receptor: moving it to another Contacto would contradict the CFDI.
  const factura = suyos.find((i) => i.cfdiUuid !== null)
  if (factura)
    throw new Error(`Tiene la factura ${factura.cfdiUuid!.slice(0, 8)}…: fusiona el contacto, o asigna la factura a otro proyecto en Finanzas`)
  const sobre = (e: 'cotizacion' | 'proyecto' | 'ingreso', ids: number[]) =>
    ids.length ? and(eq(sugerenciasImportacion.entidad, e), inArray(sugerenciasImportacion.entidadId, ids)) : undefined
  const esperando = tx
    .select({ id: sugerenciasImportacion.id })
    .from(sugerenciasImportacion)
    .where(
      and(
        eq(sugerenciasImportacion.estado, 'pendiente'),
        or(
          sobre('cotizacion', cotizacion ? [cotizacion.id] : []),
          sobre('proyecto', proyecto ? [proyecto.id] : []),
          sobre('ingreso', suyos.map((i) => i.id)),
          proyecto && eq(sugerenciasImportacion.proyectoId, proyecto.id)
        )
      )
    )
    .get()
  if (esperando) throw new Error('Tiene una sugerencia de importación pendiente; respóndela primero en Logs')

  if (cotizacion) tx.update(cotizaciones).set({ contactoId }).where(eq(cotizaciones.id, cotizacion.id)).run()
  if (proyecto) tx.update(proyectos).set({ contactoId }).where(eq(proyectos.id, proyecto.id)).run()
  if (suyos.length)
    tx.update(ingresos)
      .set({ contactoId })
      .where(inArray(ingresos.id, suyos.map((i) => i.id)))
      .run()
  if (definiciones.length)
    tx.update(definicionesIngreso)
      .set({ contactoId })
      .where(inArray(definicionesIngreso.id, definiciones.map((d) => d.id)))
      .run()
  return { cotizaciones: cotizacion ? 1 : 0, proyectos: proyecto ? 1 : 0, ingresos: suyos.length, borraContacto: borrarSiVacioEn(tx, desde) }
}

/**
 * Cambiar contacto: moves a Cotización and the Proyecto it led to (or a Proyecto with no
 * Cotización) to Contacto `contactoId`, with their Ingresos and recurring Ingreso definitions,
 * and deletes the Contacto it leaves with nothing.
 */
export function cambiarContacto(db: Db, entidad: EntidadCambioContacto, id: number, contactoId: number): PreviaCambioContacto {
  return db.transaction((tx) => cambiarEn(tx, entidad, id, contactoId))
}

const DESHACER = Symbol('deshacer')

/** What Cambiar contacto would do, found by doing it and rolling it back, so it cannot disagree. */
export function previaCambioContacto(db: Db, entidad: EntidadCambioContacto, id: number, contactoId: number): PreviaCambioContacto {
  let previa: PreviaCambioContacto | undefined
  try {
    db.transaction((tx) => {
      previa = cambiarEn(tx, entidad, id, contactoId)
      throw DESHACER
    })
  } catch (e) {
    if (e !== DESHACER) throw e
  }
  return previa!
}

/**
 * Puts one CFDI's Ingresos `filas` (its Parcialidades) and their Reembolsos on Proyecto
 * `proyectoId`, or on none, answering any *vincular* Sugerencia still waiting on them as answering
 * it in Logs would: with that Proyecto, or rejected. Returns the ids it moved.
 */
export function vincularCfdiEn(tx: Tx, filas: Ingreso[], proyectoId: number | null, hoy: string): number[] {
  const ids = filas.map((i) => i.id)
  if (ids.length === 0) return []
  for (const s of tx
    .select()
    .from(sugerenciasImportacion)
    .where(
      and(
        eq(sugerenciasImportacion.estado, 'pendiente'),
        eq(sugerenciasImportacion.accion, 'vincular'),
        eq(sugerenciasImportacion.entidad, 'ingreso'),
        inArray(sugerenciasImportacion.entidadId, ids)
      )
    )
    .all())
    responderEn(tx, s, proyectoId === null ? 'rechazada' : { elegidas: [proyectoId] }, hoy)
  const movidos = [...ids, ...reembolsosDe(tx, ids).map((r) => r.id)]
  tx.update(ingresos).set({ proyectoId }).where(inArray(ingresos.id, movidos)).run()
  return movidos
}

/**
 * Where Asignar proyecto can put invoice `ingresoId`: the client Proyectos of its Contacto, or of
 * any Contacto when it has none, newest first.
 */
export function opcionesAsignar(db: Db, ingresoId: number): OpcionesAsignar {
  const { ingreso } = exigirIngreso(db, 'asignarProyecto', ingresoId)
  const filas = db
    .select({ id: proyectos.id, nombre: proyectos.nombre, estado: proyectos.estado, fechaInicio: proyectos.fechaInicio, contacto: contactos.nombre })
    .from(proyectos)
    .leftJoin(contactos, eq(contactos.id, proyectos.contactoId))
    .where(and(eq(proyectos.etiqueta, 'cliente'), ingreso.contactoId === null ? undefined : eq(proyectos.contactoId, ingreso.contactoId)))
    .all()
    .sort((a, b) => (b.fechaInicio ?? '').localeCompare(a.fechaInicio ?? '') || b.id - a.id)
  return {
    actual: ingreso.proyectoId,
    sinContacto: ingreso.contactoId === null,
    proyectos: filas.map(({ id, nombre, estado, contacto }) => ({ id, nombre, estado, contacto }))
  }
}

/**
 * Asignar proyecto: puts every Ingreso of invoice `ingresoId`'s CFDI, and their Reembolsos, on
 * Proyecto `proyectoId` of the same Contacto, or on none. An invoice with no Contacto takes the
 * Proyecto's; the Contacto's RFC is left as it is.
 */
export function asignarProyecto(db: Db, ingresoId: number, proyectoId: number | null, hoy: string): void {
  db.transaction((tx) => {
    const { ingreso } = exigirIngreso(tx, 'asignarProyecto', ingresoId)
    let contactoId = ingreso.contactoId
    if (proyectoId !== null) {
      const p = tx.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()
      if (!p) throw new Error(`El proyecto ${proyectoId} no existe`)
      if (p.etiqueta !== 'cliente') throw new Error('Una factura no se asigna a un proyecto personal')
      if (contactoId !== null && p.contactoId !== contactoId) throw new Error('La factura es de otro contacto; se asigna solo a sus proyectos')
      contactoId = p.contactoId
    }
    const filas = tx
      .select()
      .from(ingresos)
      .where(and(eq(ingresos.cfdiUuid, ingreso.cfdiUuid!), ne(ingresos.estado, 'cancelado')))
      .all()
    const movidos = vincularCfdiEn(tx, filas, proyectoId, hoy)
    if (contactoId !== ingreso.contactoId) tx.update(ingresos).set({ contactoId }).where(inArray(ingresos.id, movidos)).run()
  })
}

import { and, eq } from 'drizzle-orm'
import type { OpcionSugerencia, Sugerencia, RespuestaSugerencia } from '../shared/dominio'
import { mejorEscrito } from './nombres'
import { rutaDeProyecto } from './paths'
import type { Db } from './db/index'
import { hoy as hoyLocal } from '../shared/fechas'
import {
  contactos,
  costos,
  cotizaciones,
  definicionesIngreso,
  ingresos,
  proyectos,
  sugerenciasImportacion,
  ubicacionesArchivo
} from './db/schema'

/**
 * Sugerencias de importación, from guess to answer. The importer writes its guesses so the
 * records are usable and proposes each one here, together with what the guess changed.
 * Accepting finishes what the guess started; rejecting restores what it changed; choosing
 * another of its opciones corrects it. Either way the Sugerencia is answered and never asked
 * again.
 */

/** A transaction, which reads and writes exactly like the database itself. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export type Propuesta = typeof sugerenciasImportacion.$inferInsert

/**
 * Records a guess once: proposing the same guess for the same record again asks nothing twice.
 * Returns whether this call recorded it.
 */
export function proponer(db: Db | Tx, propuesta: Propuesta): boolean {
  return db.insert(sugerenciasImportacion).values(propuesta).onConflictDoNothing().run().changes > 0
}

const mxn = (centavos: number) =>
  (centavos / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

/**
 * The Sugerencias still waiting for an answer, oldest first, each naming what it is about and
 * what it can be answered with.
 */
export function pendientes(db: Db): Sugerencia[] {
  const catalogo = leerCatalogo(db)
  return db
    .select()
    .from(sugerenciasImportacion)
    .where(eq(sugerenciasImportacion.estado, 'pendiente'))
    .orderBy(sugerenciasImportacion.id)
    .all()
    .map((s) => ({
      id: s.id,
      accion: s.accion,
      entidad: s.entidad,
      motivo: s.motivo,
      creadoEn: s.creadoEn,
      registro: describirRegistro(db, s.entidad, s.entidadId),
      destino: describirDestino(db, s.proyectoId, s.contactoId),
      opciones: opcionesDe(db, catalogo, s),
      varias: false
    }))
}

/** Every Contacto and Proyecto, read once so each Sugerencia's opciones cost no query. */
interface Catalogo {
  contactos: { id: number; nombre: string }[]
  proyectos: Map<number, { id: number; nombre: string }>
  proyectosPorContacto: Map<number, { id: number; nombre: string; cotizacionId: number | null }[]>
}

function leerCatalogo(db: Db | Tx): Catalogo {
  const todos = db
    .select({ id: proyectos.id, nombre: proyectos.nombre, contactoId: proyectos.contactoId, cotizacionId: proyectos.cotizacionId })
    .from(proyectos)
    .all()
  const proyectosPorContacto: Catalogo['proyectosPorContacto'] = new Map()
  for (const p of todos) {
    if (p.contactoId === null) continue
    proyectosPorContacto.set(p.contactoId, [...(proyectosPorContacto.get(p.contactoId) ?? []), p])
  }
  return {
    contactos: db.select({ id: contactos.id, nombre: contactos.nombre }).from(contactos).all(),
    proyectos: new Map(todos.map((p) => [p.id, p])),
    proyectosPorContacto
  }
}

/**
 * What `s` can be answered with, worked out from the records as they are now, so the offer
 * follows other answers: a Proyecto freed by a rejected Cotización link appears, a Contacto
 * merged away disappears. Only the guess is `sugerida`.
 */
function opcionesDe(db: Db | Tx, catalogo: Catalogo, s: Fila): OpcionSugerencia[] {
  let opciones: { id: number; nombre: string }[] = []
  if (s.accion === 'fusionar') {
    opciones = catalogo.contactos.filter((c) => c.id !== s.entidadId)
  } else if (s.accion === 'vincular' && (s.entidad === 'cotizacion' || s.entidad === 'ingreso')) {
    const tabla = s.entidad === 'cotizacion' ? cotizaciones : ingresos
    const contactoId = db.select({ contactoId: tabla.contactoId }).from(tabla).where(eq(tabla.id, s.entidadId)).get()?.contactoId
    // A Proyecto holds one Cotización, so one already holding another is not offered; a
    // Proyecto takes any number of Ingresos.
    const delContacto = contactoId ? (catalogo.proyectosPorContacto.get(contactoId) ?? []) : []
    opciones = delContacto.filter((p) => p.id !== s.proyectoId && (s.entidad === 'ingreso' || p.cotizacionId === null))
    const adivinado = catalogo.proyectos.get(s.proyectoId!)
    if (adivinado) opciones.push(adivinado)
  }
  const sugerida = s.accion === 'fusionar' ? s.contactoId : s.proyectoId
  return opciones
    .map(({ id, nombre }) => ({ id, nombre, sugerida: id === sugerida }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

function describirRegistro(db: Db, entidad: Sugerencia['entidad'], id: number): string {
  switch (entidad) {
    case 'ingreso': {
      const i = db.select().from(ingresos).where(eq(ingresos.id, id)).get()
      return i ? `Ingreso ${i.fechaRegistro ?? 'por facturar'} · ${mxn(i.total)}` : `Ingreso ${id}`
    }
    case 'costo': {
      const c = db.select().from(costos).where(eq(costos.id, id)).get()
      return c ? `Costo ${c.nombre} · ${c.fecha}` : `Costo ${id}`
    }
    case 'cotizacion': {
      const c = db.select().from(cotizaciones).where(eq(cotizaciones.id, id)).get()
      return c ? `Cotización ${c.folio}${c.folioSufijo} · ${c.nombre ?? ''}`.trim() : `Cotización ${id}`
    }
    case 'proyecto': {
      const p = db.select().from(proyectos).where(eq(proyectos.id, id)).get()
      return p ? `Proyecto ${p.nombre}` : `Proyecto ${id}`
    }
    case 'contacto': {
      const c = db.select().from(contactos).where(eq(contactos.id, id)).get()
      return c ? `Contacto ${c.nombre}` : `Contacto ${id}`
    }
  }
}

function describirDestino(db: Db, proyectoId: number | null, contactoId: number | null): string | null {
  if (proyectoId !== null) {
    return db.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()?.nombre ?? null
  }
  if (contactoId !== null) {
    return db.select().from(contactos).where(eq(contactos.id, contactoId)).get()?.nombre ?? null
  }
  return null
}

/**
 * Answers one Sugerencia. For `ubicacion`, where there is nothing to accept, `aceptada` means
 * Archivado and `rechazada` means No disponible. Throws if it was already answered: a
 * Sugerencia is asked once. Throws, changing nothing, if the answer names an opción the
 * Sugerencia does not offer now.
 */
export function responder(db: Db, id: number, respuesta: RespuestaSugerencia, hoy = hoyLocal()): void {
  db.transaction((tx) => {
    const s = tx.select().from(sugerenciasImportacion).where(eq(sugerenciasImportacion.id, id)).get()
    if (!s) throw new Error(`No existe la sugerencia ${id}`)
    responderEn(tx, s, respuesta, hoy)
  })
}

/**
 * Aceptar todas: accepts every pending `vincular`, exactly as accepting each one would, and
 * leaves `fusionar` and `ubicacion` waiting. All of them or, if one fails, none. Returns what
 * is still pending.
 */
export function aceptarVincular(db: Db, hoy = hoyLocal()): Sugerencia[] {
  db.transaction((tx) => {
    const esperando = and(eq(sugerenciasImportacion.estado, 'pendiente'), eq(sugerenciasImportacion.accion, 'vincular'))
    for (const s of tx.select().from(sugerenciasImportacion).where(esperando).orderBy(sugerenciasImportacion.id).all())
      responderEn(tx, s, 'aceptada', hoy)
  })
  return pendientes(db)
}

type Fila = typeof sugerenciasImportacion.$inferSelect

/** An answer once checked: the guess taken, refused, or corrected to the chosen opción. */
type Decision = { estado: 'aceptada' | 'rechazada' } | { estado: 'corregida'; elegido: number }

/** Answers `s` inside the caller's transaction. */
export function responderEn(tx: Tx, s: Fila, respuesta: RespuestaSugerencia, hoy: string): void {
  if (s.estado !== 'pendiente') throw new Error('Esa sugerencia ya fue respondida')
  const decision = decidir(tx, s, respuesta)

  if (s.accion === 'vincular') vincular(tx, s, decision)
  else if (s.accion === 'fusionar' && decision.estado !== 'rechazada')
    fusionar(tx, s.entidadId, decision.estado === 'corregida' ? decision.elegido : s.contactoId!)
  else if (s.accion === 'ubicacion' && decision.estado !== 'corregida') ubicacion(tx, s.entidadId, decision.estado, hoy)

  tx.update(sugerenciasImportacion).set({ estado: decision.estado }).where(eq(sugerenciasImportacion.id, s.id)).run()
}

/**
 * Checks an answer against what `s` offers now. It arrives over IPC unchecked, so anything
 * but the two literals or `{ elegidas }` of integers is refused. Choosing exactly the guess is
 * accepting it.
 */
function decidir(tx: Tx, s: Fila, respuesta: unknown): Decision {
  if (respuesta === 'aceptada' || respuesta === 'rechazada') return { estado: respuesta }
  const elegidas: unknown = typeof respuesta === 'object' && respuesta !== null ? (respuesta as { elegidas?: unknown }).elegidas : undefined
  if (!Array.isArray(elegidas) || !elegidas.every((id) => Number.isInteger(id))) throw new Error('Respuesta no válida')

  const opciones = opcionesDe(tx, leerCatalogo(tx), s)
  if (opciones.length === 0) throw new Error('Esta sugerencia no ofrece opciones')
  if (elegidas.length === 0) throw new Error('Elige una opción')
  if (new Set(elegidas).size !== elegidas.length) throw new Error('Una opción se eligió dos veces')
  // No kind lets several be chosen yet (`varias` is false for all).
  if (elegidas.length > 1) throw new Error('Solo se puede elegir una opción')
  const elegido = elegidas[0] as number
  const opcion = opciones.find((o) => o.id === elegido)
  if (!opcion) throw new Error(`Ese ${s.accion === 'fusionar' ? 'Contacto' : 'Proyecto'} ya no se puede elegir`)
  return opcion.sugerida ? { estado: 'aceptada' } : { estado: 'corregida', elegido }
}

/**
 * `vincular` attaches a record to a Proyecto: the guessed one when accepted, the chosen one
 * when corrected. An Ingreso or Costo is only linked then. A Cotización's link was already
 * written along with its inferred `aceptada`, so rejecting is what undoes both, and correcting
 * undoes them before linking the chosen Proyecto.
 */
function vincular(tx: Tx, s: Fila, decision: Decision): void {
  if (decision.estado === 'rechazada') {
    if (s.entidad === 'cotizacion') deshacerCotizacion(tx, s)
    return
  }
  const proyectoId = decision.estado === 'corregida' ? decision.elegido : s.proyectoId!
  if (s.entidad === 'ingreso') {
    tx.update(ingresos).set({ proyectoId }).where(eq(ingresos.id, s.entidadId)).run()
  } else if (s.entidad === 'costo') {
    tx.update(costos).set({ proyectoId }).where(eq(costos.id, s.entidadId)).run()
  } else if (s.entidad === 'cotizacion' && decision.estado === 'corregida') {
    // The guessed Proyecto lets go of the Cotización first, since a Cotización belongs to one
    // Proyecto. `aceptada` is set directly, as the guess did: imported history creates no
    // Ingresos or Costos (ADR-0002). The chosen Proyecto's notes and Cliente final stay as
    // they are.
    deshacerCotizacion(tx, s)
    tx.update(cotizaciones).set({ estado: 'aceptada' }).where(eq(cotizaciones.id, s.entidadId)).run()
    tx.update(proyectos).set({ cotizacionId: s.entidadId }).where(eq(proyectos.id, proyectoId)).run()
  }
}

/** Restores what a Cotización's guessed link changed: its estado and the guessed Proyecto. */
function deshacerCotizacion(tx: Tx, s: Fila): void {
  const proyectoId = s.proyectoId!
  // Without a recorded undo, `enviada` is what the PDF alone says: a quote whose file exists
  // was at least sent.
  const estado = s.deshacer?.cotizacion?.estado ?? 'enviada'
  tx.update(cotizaciones).set({ estado }).where(eq(cotizaciones.id, s.entidadId)).run()
  const proyecto = tx.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()
  // The note goes back only if it is still what the link wrote; anything written since is the
  // user's, and so is everything when no undo was recorded.
  const previo = s.deshacer?.proyecto
  const notas = previo && proyecto?.notas === previo.notasEscritas ? previo.notasAntes : (proyecto?.notas ?? null)
  // A Cliente final the link brought from the quote's map row goes too, unless edited since.
  const clienteFinal =
    previo?.clienteFinalEscrito !== undefined && proyecto?.clienteFinal === previo.clienteFinalEscrito
      ? null
      : (proyecto?.clienteFinal ?? null)
  tx.update(proyectos).set({ cotizacionId: null, notas, clienteFinal }).where(eq(proyectos.id, proyectoId)).run()
}

/**
 * `fusionar` merges the duplicate Contacto into the one it resembles, or the one chosen
 * instead: everything that pointed
 * at the duplicate points at the original, the better-written spelling stays as the Nombre
 * canónico, and the duplicate is gone.
 */
function fusionar(tx: Tx, duplicadoId: number, originalId: number): void {
  const duplicado = tx.select().from(contactos).where(eq(contactos.id, duplicadoId)).get()
  const original = tx.select().from(contactos).where(eq(contactos.id, originalId)).get()
  if (!duplicado || !original) throw new Error('No se puede fusionar: falta uno de los Contactos')

  // Costos reach a Contacto through their Proyecto or Cotización, so moving those moves them.
  for (const tabla of [cotizaciones, proyectos, ingresos, definicionesIngreso]) {
    tx.update(tabla).set({ contactoId: originalId }).where(eq(tabla.contactoId, duplicadoId)).run()
  }
  // Another pending merge may point at the duplicate; it now points at the Contacto that remains.
  tx.update(sugerenciasImportacion)
    .set({ contactoId: originalId })
    .where(eq(sugerenciasImportacion.contactoId, duplicadoId))
    .run()
  // The duplicate is deleted before the original is updated: it may hold the RFC, which only
  // one Contacto may claim.
  tx.delete(contactos).where(eq(contactos.id, duplicadoId)).run()
  tx.update(contactos)
    .set({
      nombre: mejorEscrito(original.nombre, duplicado.nombre),
      rfc: original.rfc ?? duplicado.rfc,
      empresa: original.empresa ?? duplicado.empresa,
      email: original.email ?? duplicado.email,
      telefono: original.telefono ?? duplicado.telefono,
      direccion: original.direccion ?? duplicado.direccion
    })
    .where(eq(contactos.id, originalId))
    .run()
}

/**
 * `ubicacion` settles a completed Proyecto whose folder was found nowhere: Archivado records
 * the archive location its files left for, No disponible records the working folder the app
 * knows but cannot reach. Neither was seen on disk, so neither is available.
 */
function ubicacion(tx: Tx, proyectoId: number, respuesta: 'aceptada' | 'rechazada', hoy: string): void {
  const proyecto = tx.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()
  if (!proyecto) throw new Error(`No existe el proyecto ${proyectoId}`)
  const archivado = respuesta === 'aceptada'
  tx.insert(ubicacionesArchivo)
    .values({
      proyectoId,
      tipo: archivado ? 'archivo' : 'proyectos',
      rutaRelativa: rutaDeProyecto(archivado ? 'archivo' : 'proyectos', proyecto.nombre),
      disponible: false,
      verificadoEn: hoy
    })
    .onConflictDoUpdate({
      target: [ubicacionesArchivo.proyectoId, ubicacionesArchivo.tipo],
      set: { disponible: false }
    })
    .run()
}

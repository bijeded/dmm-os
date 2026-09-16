import { eq } from 'drizzle-orm'
import type { Sugerencia, RespuestaSugerencia } from '../../shared/ipc'
import { mejorEscrito } from '../nombres'
import type { Db } from './index'
import {
  contactos,
  costos,
  cotizaciones,
  definicionesIngreso,
  ingresos,
  proyectos,
  sugerenciasImportacion,
  ubicacionesArchivo
} from './schema'

/**
 * Answering a Sugerencia de importación, once. The importer writes its guesses so the records
 * are usable; what waits here is whether each guess stands. Accepting finishes what the guess
 * started; rejecting undoes it. Either way the Sugerencia is answered and never asked again.
 */

/** A transaction, which reads and writes exactly like the database itself. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const mxn = (centavos: number) =>
  (centavos / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

/** The Sugerencias still waiting for an answer, oldest first, each naming what it is about. */
export function pendientes(db: Db): Sugerencia[] {
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
      destino: describirDestino(db, s.proyectoId, s.contactoId)
    }))
}

function describirRegistro(db: Db, entidad: Sugerencia['entidad'], id: number): string {
  switch (entidad) {
    case 'ingreso': {
      const i = db.select().from(ingresos).where(eq(ingresos.id, id)).get()
      return i ? `Ingreso ${i.fechaRegistro} · ${mxn(i.total)}` : `Ingreso ${id}`
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
 * Sugerencia is asked once.
 */
export function responder(db: Db, id: number, respuesta: RespuestaSugerencia): void {
  db.transaction((tx) => {
    const s = tx.select().from(sugerenciasImportacion).where(eq(sugerenciasImportacion.id, id)).get()
    if (!s) throw new Error(`No existe la sugerencia ${id}`)
    if (s.estado !== 'pendiente') throw new Error('Esa sugerencia ya fue respondida')

    if (s.accion === 'vincular') vincular(tx, s, respuesta)
    else if (s.accion === 'fusionar' && respuesta === 'aceptada') fusionar(tx, s.entidadId, s.contactoId!)
    else if (s.accion === 'ubicacion') ubicacion(tx, s.entidadId, respuesta)

    tx.update(sugerenciasImportacion).set({ estado: respuesta }).where(eq(sugerenciasImportacion.id, id)).run()
  })
}

type Fila = typeof sugerenciasImportacion.$inferSelect

/**
 * `vincular` attaches a record to the guessed Proyecto. An Ingreso or Costo is only linked on
 * acceptance. A Cotización's link was already written along with its inferred `aceptada`, so
 * rejecting is what undoes both.
 */
function vincular(tx: Tx, s: Fila, respuesta: RespuestaSugerencia): void {
  const proyectoId = s.proyectoId!
  if (s.entidad === 'ingreso' && respuesta === 'aceptada') {
    tx.update(ingresos).set({ proyectoId }).where(eq(ingresos.id, s.entidadId)).run()
  } else if (s.entidad === 'costo' && respuesta === 'aceptada') {
    tx.update(costos).set({ proyectoId }).where(eq(costos.id, s.entidadId)).run()
  } else if (s.entidad === 'cotizacion' && respuesta === 'rechazada') {
    tx.update(cotizaciones).set({ estado: 'enviada' }).where(eq(cotizaciones.id, s.entidadId)).run()
    // The notas are the other project names that same quote listed; without the link they say nothing.
    tx.update(proyectos).set({ cotizacionId: null, notas: null }).where(eq(proyectos.id, proyectoId)).run()
  }
}

/**
 * `fusionar` merges the duplicate Contacto into the one it resembles: everything that pointed
 * at the duplicate points at the original, the better-written spelling stays as the Nombre
 * canónico, and the duplicate is gone.
 */
function fusionar(tx: Tx, duplicadoId: number, originalId: number): void {
  const duplicado = tx.select().from(contactos).where(eq(contactos.id, duplicadoId)).get()
  const original = tx.select().from(contactos).where(eq(contactos.id, originalId)).get()
  if (!duplicado || !original) throw new Error('No se puede fusionar: falta uno de los Contactos')

  for (const tabla of [cotizaciones, proyectos, ingresos, definicionesIngreso]) {
    tx.update(tabla).set({ contactoId: originalId }).where(eq(tabla.contactoId, duplicadoId)).run()
  }
  // The duplicate goes first: it may hold the RFC, which only one Contacto may claim.
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
function ubicacion(tx: Tx, proyectoId: number, respuesta: RespuestaSugerencia): void {
  const proyecto = tx.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()
  if (!proyecto) throw new Error(`No existe el proyecto ${proyectoId}`)
  const archivado = respuesta === 'aceptada'
  tx.insert(ubicacionesArchivo)
    .values({
      proyectoId,
      tipo: archivado ? 'archivo' : 'proyectos',
      rutaRelativa: `${archivado ? 'Archivo/Proyectos' : 'Proyectos'}/${proyecto.nombre}`,
      disponible: false,
      verificadoEn: new Date().toISOString().slice(0, 10)
    })
    .onConflictDoNothing()
    .run()
}

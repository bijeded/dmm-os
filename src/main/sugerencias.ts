import { and, eq, isNotNull } from 'drizzle-orm'
import type { OpcionSugerencia, Sugerencia, RespuestaSugerencia } from '../shared/dominio'
import { monto } from '../shared/formato'
import { partidasDelMonto, partidasGuardadas } from './importacion/pdf-cotizacion'
import { heredarDeCotizacion } from './ciclo-proyecto'
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

const mxn = (centavos: number) => monto(centavos)

/**
 * The Sugerencias still waiting for an answer, oldest first, each naming what it is about and
 * what it can be answered with. A "¿Qué aceptó?" is asked only while its Cotización is accepted:
 * once its link is rejected, or it is cancelled, there is nothing it accepted.
 */
export function pendientes(db: Db): Sugerencia[] {
  const catalogo = leerCatalogo(db)
  return db
    .select()
    .from(sugerenciasImportacion)
    .where(eq(sugerenciasImportacion.estado, 'pendiente'))
    .orderBy(sugerenciasImportacion.id)
    .all()
    .filter((s) => s.accion !== 'partidas' || cotizacionAceptada(db, s.entidadId))
    .map((s) => ({
      id: s.id,
      accion: s.accion,
      entidad: s.entidad,
      motivo: s.motivo,
      creadoEn: s.creadoEn,
      registro: describirRegistro(db, s.entidad, s.entidadId),
      destino: describirDestino(db, s.proyectoId, s.contactoId),
      opciones: opcionesDe(db, catalogo, s),
      varias: s.accion === 'partidas'
    }))
}

const cotizacionAceptada = (db: Db | Tx, id: number) =>
  db.select({ estado: cotizaciones.estado }).from(cotizaciones).where(eq(cotizaciones.id, id)).get()?.estado === 'aceptada'

/**
 * Every Contacto and Proyecto, read once per call, so each Sugerencia's opciones need only its
 * record's Contacto.
 */
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
    const delContacto = proyectosPorContacto.get(p.contactoId)
    if (delContacto) delContacto.push(p)
    else proyectosPorContacto.set(p.contactoId, [p])
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
  if (s.accion === 'partidas') return opcionesDePartidas(db, s.entidadId)
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

/**
 * "¿Qué aceptó?": the prices that make an accepted Cotización's Monto, by their index among its
 * items, in the order the PDF lists them. Pre-checked are the ones an issued invoice to its
 * Contacto shows were taken (see `precioFacturado`).
 */
function opcionesDePartidas(db: Db | Tx, cotizacionId: number): OpcionSugerencia[] {
  const c = db.select().from(cotizaciones).where(eq(cotizaciones.id, cotizacionId)).get()
  if (!c) return []
  const partidas = partidasGuardadas(c.items)
  const indices = partidasDelMonto(partidas)
  const facturadas = new Set(precioFacturado(db, c, indices.map((i) => ({ i, precio: partidas[i].precio }))))
  return indices.map((i) => ({
    id: i,
    nombre: `${partidas[i].concepto} · ${monto(partidas[i].precio, c.moneda)}`,
    sugerida: facturadas.has(i)
  }))
}

/** Beyond this many prices, only single prices are matched against an invoice, not their combinations. */
const MAX_COMBINADAS = 12

/**
 * Which prices of `c` an issued invoice to its Contacto covers exactly: the invoice's subtotal
 * (all its Parcialidades together) equals one price or the sum of several. Invoices dated before
 * the quote, or cancelled, say nothing about it. The earliest invoice that matches decides, and
 * the fewest prices that make it. A USD quote is compared with invoices issued in USD, by their
 * USD amount before IVA, allowing 1% for the rounding of that amount.
 */
function precioFacturado(db: Db | Tx, c: typeof cotizaciones.$inferSelect, precios: { i: number; precio: number }[]): number[] {
  if (precios.length === 0) return []
  const usd = c.moneda === 'USD'
  const facturas = new Map<string, { fecha: string; subtotal: number; total: number; original: number; usd: boolean }>()
  for (const i of db
    .select()
    .from(ingresos)
    .where(and(eq(ingresos.contactoId, c.contactoId), isNotNull(ingresos.cfdiUuid)))
    .all()) {
    if (i.estado === 'cancelado' || (i.fechaRegistro ?? '') < c.fecha) continue
    const f = facturas.get(i.cfdiUuid!) ?? { fecha: i.fechaRegistro!, subtotal: 0, total: 0, original: 0, usd: i.monedaOriginal === 'USD' }
    f.fecha = f.fecha < i.fechaRegistro! ? f.fecha : i.fechaRegistro!
    f.subtotal += i.subtotal
    f.total += i.total
    f.original += i.montoOriginal ?? 0
    facturas.set(i.cfdiUuid!, f)
  }
  const combinaciones = subconjuntos(precios, precios.length > MAX_COMBINADAS ? 1 : precios.length)
  const ordenadas = [...facturas.entries()].sort(([ua, a], [ub, b]) => a.fecha.localeCompare(b.fecha) || ua.localeCompare(ub))
  for (const [, f] of ordenadas) {
    if (f.usd !== usd) continue
    const facturado = usd ? Math.round((f.original * f.subtotal) / (f.total || 1)) : f.subtotal
    const cuadra = combinaciones.find((cs) => {
      const suma = cs.reduce((s, p) => s + p.precio, 0)
      return usd ? Math.abs(suma - facturado) <= facturado * 0.01 : suma === facturado
    })
    if (cuadra) return cuadra.map((p) => p.i)
  }
  return []
}

/** Every non-empty subset of up to `max` items, fewest items first, each in the items' order. */
function subconjuntos<T>(items: T[], max: number): T[][] {
  if (max === 1) return items.map((x) => [x])
  const r: T[][] = []
  for (let mascara = 1; mascara < 1 << items.length; mascara++) {
    const s = items.filter((_, i) => mascara & (1 << i))
    if (s.length <= max) r.push(s)
  }
  return r.sort((a, b) => a.length - b.length)
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
  if (s.accion === 'partidas') return responderPartidas(tx, s, respuesta)
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
  const elegidas = elegidasDe(respuesta)

  const opciones = opcionesDe(tx, leerCatalogo(tx), s)
  if (opciones.length === 0) throw new Error('Esta sugerencia no ofrece opciones')
  if (elegidas.length === 0) throw new Error('Elige una opción')
  if (new Set(elegidas).size !== elegidas.length) throw new Error('Una opción se eligió dos veces')
  // Only "¿Qué aceptó?" lets several be chosen, and it is answered by `responderPartidas`.
  if (elegidas.length > 1) throw new Error('Solo se puede elegir una opción')
  const elegido = elegidas[0]
  const opcion = opciones.find((o) => o.id === elegido)
  if (!opcion) throw new Error(`Ese ${s.accion === 'fusionar' ? 'Contacto' : 'Proyecto'} ya no se puede elegir`)
  return opcion.sugerida ? { estado: 'aceptada' } : { estado: 'corregida', elegido }
}

/**
 * "¿Qué aceptó?": the checked prices become the Cotización's Monto, before IVA, as every quote
 * price is. Checking exactly the pre-checked ones accepts the guess; any other set corrects it.
 * Rejecting keeps the Monto the import gave it. Imported history creates no Ingresos, Costos or
 * definitions (ADR-0002), whatever the answer.
 */
function responderPartidas(tx: Tx, s: Fila, respuesta: unknown): void {
  if (!cotizacionAceptada(tx, s.entidadId)) throw new Error('Esa cotización ya no está aceptada')
  let estado: 'aceptada' | 'rechazada' | 'corregida' = 'rechazada'
  if (respuesta !== 'rechazada') {
    const opciones = opcionesDePartidas(tx, s.entidadId)
    const sugeridas = opciones.filter((o) => o.sugerida).map((o) => o.id)
    const elegidas = respuesta === 'aceptada' ? sugeridas : elegidasDe(respuesta)
    if (elegidas.length === 0) throw new Error('Elige qué aceptó')
    if (new Set(elegidas).size !== elegidas.length) throw new Error('Una opción se eligió dos veces')
    if (!elegidas.every((id) => opciones.some((o) => o.id === id))) throw new Error('Ese precio no está en la cotización')
    const iguales = elegidas.length === sugeridas.length && elegidas.every((id) => sugeridas.includes(id))
    estado = iguales ? 'aceptada' : 'corregida'
    const c = tx.select().from(cotizaciones).where(eq(cotizaciones.id, s.entidadId)).get()!
    const partidas = partidasGuardadas(c.items)
    const aceptado = elegidas.reduce((suma, i) => suma + partidas[i].precio, 0)
    tx.update(cotizaciones).set({ subtotal: aceptado, iva: 0, total: aceptado }).where(eq(cotizaciones.id, s.entidadId)).run()
  }
  tx.update(sugerenciasImportacion).set({ estado }).where(eq(sugerenciasImportacion.id, s.id)).run()
}

/** The ids of an `Eleccion`, which arrives over IPC unchecked. */
function elegidasDe(respuesta: unknown): number[] {
  const elegidas: unknown = typeof respuesta === 'object' && respuesta !== null ? (respuesta as { elegidas?: unknown }).elegidas : undefined
  if (!Array.isArray(elegidas) || !elegidas.every((id) => Number.isInteger(id))) throw new Error('Respuesta no válida')
  return elegidas as number[]
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
    // they are; it takes the quote's categoría and fecha only where it has none.
    deshacerCotizacion(tx, s)
    const cotizacion = tx.select().from(cotizaciones).where(eq(cotizaciones.id, s.entidadId)).get()!
    const elegido = tx.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()
    tx.update(cotizaciones).set({ estado: 'aceptada' }).where(eq(cotizaciones.id, s.entidadId)).run()
    tx.update(proyectos)
      .set({ cotizacionId: s.entidadId, ...heredarDeCotizacion(elegido, cotizacion) })
      .where(eq(proyectos.id, proyectoId))
      .run()
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
  if (!proyecto) return
  // The note goes back only if it is still what the link wrote; anything written since is the
  // user's, and so is everything when no undo was recorded.
  const previo = s.deshacer?.proyecto
  const notas = previo && proyecto.notas === previo.notasEscritas ? previo.notasAntes : proyecto.notas
  // What the link filled in from the quote (Cliente final, categoría, fecha de inicio) is
  // emptied again, unless edited since.
  const restaurar = <T>(actual: T, escrito: T | undefined, vacio: T): T => (escrito !== undefined && actual === escrito ? vacio : actual)
  // A Cotización linked to the Proyecto by hand since is the user's.
  const cotizacionId = proyecto.cotizacionId === s.entidadId ? null : proyecto.cotizacionId
  tx.update(proyectos)
    .set({
      cotizacionId,
      notas,
      clienteFinal: restaurar(proyecto.clienteFinal, previo?.clienteFinalEscrito, null),
      categoria: restaurar(proyecto.categoria, previo?.categoriaEscrita, 'other'),
      fechaInicio: restaurar(proyecto.fechaInicio, previo?.fechaInicioEscrita, null)
    })
    .where(eq(proyectos.id, proyectoId))
    .run()
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
  if (duplicadoId === originalId) throw new Error('Un Contacto no se fusiona consigo mismo')

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

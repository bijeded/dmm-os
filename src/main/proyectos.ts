import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import type { Db } from './db'
import { estadoCobro, estadosCobro } from './cobranza'
import { cancelar, RegistroVinculadoError } from './db/cancelacion'
import { contactos, cotizaciones, proyectos, ubicacionesArchivo } from './db/schema'
import { folioDe } from './cotizar'
import { rutaDeProyecto } from './paths'
import { accionesProyecto, completarEsperaPago, exigirProyecto } from './ciclo-proyecto'
import { CATEGORIAS, ESTADOS_PROYECTO, type AccionProyecto, type CarpetaProyecto, type Categoria, type EstadoProyecto, type FichaProyecto, type ListaProyectos, type ProyectoNuevo } from '../shared/dominio'

/** Reads the Proyecto and refuses the action unless its lifecycle allows it. */
function leerPara(db: Db, accion: AccionProyecto, id: number) {
  const p = leer(db, id)
  exigirProyecto(accion, p.estado, estadoCobro(db, id))
  return p
}

export const referenciaProyecto = (id: number) => `PRY-${String(id).padStart(3, '0')}`

function leer(db: Db, id: number) {
  const p = db.select().from(proyectos).where(eq(proyectos.id, id)).get()
  if (!p) throw new Error(`El proyecto ${id} no existe`)
  return p
}

const esCarpeta = (path: string) => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

// Locations the files leave `Proyectos/` for; an external HDD root mirrors the DMM OS layout.
const ARCHIVO = ['archivo', 'hdd_externo', 'google_drive'] as const

/**
 * Where a Proyecto's files are, as it should be shown. A working folder in `Proyectos/` is
 * checked on disk every time: gone means No disponible, never a broken link. Without one, any
 * archive location means Archivado. Only folders under the DMM OS root are opened.
 */
function ubicar(db: Db, root: string, proyectoId: number): CarpetaProyecto & { absoluta: string | null } {
  return ubicarEntre(root, db.select().from(ubicacionesArchivo).where(eq(ubicacionesArchivo.proyectoId, proyectoId)).all())
}

/** `ubicar` over a Proyecto's already-loaded locations. */
function ubicarEntre(root: string, todas: (typeof ubicacionesArchivo.$inferSelect)[]): CarpetaProyecto & { absoluta: string | null } {
  const trabajo = todas.find((u) => u.tipo === 'proyectos')
  if (trabajo && trabajo.disponible && esCarpeta(join(root, trabajo.rutaRelativa))) {
    const absoluta = join(root, trabajo.rutaRelativa)
    return { estado: 'disponible', ruta: trabajo.rutaRelativa, abrible: true, absoluta }
  }
  // Files that left `Proyectos/` for an archive are Archivado, not a broken link.
  const archivo = ARCHIVO.map((t) => todas.find((u) => u.tipo === t)).find((u) => u !== undefined)
  if (archivo) {
    const absoluta = archivo.tipo === 'archivo' && esCarpeta(join(root, archivo.rutaRelativa)) ? join(root, archivo.rutaRelativa) : null
    return { estado: 'archivado', ruta: archivo.rutaRelativa, abrible: absoluta !== null, absoluta }
  }
  if (trabajo) return { estado: 'no_disponible', ruta: trabajo.rutaRelativa, abrible: false, absoluta: null }
  return { estado: 'sin_carpeta', ruta: null, abrible: false, absoluta: null }
}

const visible = ({ estado, ruta, abrible }: CarpetaProyecto): CarpetaProyecto => ({ estado, ruta, abrible })
const carpeta = (db: Db, root: string, id: number): CarpetaProyecto => visible(ubicar(db, root, id))

/** A Proyecto's folder as it should be shown, from its already-loaded locations. */
export const carpetaEntre = (root: string, ubicaciones: (typeof ubicacionesArchivo.$inferSelect)[]): CarpetaProyecto => visible(ubicarEntre(root, ubicaciones))

/**
 * Every Proyecto whose working folder in `Proyectos/` is on disk, with that folder. Archivado ones
 * are left out: a Proyecto is archived when done, and its folder is deleted once backed up.
 */
export function carpetasDeProyectos(db: Db, root: string): { nombre: string; absoluta: string }[] {
  const ubicaciones = db.select().from(ubicacionesArchivo).all()
  return db
    .select({ id: proyectos.id, nombre: proyectos.nombre })
    .from(proyectos)
    .all()
    .flatMap(({ id, nombre }) => {
      const { estado, absoluta } = ubicarEntre(root, ubicaciones.filter((u) => u.proyectoId === id))
      return estado === 'disponible' && absoluta ? [{ nombre, absoluta }] : []
    })
}

/** The folder to reveal in Finder; refused when it cannot be reached. */
export function carpetaAbrible(db: Db, root: string, id: number): string {
  const c = ubicar(db, root, id)
  if (c.absoluta) return c.absoluta
  if (c.estado === 'sin_carpeta') throw new Error('El proyecto no tiene carpeta')
  throw new Error(c.estado === 'archivado' ? 'La carpeta está archivada fuera de DMM OS' : 'La carpeta está No disponible')
}

export function fichaProyecto(db: Db, root: string, id: number): FichaProyecto {
  const p = leer(db, id)
  const contacto = p.contactoId === null ? undefined : db.select({ nombre: contactos.nombre }).from(contactos).where(eq(contactos.id, p.contactoId)).get()
  const cotizacion = p.cotizacionId === null ? undefined : db.select().from(cotizaciones).where(eq(cotizaciones.id, p.cotizacionId)).get()
  const cobro = estadoCobro(db, p.id)
  const { porCobrar, cobrado, falta } = cobro
  return {
    id: p.id,
    referencia: referenciaProyecto(p.id),
    nombre: p.nombre,
    etiqueta: p.etiqueta,
    estado: p.estado,
    contactoId: p.contactoId,
    contacto: contacto?.nombre ?? null,
    clienteFinal: p.clienteFinal,
    categoria: p.categoria,
    cotizacionId: p.cotizacionId,
    folio: cotizacion ? folioDe(cotizacion) : null,
    fechaInicio: p.fechaInicio,
    fechaEntrega: p.fechaEntrega,
    fechaFin: p.fechaFin,
    notas: p.notas,
    carpeta: carpeta(db, root, id),
    porCobrar,
    cobrado,
    falta: completarEsperaPago(p.estado, cobro) ? falta : null,
    acciones: accionesProyecto(p.estado, cobro)
  }
}

const nombreSeguro = (s: string) => s.replace(/[/\\:*?"<>|]/g, '-').trim()

/**
 * Scaffolds the Proyecto's folder in `Proyectos/` and records it, unless it already has a
 * working folder. `<Contacto> - <Nombre>`, or just the name for a personal Proyecto; a folder
 * of that name that exists already belongs to someone else, so a number is added.
 */
export function crearCarpeta(db: Db, root: string, id: number, hoy: string): void {
  const p = leer(db, id)
  const tiene = db
    .select()
    .from(ubicacionesArchivo)
    .where(and(eq(ubicacionesArchivo.proyectoId, id), eq(ubicacionesArchivo.tipo, 'proyectos')))
    .get()
  if (tiene) return
  const contacto = p.contactoId === null ? undefined : db.select().from(contactos).where(eq(contactos.id, p.contactoId)).get()
  const base = nombreSeguro(contacto ? `${contacto.nombre} - ${p.nombre}` : p.nombre)
  let nombre = base
  for (let n = 2; existsSync(join(root, rutaDeProyecto('proyectos', nombre))); n++) nombre = `${base} (${n})`
  const rutaRelativa = rutaDeProyecto('proyectos', nombre)
  mkdirSync(join(root, rutaRelativa), { recursive: true })
  db.insert(ubicacionesArchivo)
    .values({ proyectoId: id, tipo: 'proyectos', rutaRelativa, disponible: true, verificadoEn: hoy })
    .run()
}

const fecha = (f: string | null) => {
  if (f && !/^\d{4}-\d{2}-\d{2}$/.test(f)) throw new Error('Fecha inválida')
  return f || null
}

/**
 * Creates a Proyecto en curso and scaffolds its folder, or edits one. The Contacto of a
 * Proyecto that came from a Cotización is the quote's and does not change; its estado only
 * changes through its actions.
 */
export function guardarProyecto(db: Db, root: string, p: ProyectoNuevo, hoy: string): FichaProyecto {
  const nombre = p.nombre.trim()
  if (!nombre) throw new Error('El proyecto necesita nombre')
  if (!CATEGORIAS.includes(p.categoria)) throw new Error('Categoría desconocida')
  const personal = p.etiqueta === 'personal'
  if (!personal && p.contactoId === null) throw new Error('Un proyecto de cliente necesita contacto')
  const valores = {
    nombre,
    etiqueta: p.etiqueta,
    contactoId: personal ? null : p.contactoId,
    clienteFinal: personal ? null : p.clienteFinal?.trim() || null,
    categoria: p.categoria,
    fechaInicio: fecha(p.fechaInicio),
    fechaEntrega: fecha(p.fechaEntrega),
    notas: p.notas?.trim() || null
  }

  if (p.id === undefined) {
    const id = db
      .insert(proyectos)
      .values({ ...valores, fechaInicio: valores.fechaInicio ?? hoy })
      .returning({ id: proyectos.id })
      .get().id
    crearCarpeta(db, root, id, hoy)
    return fichaProyecto(db, root, id)
  }
  const actual = leerPara(db, 'editar', p.id)
  if (actual.cotizacionId !== null) {
    if (personal) throw new Error('Un proyecto de una cotización no puede ser personal')
    valores.contactoId = actual.contactoId
  }
  db.update(proyectos).set(valores).where(eq(proyectos.id, p.id)).run()
  return fichaProyecto(db, root, p.id)
}

function cambiarEstado(db: Db, root: string, id: number, estado: EstadoProyecto) {
  db.update(proyectos).set({ estado }).where(eq(proyectos.id, id)).run()
  return fichaProyecto(db, root, id)
}

export function pausarProyecto(db: Db, root: string, id: number): FichaProyecto {
  leerPara(db, 'pausar', id)
  return cambiarEstado(db, root, id, 'pausado')
}

export function reanudarProyecto(db: Db, root: string, id: number): FichaProyecto {
  leerPara(db, 'reanudar', id)
  return cambiarEstado(db, root, id, 'en_curso')
}

/** A Proyecto is only completed once fully paid; delivered but unpaid it stays En curso. */
export function completarProyecto(db: Db, root: string, id: number, hoy: string): FichaProyecto {
  leerPara(db, 'completar', id)
  db.update(proyectos).set({ estado: 'completado', fechaFin: hoy }).where(eq(proyectos.id, id)).run()
  return fichaProyecto(db, root, id)
}

/** Cancels the Proyecto and the Cotización it came from (Cancelación con pagos). */
export function cancelarProyecto(db: Db, root: string, id: number, hoy: string): FichaProyecto {
  leerPara(db, 'cancelar', id)
  cancelar(db, 'proyecto', id)
  db.update(proyectos).set({ fechaFin: hoy }).where(eq(proyectos.id, id)).run()
  return fichaProyecto(db, root, id)
}

/**
 * Borrar vs cancelar: a Proyecto with nothing linked is deleted with its recorded locations;
 * its folder stays on disk. Anything linked refuses it, and nothing is removed.
 */
export function borrarProyecto(db: Db, id: number): void {
  leerPara(db, 'borrar', id)
  try {
    db.transaction((tx) => {
      tx.delete(ubicacionesArchivo).where(eq(ubicacionesArchivo.proyectoId, id)).run()
      tx.delete(proyectos).where(eq(proyectos.id, id)).run()
    })
  } catch (e) {
    if (e instanceof Error && e.message.includes('FOREIGN KEY constraint failed')) throw new RegistroVinculadoError('proyecto', id)
    throw e
  }
}

export function listarProyectos(db: Db, root: string): ListaProyectos {
  const filas = db
    .select({ p: proyectos, contacto: contactos.nombre })
    .from(proyectos)
    .leftJoin(contactos, eq(contactos.id, proyectos.contactoId))
    .all()
    .sort((a, b) => b.p.id - a.p.id)
  // Every location, and the Ingresos of every Proyecto that could be flagged, read once rather than per row.
  const ubicaciones = new Map<number, (typeof ubicacionesArchivo.$inferSelect)[]>()
  for (const u of db.select().from(ubicacionesArchivo).all()) ubicaciones.set(u.proyectoId, [...(ubicaciones.get(u.proyectoId) ?? []), u])
  const cobros = estadosCobro(
    db,
    filas.map(({ p }) => p).filter((p) => p.estado === 'completado' && p.cotizacionId !== null && ubicaciones.has(p.id))
  )
  const lista = filas.map(({ p, contacto }) => ({
    id: p.id,
    referencia: referenciaProyecto(p.id),
    nombre: p.nombre,
    etiqueta: p.etiqueta,
    contactoId: p.contactoId,
    contacto,
    clienteFinal: p.clienteFinal,
    categoria: p.categoria,
    fechaInicio: p.fechaInicio,
    estado: p.estado,
    carpeta: carpetaEntre(root, ubicaciones.get(p.id) ?? []),
    // Completed, with files somewhere and a Cotización its paid Ingresos never reached: imported
    // history (ADR-0002) waiting for its uninvoiced Ingresos to be entered by hand.
    sinIngresosRegistrados: (cobros.get(p.id)?.falta?.faltante ?? 0) > 0
  }))
  const conteo = Object.fromEntries(ESTADOS_PROYECTO.map((e) => [e, 0])) as Record<EstadoProyecto, number>
  const porCategoria = Object.fromEntries(CATEGORIAS.map((c) => [c, 0])) as Record<Categoria, number>
  for (const f of lista) {
    conteo[f.estado]++
    porCategoria[f.categoria]++
  }
  return { proyectos: lista, conteo, porCategoria }
}

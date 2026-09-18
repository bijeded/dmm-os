import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import type { Db } from './db'
import { cancelar, RegistroVinculadoError } from './db/cancelacion'
import { contactos, cotizaciones, ingresos, proyectos, ubicacionesArchivo } from './db/schema'
import { folioDe } from './cotizar'
import { rutaDeProyecto } from './paths'
import {
  CATEGORIAS,
  ESTADOS_PROYECTO,
  type AccionProyecto,
  type CarpetaProyecto,
  type Categoria,
  type EstadoProyecto,
  type FichaProyecto,
  type ListaProyectos,
  type ProyectoNuevo
} from '../shared/ipc'

/** Which estados allow each action. The guards below and the ficha's `acciones` both read this. */
const PERMITIDA_EN: Record<AccionProyecto, readonly EstadoProyecto[]> = {
  editar: ['en_curso', 'pausado', 'completado'],
  borrar: ['en_curso', 'pausado'],
  pausar: ['en_curso'],
  reanudar: ['pausado'],
  completar: ['en_curso', 'pausado'],
  cancelar: ['en_curso', 'pausado']
}

function exigir(accion: AccionProyecto, estado: EstadoProyecto, mensaje: string) {
  if (!PERMITIDA_EN[accion].includes(estado)) throw new Error(mensaje)
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
  const todas = db.select().from(ubicacionesArchivo).where(eq(ubicacionesArchivo.proyectoId, proyectoId)).all()
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

const carpeta = (db: Db, root: string, id: number): CarpetaProyecto => {
  const { estado, ruta, abrible } = ubicar(db, root, id)
  return { estado, ruta, abrible }
}

/** The folder to reveal in Finder; refused when it cannot be reached. */
export function carpetaAbrible(db: Db, root: string, id: number): string {
  const c = ubicar(db, root, id)
  if (c.absoluta) return c.absoluta
  if (c.estado === 'sin_carpeta') throw new Error('El proyecto no tiene carpeta')
  throw new Error(c.estado === 'archivado' ? 'La carpeta está archivada fuera de DMM OS' : 'La carpeta está No disponible')
}

/** Pending and paid Ingresos of the Proyecto, before IVA. */
function cobros(db: Db, id: number) {
  const suyos = db.select({ estado: ingresos.estado, subtotal: ingresos.subtotal }).from(ingresos).where(eq(ingresos.proyectoId, id)).all()
  const suma = (estado: string) => suyos.filter((i) => i.estado === estado).reduce((s, i) => s + i.subtotal, 0)
  return { porCobrar: suma('pendiente'), cobrado: suma('pagado'), pendientes: suyos.some((i) => i.estado === 'pendiente') }
}

export function fichaProyecto(db: Db, root: string, id: number): FichaProyecto {
  const p = leer(db, id)
  const contacto = p.contactoId === null ? undefined : db.select({ nombre: contactos.nombre }).from(contactos).where(eq(contactos.id, p.contactoId)).get()
  const cotizacion = p.cotizacionId === null ? undefined : db.select().from(cotizaciones).where(eq(cotizaciones.id, p.cotizacionId)).get()
  const { porCobrar, cobrado, pendientes } = cobros(db, id)
  const acciones = (Object.keys(PERMITIDA_EN) as AccionProyecto[]).filter(
    (a) => PERMITIDA_EN[a].includes(p.estado) && !(a === 'completar' && pendientes)
  )
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
    acciones
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
  const actual = leer(db, p.id)
  exigir('editar', actual.estado, 'Un proyecto cancelado no se edita')
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
  exigir('pausar', leer(db, id).estado, 'Solo un proyecto en curso se puede pausar')
  return cambiarEstado(db, root, id, 'pausado')
}

export function reanudarProyecto(db: Db, root: string, id: number): FichaProyecto {
  exigir('reanudar', leer(db, id).estado, 'Solo un proyecto pausado se puede reanudar')
  return cambiarEstado(db, root, id, 'en_curso')
}

/** A Proyecto is only completed once fully paid; delivered but unpaid it stays En curso. */
export function completarProyecto(db: Db, root: string, id: number, hoy: string): FichaProyecto {
  exigir('completar', leer(db, id).estado, 'Solo un proyecto en curso o pausado se puede completar')
  if (cobros(db, id).pendientes) throw new Error('El proyecto se completa hasta que esté pagado por completo')
  db.update(proyectos).set({ estado: 'completado', fechaFin: hoy }).where(eq(proyectos.id, id)).run()
  return fichaProyecto(db, root, id)
}

/** Cancels the Proyecto and the Cotización it came from (Cancelación con pagos). */
export function cancelarProyecto(db: Db, root: string, id: number, hoy: string): FichaProyecto {
  exigir('cancelar', leer(db, id).estado, 'Solo un proyecto en curso o pausado se puede cancelar')
  cancelar(db, 'proyecto', id)
  db.update(proyectos).set({ fechaFin: hoy }).where(eq(proyectos.id, id)).run()
  return fichaProyecto(db, root, id)
}

/**
 * Borrar vs cancelar: a Proyecto with nothing linked is deleted with its recorded locations;
 * its folder stays on disk. Anything linked refuses it, and nothing is removed.
 */
export function borrarProyecto(db: Db, id: number): void {
  exigir('borrar', leer(db, id).estado, 'Este proyecto no se puede borrar')
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
    .map(({ p, contacto }) => ({
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
      carpeta: carpeta(db, root, p.id)
    }))
  const conteo = Object.fromEntries(ESTADOS_PROYECTO.map((e) => [e, 0])) as Record<EstadoProyecto, number>
  const porCategoria = Object.fromEntries(CATEGORIAS.map((c) => [c, 0])) as Record<Categoria, number>
  for (const f of filas) {
    conteo[f.estado]++
    porCategoria[f.categoria]++
  }
  return { proyectos: filas, conteo, porCategoria }
}

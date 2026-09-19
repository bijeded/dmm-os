import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from './db'
import { tareas } from './db/schema'
import { sumarDias } from '../shared/fechas'
import type { ListaTareas } from '../shared/dominio'

/** How long a done task stays in view. */
const DIAS_HECHAS = 30

export function listarTareas(db: Db, hoy: string): ListaTareas {
  const todas = db
    .select({ id: tareas.id, texto: tareas.texto, fechaRegistro: tareas.fechaRegistro, fechaHecha: tareas.fechaHecha })
    .from(tareas)
    .all()
  const desde = sumarDias(hoy, -DIAS_HECHAS)
  return {
    pendientes: todas.filter((t) => t.fechaHecha === null).sort((a, b) => a.fechaRegistro.localeCompare(b.fechaRegistro) || a.id - b.id),
    hechas: todas
      .filter((t) => t.fechaHecha !== null && t.fechaHecha >= desde)
      .sort((a, b) => b.fechaHecha!.localeCompare(a.fechaHecha!) || b.id - a.id),
    dias: DIAS_HECHAS
  }
}

export function agregarTarea(db: Db, texto: string, hoy: string): ListaTareas {
  const limpio = texto.trim()
  if (!limpio) throw new Error('La tarea necesita texto')
  db.insert(tareas).values({ texto: limpio, fechaRegistro: hoy }).run()
  return listarTareas(db, hoy)
}

/** Marks it done today; a task already done keeps its date. */
export function completarTarea(db: Db, id: number, hoy: string): ListaTareas {
  if (!db.select({ id: tareas.id }).from(tareas).where(eq(tareas.id, id)).get()) throw new Error('No existe la tarea')
  db.update(tareas).set({ fechaHecha: hoy }).where(and(eq(tareas.id, id), isNull(tareas.fechaHecha))).run()
  return listarTareas(db, hoy)
}

export function borrarTarea(db: Db, id: number, hoy: string): ListaTareas {
  db.delete(tareas).where(eq(tareas.id, id)).run()
  return listarTareas(db, hoy)
}

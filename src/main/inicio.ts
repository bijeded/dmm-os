import type { Db } from './db'
import { proyectoEnCurso } from './ciclo-proyecto'
import { cotizacionAbierta, expirarCotizaciones, listarCotizaciones } from './cotizar'
import { resumenFinanzas } from './finanzas'
import { listarProyectos } from './proyectos'
import { listarTareas } from './tareas'
import type { ResumenInicio } from '../shared/dominio'

/** What Inicio shows, from the same reads as Finanzas, Proyectos, Cotizaciones and Tareas. */
export function resumenInicio(db: Db, root: string, hoy: string, diasVencida: number): ResumenInicio {
  expirarCotizaciones(db, hoy)
  return {
    finanzas: resumenFinanzas(db, 'mes', hoy, diasVencida),
    proyectos: listarProyectos(db, root).proyectos.filter((p) => proyectoEnCurso(p.estado)),
    cotizaciones: listarCotizaciones(db).cotizaciones.filter((c) => cotizacionAbierta(c.estado)),
    tareas: listarTareas(db, hoy)
  }
}

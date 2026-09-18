import { readdirSync, type Dirent } from 'node:fs'
import { join, posix } from 'node:path'
import type { LogCarpetas } from '../../shared/dominio'
import { leerNombreArchivo } from '../cotizaciones'
import type { Db } from '../db'
import { hoy as hoyLocal } from '../../shared/fechas'
import { carpetaDeProyectos, rutaDeProyecto, type TipoCarpetaProyecto } from '../paths'
import {
  importarCarpetaProyecto,
  importarCotizacion,
  marcarHddNoDisponible,
  proyectosDeCotizacionesAceptadas,
  resolverContacto,
  type Aportes
} from './carpetas'

/**
 * The rescan: reads `Cotizaciones/`, `Clientes/`, `Proyectos/` and `Archivo/Proyectos/` into
 * the database, with the external HDD as a secondary source. Every import is keyed (Folio for
 * a Cotización, Nombre canónico for a Contacto or Proyecto), so running it again changes
 * nothing. A folder that cannot be read is No disponible, never empty.
 */

/**
 * The visible entries of `rutaRelativa` that `quiere` accepts, by name. `null` means the
 * folder itself could not be read: No disponible, not empty.
 */
function entradas(root: string, rutaRelativa: string, quiere: (e: Dirent) => boolean): string[] | null {
  let entries: Dirent[]
  try {
    entries = readdirSync(join(root, rutaRelativa), { withFileTypes: true })
  } catch {
    return null
  }
  return entries.filter((e) => quiere(e) && !e.name.startsWith('.')).map((e) => e.name)
}

const subcarpetas = (root: string, ruta: string) => entradas(root, ruta, (e) => e.isDirectory())
const archivos = (root: string, ruta: string) => entradas(root, ruta, (e) => e.isFile())

function logVacio(): LogCarpetas {
  return {
    cotizaciones: { importadas: 0, duplicadas: 0 },
    contactos: { creados: 0 },
    proyectos: { creados: 0, actualizados: 0 },
    proyectosSinCarpeta: 0,
    sugerencias: 0,
    hddConectado: false,
    errores: [],
    noDisponibles: []
  }
}

/** A Contacto or Sugerencia may come from any file or folder, so each adds its share here. */
function sumar(log: LogCarpetas, aportes: Aportes): void {
  log.contactos.creados += aportes.contactosCreados
  log.sugerencias += aportes.sugerencias
}

/**
 * `hddRoot` is the external HDD, organised exactly like the main root. When it is absent its
 * Proyectos stay in the database and their locations become No disponible.
 */
export function escanearCarpetas(db: Db, root: string, hddRoot?: string, hoy = hoyLocal()): LogCarpetas {
  const log = logVacio()

  cotizacionesDeDisco(db, root, log)
  contactosDeDisco(db, root, log)
  proyectosDeDisco(db, root, 'proyectos', log, hoy)
  proyectosDeDisco(db, root, 'archivo', log, hoy)

  if (hddRoot) {
    const encontrados = proyectosDeDisco(db, hddRoot, 'hdd_externo', log, hoy)
    log.hddConectado = encontrados !== null
    if (!log.hddConectado) marcarHddNoDisponible(db)
  }

  const sinCarpeta = proyectosDeCotizacionesAceptadas(db)
  log.proyectosSinCarpeta = sinCarpeta.proyectos
  log.sugerencias += sinCarpeta.sugerencias
  return log
}

/** `Cotizaciones/<year>/DMM - <folio> - <Nombre>.pdf`, every year the folder holds. */
function cotizacionesDeDisco(db: Db, root: string, log: LogCarpetas): void {
  const anios = subcarpetas(root, 'Cotizaciones')
  if (anios === null) {
    log.noDisponibles.push('Cotizaciones')
    return
  }
  for (const anio of anios) {
    const carpeta = posix.join('Cotizaciones', anio)
    for (const archivo of archivos(root, carpeta) ?? []) {
      const nombre = leerNombreArchivo(archivo)
      if (!nombre) continue
      try {
        const r = importarCotizacion(db, {
          ...nombre,
          anio: Number(anio) || new Date().getFullYear(),
          rutaRelativa: posix.join(carpeta, archivo)
        })
        if (r.resultado === 'importado') log.cotizaciones.importadas++
        else log.cotizaciones.duplicadas++
        sumar(log, r)
      } catch (e) {
        log.errores.push({ archivo: posix.join(carpeta, archivo), error: mensaje(e) })
      }
    }
  }
}

/** A folder under `Clientes/` is a Contacto, whether or not it ever had a Cotización. */
function contactosDeDisco(db: Db, root: string, log: LogCarpetas): void {
  const nombres = subcarpetas(root, 'Clientes')
  if (nombres === null) {
    log.noDisponibles.push('Clientes')
    return
  }
  for (const nombre of nombres) {
    try {
      // A Cliente folder names a Contacto only; it must not invent a Proyecto for it.
      sumar(log, db.transaction((tx) => resolverContacto(tx, nombre)))
    } catch (e) {
      log.errores.push({ archivo: posix.join('Clientes', nombre), error: mensaje(e) })
    }
  }
}

/** Returns `null` when the folder could not be read at all (No disponible). */
function proyectosDeDisco(
  db: Db,
  root: string,
  tipo: TipoCarpetaProyecto,
  log: LogCarpetas,
  hoy: string
): string[] | null {
  const rutaRelativa = carpetaDeProyectos(tipo)
  const nombres = subcarpetas(root, rutaRelativa)
  if (nombres === null) {
    log.noDisponibles.push(tipo === 'hdd_externo' ? `${rutaRelativa} (HDD externo)` : rutaRelativa)
    return null
  }
  for (const nombre of nombres) {
    try {
      const r = importarCarpetaProyecto(db, {
        nombre,
        tipo,
        rutaRelativa: rutaDeProyecto(tipo, nombre)
      }, hoy)
      if (r.creado) log.proyectos.creados++
      else log.proyectos.actualizados++
      sumar(log, r)
    } catch (e) {
      log.errores.push({ archivo: posix.join(rutaRelativa, nombre), error: mensaje(e) })
    }
  }
  return nombres
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))

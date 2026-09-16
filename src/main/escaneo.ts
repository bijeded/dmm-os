import { readdirSync, type Dirent } from 'node:fs'
import { join, posix } from 'node:path'
import type { LogCarpetas } from '../shared/ipc'
import { leerNombreArchivo } from './cotizaciones'
import type { Db } from './db'
import {
  importarCarpetaProyecto,
  importarCotizacion,
  marcarHddNoDisponible,
  proyectosDeCotizacionesAceptadas,
  resolverContacto,
  type TipoUbicacion
} from './db/carpetas'
import { contactos, sugerenciasImportacion } from './db/schema'

/**
 * The rescan: reads `Cotizaciones/`, `Clientes/`, `Proyectos/` and `Archivo/Proyectos/` into
 * the database, with the external HDD as a secondary source. Every import is keyed (Folio for
 * a Cotización, Nombre canónico for a Contacto or Proyecto), so running it again changes
 * nothing. A folder that cannot be read is No disponible, never empty.
 */

/** Direct subfolders of `rutaRelativa`; `null` means the folder itself could not be read. */
function subcarpetas(root: string, rutaRelativa: string): string[] | null {
  let entries: Dirent[]
  try {
    entries = readdirSync(join(root, rutaRelativa), { withFileTypes: true })
  } catch {
    return null
  }
  return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name)
}

function archivos(root: string, rutaRelativa: string): string[] | null {
  let entries: Dirent[]
  try {
    entries = readdirSync(join(root, rutaRelativa), { withFileTypes: true })
  } catch {
    return null
  }
  return entries.filter((e) => e.isFile() && !e.name.startsWith('.')).map((e) => e.name)
}

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

const cuentaSugerencias = (db: Db) => db.select().from(sugerenciasImportacion).all().length
const cuentaContactos = (db: Db) => db.select().from(contactos).all().length

/**
 * `hddRoot` is the external HDD, organised exactly like the main root. When it is absent its
 * Proyectos stay in the database and their locations become No disponible.
 */
export function escanearCarpetas(db: Db, root: string, hddRoot?: string): LogCarpetas {
  const log = logVacio()
  const sugerenciasAntes = cuentaSugerencias(db)
  // A Contacto is created wherever its name first turns up — a quote, a folder, either root —
  // so the run's total is counted here rather than at any one of those places.
  const contactosAntes = cuentaContactos(db)

  cotizacionesDeDisco(db, root, log)
  contactosDeDisco(db, root, log)
  proyectosDeDisco(db, root, 'Proyectos', 'proyectos', log)
  proyectosDeDisco(db, root, posix.join('Archivo', 'Proyectos'), 'archivo', log)

  if (hddRoot) {
    const encontrados = proyectosDeDisco(db, hddRoot, 'Proyectos', 'hdd_externo', log)
    log.hddConectado = encontrados !== null
    if (!log.hddConectado) marcarHddNoDisponible(db)
  }

  log.proyectosSinCarpeta = proyectosDeCotizacionesAceptadas(db).length
  log.sugerencias = cuentaSugerencias(db) - sugerenciasAntes
  log.contactos.creados = cuentaContactos(db) - contactosAntes
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
      resolverContacto(db, nombre)
    } catch (e) {
      log.errores.push({ archivo: posix.join('Clientes', nombre), error: mensaje(e) })
    }
  }
}

/** Returns `null` when the folder could not be read at all (No disponible). */
function proyectosDeDisco(
  db: Db,
  root: string,
  rutaRelativa: string,
  tipo: TipoUbicacion,
  log: LogCarpetas
): string[] | null {
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
        rutaRelativa: posix.join(rutaRelativa, nombre)
      })
      if (r.creado) log.proyectos.creados++
      else log.proyectos.actualizados++
    } catch (e) {
      log.errores.push({ archivo: posix.join(rutaRelativa, nombre), error: mensaje(e) })
    }
  }
  return nombres
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))

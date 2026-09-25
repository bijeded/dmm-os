import { readdirSync, readFileSync, type Dirent } from 'node:fs'
import { join, posix } from 'node:path'
import { inArray } from 'drizzle-orm'
import type { LogCarpetas, OrigenImportado } from '../../shared/dominio'
import { leerNombreArchivo } from '../cotizaciones'
import type { Db } from '../db'
import { contactos, proyectos } from '../db/schema'
import { hoy as hoyLocal } from '../../shared/fechas'
import { carpetaDeProyectos, rutaDeProyecto, type TipoCarpetaProyecto } from '../paths'
import {
  contactoDeCarpetaCliente,
  importarCarpetaProyecto,
  importarCotizacion,
  marcarHddNoDisponible,
  proyectosDeCotizacionesAceptadas,
  type Aportes
} from './carpetas'
import { esErrorMapa, leerMapa, mapaVacio, RUTA_MAPA, type Mapa } from './mapa'
import { asignarRfcs } from './rfcs'

/**
 * The rescan: reads `Cotizaciones/`, `Clientes/`, `Proyectos/` and `Archivo/Proyectos/` into
 * the database, with the external HDD as a secondary source. Every import is keyed (Folio for
 * a Cotización, Nombre canónico for a Contacto or Proyecto), so running it again changes
 * nothing. A folder that cannot be read is No disponible, never empty. The Mapa de nombres
 * decides what a name on disk means the first time it is imported.
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
    noDisponibles: [],
    mapa: 'ausente',
    filasMapa: [],
    subcarpetasSinProyecto: [],
    nuevos: { contactos: [], proyectos: [], rfcs: [] }
  }
}

/** One run: its log, its map, and the ids of what it created, named once the run is over. */
interface Corrida {
  log: LogCarpetas
  mapa: Mapa
  contactos: { id: number; origen: OrigenImportado }[]
  proyectos: { id: number; origen: OrigenImportado }[]
}

/** A Contacto or Sugerencia may come from any file or folder, so each adds its share here. */
function sumar(corrida: Corrida, aportes: Aportes, origen: OrigenImportado): void {
  corrida.log.contactos.creados += aportes.contactosCreados.length
  corrida.log.sugerencias += aportes.sugerencias
  for (const id of aportes.contactosCreados) corrida.contactos.push({ id, origen })
}

/**
 * The Mapa de nombres, or `null` when it exists but cannot be used: then the scan imports
 * nothing rather than import without it.
 */
export function leerMapaDe(root: string, log: Pick<LogCarpetas, 'mapa'>): Mapa | null {
  let texto: string
  try {
    texto = readFileSync(join(root, RUTA_MAPA), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      log.mapa = 'ausente'
      return mapaVacio()
    }
    log.mapa = { error: `No se pudo leer ${RUTA_MAPA}: ${mensaje(e)}` }
    return null
  }
  const mapa = leerMapa(texto)
  if (esErrorMapa(mapa)) {
    log.mapa = mapa
    return null
  }
  log.mapa = 'leido'
  return mapa
}

/**
 * `hddRoot` is the external HDD, organised exactly like the main root. When it is absent its
 * Proyectos stay in the database and their locations become No disponible.
 */
export function escanearCarpetas(db: Db, root: string, hddRoot?: string, hoy = hoyLocal()): LogCarpetas {
  const log = logVacio()
  const mapa = leerMapaDe(root, log)
  if (!mapa) return log
  const corrida: Corrida = { log, mapa, contactos: [], proyectos: [] }

  cotizacionesDeDisco(db, root, corrida, 'antiguo')
  contactosDeDisco(db, root, corrida)
  proyectosDeDisco(db, root, 'proyectos', corrida, hoy)
  proyectosDeDisco(db, root, 'archivo', corrida, hoy)

  if (hddRoot) {
    const encontrados = proyectosDeDisco(db, hddRoot, 'hdd_externo', corrida, hoy)
    log.hddConectado = encontrados !== null
    if (!log.hddConectado) marcarHddNoDisponible(db)
  }

  // A new-format quote names its Proyecto, so it waits until every folder is known.
  cotizacionesDeDisco(db, root, corrida, 'nuevo')
  const sinCarpeta = proyectosDeCotizacionesAceptadas(db, mapa)
  log.proyectosSinCarpeta = sinCarpeta.proyectos.length
  log.sugerencias += sinCarpeta.sugerencias
  for (const id of sinCarpeta.proyectos) corrida.proyectos.push({ id, origen: 'cotizacion' })

  // Last, so a row's name may have been found by any pass.
  const rfcs = asignarRfcs(db, mapa)
  sumar(corrida, { contactosCreados: rfcs.contactosCreados, sugerencias: 0 }, 'mapa')

  log.filasMapa = [
    ...mapa.descartadas,
    ...mapa.sinUso().map((f) => ({ linea: f.linea, problema: 'sin uso' as const, enDisco: f.enDisco ?? '' })),
    ...rfcs.problemas
  ].sort((a, b) => a.linea - b.linea)
  nombrarNuevos(db, corrida, rfcs.asignados)
  return log
}

/**
 * Names are read once the run is over: a later file may have renamed a Contacto to a better
 * spelling after it was created.
 */
function nombrarNuevos(db: Db, corrida: Corrida, rfcs: { contactoId: number; rfc: string }[]): void {
  const ids = [...corrida.contactos.map((c) => c.id), ...rfcs.map((r) => r.contactoId)]
  const proyectoIds = corrida.proyectos.map((p) => p.id)
  const leidos = proyectoIds.length > 0 ? db.select().from(proyectos).where(inArray(proyectos.id, proyectoIds)).all() : []
  ids.push(...leidos.flatMap((p) => (p.contactoId === null ? [] : [p.contactoId])))
  const nombres = new Map(
    (ids.length > 0 ? db.select().from(contactos).where(inArray(contactos.id, ids)).all() : []).map((c) => [c.id, c.nombre])
  )
  const proyectoDe = new Map(leidos.map((p) => [p.id, p]))

  corrida.log.nuevos = {
    contactos: corrida.contactos.flatMap(({ id, origen }) => {
      const nombre = nombres.get(id)
      return nombre === undefined ? [] : [{ nombre, origen }]
    }),
    proyectos: corrida.proyectos.flatMap(({ id, origen }) => {
      const p = proyectoDe.get(id)
      return p ? [{ nombre: p.nombre, contacto: (p.contactoId !== null && nombres.get(p.contactoId)) || '', origen }] : []
    }),
    rfcs: rfcs.map(({ contactoId, rfc }) => ({ contacto: nombres.get(contactoId) ?? '', rfc }))
  }
}

/** `Cotizaciones/<year>/DMM - <folio> - <Nombre>.pdf`, every year the folder holds. */
function cotizacionesDeDisco(db: Db, root: string, corrida: Corrida, formato: 'antiguo' | 'nuevo'): void {
  const { log } = corrida
  const anios = subcarpetas(root, 'Cotizaciones')
  if (anios === null) {
    if (formato === 'antiguo') log.noDisponibles.push('Cotizaciones')
    return
  }
  for (const anio of anios) {
    const carpeta = posix.join('Cotizaciones', anio)
    for (const archivo of archivos(root, carpeta) ?? []) {
      const nombre = leerNombreArchivo(archivo)
      // Only the new format carries a date.
      if (!nombre || (nombre.fecha === null) !== (formato === 'antiguo')) continue
      try {
        const r = importarCotizacion(
          db,
          {
            ...nombre,
            anio: Number(anio) || new Date().getFullYear(),
            rutaRelativa: posix.join(carpeta, archivo)
          },
          corrida.mapa
        )
        if (r.resultado === 'importado') log.cotizaciones.importadas++
        else log.cotizaciones.duplicadas++
        sumar(corrida, r, 'cotizacion')
      } catch (e) {
        log.errores.push({ archivo: posix.join(carpeta, archivo), error: mensaje(e) })
      }
    }
  }
}

/**
 * A folder under `Clientes/` is a Contacto, whether or not it ever had a Cotización. The map
 * may name its Contacto; a row's Proyecto and Cliente final mean nothing for a Clientes folder.
 * The map file itself sits in `Clientes/` and is never read as one: only folders are.
 */
function contactosDeDisco(db: Db, root: string, corrida: Corrida): void {
  const nombres = subcarpetas(root, 'Clientes')
  if (nombres === null) {
    corrida.log.noDisponibles.push('Clientes')
    return
  }
  for (const nombre of nombres) {
    try {
      const { contactosCreados, sugerencias } = db.transaction((tx) => contactoDeCarpetaCliente(tx, corrida.mapa, nombre))
      sumar(corrida, { contactosCreados, sugerencias }, 'clientes')
    } catch (e) {
      corrida.log.errores.push({ archivo: posix.join('Clientes', nombre), error: mensaje(e) })
    }
  }
}

/**
 * Returns `null` when the folder could not be read at all (No disponible). A folder whose
 * subfolders the map declares is not a Proyecto itself: each declared subfolder is, and the
 * others are listed, not imported.
 */
function proyectosDeDisco(
  db: Db,
  root: string,
  tipo: TipoCarpetaProyecto,
  corrida: Corrida,
  hoy: string
): string[] | null {
  const { log, mapa } = corrida
  const rutaRelativa = carpetaDeProyectos(tipo)
  const enHdd = (ruta: string) => (tipo === 'hdd_externo' ? `${ruta} (HDD externo)` : ruta)
  const nombres = subcarpetas(root, rutaRelativa)
  if (nombres === null) {
    log.noDisponibles.push(enHdd(rutaRelativa))
    return null
  }

  const importar = (nombre: string) => {
    try {
      const r = importarCarpetaProyecto(db, { nombre, tipo, rutaRelativa: rutaDeProyecto(tipo, nombre) }, hoy, mapa)
      if (r.creado) {
        log.proyectos.creados++
        corrida.proyectos.push({ id: r.proyectoId, origen: 'proyectos' })
      } else log.proyectos.actualizados++
      sumar(corrida, r, 'proyectos')
    } catch (e) {
      log.errores.push({ archivo: posix.join(rutaRelativa, nombre), error: mensaje(e) })
    }
  }

  for (const nombre of nombres) {
    if (mapa.subcarpetas(nombre).length === 0) {
      importar(nombre)
      continue
    }
    const subs = subcarpetas(root, posix.join(rutaRelativa, nombre))
    if (subs === null) {
      log.noDisponibles.push(enHdd(posix.join(rutaRelativa, nombre)))
      continue
    }
    for (const sub of subs) {
      const declarada = `${nombre}/${sub}`
      if (mapa.consultar(declarada)) importar(declarada)
      else log.subcarpetasSinProyecto.push(enHdd(posix.join(rutaRelativa, declarada)))
    }
  }
  return nombres
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))

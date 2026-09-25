import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { count, eq, inArray, isNotNull, isNull, type SQL } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { Bloqueo, LogCarpetas, RegistroAMano, ResultadoReimportar } from '../../shared/dominio'
import type { Db } from '../db'
import {
  contactos,
  costos,
  cotizaciones,
  definicionesCosto,
  definicionesIngreso,
  ingresos,
  proyectos,
  sugerenciasImportacion,
  ubicacionesArchivo
} from '../db/schema'
import { carpetaDeProyectos } from '../paths'
import { escanearCarpetas, leerMapaDe } from './escaneo'
import { importarFacturas } from './facturas'

/**
 * Reimportar desde cero: remove every record the Importación made, then run the folder scan and
 * the Facturas run on the emptied ledger, so the current Mapa de nombres and importers reach
 * records already imported. It is for the setup phase: anything made by hand refuses it.
 */

/** A transaction, which reads and writes exactly like the database itself. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export interface Entorno {
  root: string
  /** The external HDD as set up in Configuración, if any. */
  hddRoot?: string
  hoy: string
  /** Takes the Respaldo *antes de reimportar*; if it throws, nothing is removed. */
  respaldar: () => void
}

/** Where each kind of hand-made record lives, and what marks a row as made by hand. */
const A_MANO: [RegistroAMano, SQLiteTable, SQL | undefined][] = [
  ['contacto', contactos, eq(contactos.importado, false)],
  ['cotizacion', cotizaciones, eq(cotizaciones.importado, false)],
  ['proyecto', proyectos, eq(proyectos.importado, false)],
  ['ingreso', ingresos, isNull(ingresos.cfdiUuid)],
  ['costo', costos, isNull(costos.cfdiUuid)],
  ['definicion_ingreso', definicionesIngreso, undefined],
  ['definicion_costo', definicionesCosto, undefined]
]

/** Why a reimport would lose data, or nothing when it may go ahead. */
export function bloqueos(db: Db, { root, hddRoot }: Pick<Entorno, 'root' | 'hddRoot'>): Bloqueo[] {
  const r: Bloqueo[] = []
  for (const [registro, tabla, aMano] of A_MANO) {
    const cantidad = db.select({ n: count() }).from(tabla).where(aMano).get()!.n
    if (cantidad > 0) r.push({ motivo: 'a_mano', registro, cantidad })
  }
  const lectura: Pick<LogCarpetas, 'mapa'> = { mapa: 'ausente' }
  if (!leerMapaDe(root, lectura) && typeof lectura.mapa === 'object') r.push({ motivo: 'mapa', error: lectura.mapa.error })
  // Proyectos found only on the HDD would not come back while it is away.
  if (hddRoot && !legible(join(hddRoot, carpetaDeProyectos('hdd_externo')))) r.push({ motivo: 'hdd', ruta: hddRoot })
  return r
}

function legible(carpeta: string): boolean {
  try {
    readdirSync(carpeta)
    return true
  } catch {
    return false
  }
}

/**
 * Removes every record the Importación made, inside the caller's transaction, in foreign-key
 * order. With no Bloqueos, nothing made by hand references what it removes.
 */
export function borrarImportado(tx: Tx | Db): void {
  tx.delete(sugerenciasImportacion).run()
  tx.delete(ingresos).where(isNotNull(ingresos.cfdiUuid)).run()
  tx.delete(costos).where(isNotNull(costos.cfdiUuid)).run()
  const importados = tx.select({ id: proyectos.id }).from(proyectos).where(eq(proyectos.importado, true))
  tx.delete(ubicacionesArchivo).where(inArray(ubicacionesArchivo.proyectoId, importados)).run()
  tx.delete(proyectos).where(eq(proyectos.importado, true)).run()
  tx.delete(cotizaciones).where(eq(cotizaciones.importado, true)).run()
  tx.delete(contactos).where(eq(contactos.importado, true)).run()
}

/**
 * Refused, with its Bloqueos, while anything would be lost. Otherwise takes the Respaldo, removes
 * the imported records in one transaction, and imports again: folders first, then Facturas.
 */
export function reimportar(db: Db, entorno: Entorno): ResultadoReimportar {
  const b = bloqueos(db, entorno)
  if (b.length > 0) return { reimportado: false, bloqueos: b }
  entorno.respaldar()
  db.transaction((tx) => borrarImportado(tx))
  const carpetas = escanearCarpetas(db, entorno.root, entorno.hddRoot, entorno.hoy)
  const facturas = importarFacturas(db, entorno.root)
  return { reimportado: true, carpetas, facturas }
}

import { readdirSync, readFileSync, type Dirent } from 'node:fs'
import { join, posix } from 'node:path'
import type { Db } from './db'
import { importarCfdi, type Direccion } from './db/importacion'
import type { LogImportacion } from '../shared/ipc'

const CARPETAS: Record<Direccion, string> = {
  emitida: posix.join('Facturas', 'Emitidas'),
  recibida: posix.join('Facturas', 'Recibidas')
}

/**
 * Every `.xml` under `rutaRelativa`, at any depth, as paths relative to the DMM OS root.
 * `null` means the folder itself could not be read: No disponible, not empty.
 */
function xmls(root: string, rutaRelativa: string): string[] | null {
  let entries: Dirent[]
  try {
    entries = readdirSync(join(root, rutaRelativa), { withFileTypes: true })
  } catch {
    return null
  }
  return entries.flatMap((e) => {
    const hijo = posix.join(rutaRelativa, e.name)
    if (e.isDirectory()) return xmls(root, hijo) ?? []
    return e.name.toLowerCase().endsWith('.xml') ? [hijo] : []
  })
}

/**
 * Imports every CFDI under `Facturas/Emitidas` and `Facturas/Recibidas`. Re-running it is safe:
 * each CFDI is keyed by its UUID. A folder that cannot be read is reported as No disponible,
 * and a file that cannot be read is reported without stopping the run.
 */
export function importarFacturas(db: Db, root: string): LogImportacion {
  const log: LogImportacion = {
    importados: 0,
    duplicados: 0,
    ignorados: 0,
    sugerencias: 0,
    rfcsDesconocidos: [],
    errores: [],
    noDisponibles: []
  }
  const rfcs = new Set<string>()

  for (const [direccion, carpeta] of Object.entries(CARPETAS) as [Direccion, string][]) {
    const archivos = xmls(root, carpeta)
    if (archivos === null) {
      log.noDisponibles.push(carpeta)
      continue
    }
    for (const archivo of archivos) {
      try {
        const r = importarCfdi(db, readFileSync(join(root, archivo), 'utf8'), direccion)
        if (r.resultado === 'importado') log.importados++
        else if (r.resultado === 'duplicado') log.duplicados++
        else log.ignorados++
        if (r.sugerencia) log.sugerencias++
        if (r.rfcDesconocido) rfcs.add(r.rfcDesconocido)
      } catch (e) {
        log.errores.push({ archivo, error: e instanceof Error ? e.message : String(e) })
      }
    }
  }
  log.rfcsDesconocidos = [...rfcs]
  return log
}

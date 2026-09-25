import { readdirSync, readFileSync, type Dirent } from 'node:fs'
import { join, posix } from 'node:path'
import type { Db } from '../db'
import type { LogImportacion } from '../../shared/dominio'
import { leerXml } from '../cfdi'
import { cancelarFacturas, importarCfdi } from './comprobantes'
import { planearFacturas, type Lectura } from './plan-facturas'

const EMITIDAS = posix.join('Facturas', 'Emitidas')
const RECIBIDAS = posix.join('Facturas', 'Recibidas')

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
 * Imports every CFDI under `Facturas/Emitidas` as Ingresos. The CFDIs under `Facturas/Recibidas`
 * are read and counted, never imported: Costos are entered by hand. Re-running it is safe:
 * each CFDI is keyed by its UUID. Every file is read before anything is imported, because what
 * a CFDI records depends on the others: a Factura cancelada (filed in a cancel folder, or replaced
 * by relación 04) is not imported and cancels what an earlier run imported from it, and complementos
 * de pago date a PPD invoice's Parcialidades. A folder that cannot be read is reported as No
 * disponible; a file that cannot be read is reported without stopping the run; an XML that is not
 * a CFDI at all is only counted.
 */
export function importarFacturas(db: Db, root: string): LogImportacion {
  const log: LogImportacion = {
    importados: 0,
    duplicados: 0,
    ignorados: 0,
    sugerencias: 0,
    rfcsDesconocidos: [],
    ivasInusuales: [],
    errores: [],
    noDisponibles: [],
    cancelados: 0,
    sustituidos: 0,
    recibidas: 0,
    noCfdi: [],
    cambios: { cancelados: [], refechados: [], divididos: [], intactos: [] }
  }

  const lecturas: Lectura[] = []
  for (const carpeta of [EMITIDAS, RECIBIDAS]) {
    const archivos = xmls(root, carpeta)
    if (archivos === null) {
      log.noDisponibles.push(carpeta)
      continue
    }
    for (const archivo of archivos) {
      try {
        const cfdi = leerXml(readFileSync(join(root, archivo), 'utf8'))
        if (!cfdi) log.noCfdi.push(archivo)
        else if (carpeta === RECIBIDAS) log.recibidas++
        else lecturas.push({ archivo, cfdi })
      } catch (e) {
        log.errores.push({ archivo, error: mensaje(e) })
      }
    }
  }

  // A received CFDI can neither cancel nor replace an issued one, and the complementos de pago that
  // date issued invoices are filed under Emitidas, so the plan needs the emitidas alone.
  const plan = planearFacturas(lecturas)
  log.cancelados = plan.omitidas.carpeta
  log.sustituidos = plan.omitidas.sustituida
  const rfcs = new Set<string>()
  for (const { archivo, cfdi } of plan.importar) {
    try {
      const r = importarCfdi(db, cfdi, plan.pagos.get(cfdi.uuid))
      if (r.resultado === 'importado') log.importados++
      else if (r.resultado === 'duplicado') log.duplicados++
      else log.ignorados++
      log.sugerencias += r.sugerencias
      if (r.rfcDesconocido) rfcs.add(r.rfcDesconocido)
      if (r.tasaIvaInusual !== null) log.ivasInusuales.push({ archivo, tasa: r.tasaIvaInusual })
      if (r.cambio?.tipo === 'refechado') log.cambios.refechados.push(r.cambio.detalle)
      if (r.cambio?.tipo === 'dividido') log.cambios.divididos.push(r.cambio.detalle)
      if (r.cambio?.tipo === 'intacto') log.cambios.intactos.push(r.cambio.detalle)
    } catch (e) {
      log.errores.push({ archivo, error: mensaje(e) })
    }
  }
  const { cancelados, intactos } = cancelarFacturas(db, plan.canceladas)
  log.cambios.cancelados = cancelados
  log.cambios.intactos.push(...intactos)
  log.rfcsDesconocidos = [...rfcs]
  return log
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))

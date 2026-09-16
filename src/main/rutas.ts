import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Rutas } from '../shared/ipc'

/**
 * The folders the app reads: the DMM OS root, the external HDD (a secondary source that is
 * usually disconnected) and `Entrada/`, the inbox of loose items waiting for triage. Read per
 * call, so plugging the drive in or dropping a file needs no restart.
 */
export function leerRutas(dmmOsRoot: string, hddRoot?: string): Rutas {
  return {
    dmmOsRoot,
    hddRoot: hddRoot ?? null,
    hddConectado: hddRoot !== undefined && alcanzable(hddRoot),
    entrada: contarEntrada(dmmOsRoot)
  }
}

/** Loose items in `Entrada/`, hidden files apart. `null` means the folder could not be read. */
function contarEntrada(dmmOsRoot: string): number | null {
  try {
    return readdirSync(join(dmmOsRoot, 'Entrada')).filter((n) => !n.startsWith('.')).length
  } catch {
    return null
  }
}

function alcanzable(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

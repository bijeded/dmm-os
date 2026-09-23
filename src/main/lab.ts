import { readdirSync, realpathSync, statSync, type Dirent } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import type { ArchivoLab, CarpetaLab } from '../shared/dominio'
import { toAbsolute, toRelative } from './paths'

/**
 * Lab: a read-only view of `Lab/`, where Claude Desktop output lands. Its subfolders are read per
 * call, so a folder added on disk shows up with no code change. Nothing here writes.
 */

const LAB = 'Lab'

/**
 * The absolute path of `ruta` (a folder or file relative to `Lab/`); refused unless it stays
 * inside, links followed, so a link in Lab can't lead to Vault or anywhere else.
 */
export function rutaEnLab(root: string, ruta: string): string {
  const lab = resolve(root, LAB)
  try {
    const abs = toAbsolute(lab, ruta)
    toRelative(real(lab), real(abs))
    return abs
  } catch (e) {
    throw new Error(`La ruta está fuera de Lab/: ${ruta}`, { cause: e })
  }
}

/** Every subfolder of `Lab/` by name, with how many files it holds; `null` when it can't be read. */
export function carpetasLab(root: string): CarpetaLab[] {
  return entradasVisibles(root, LAB)
    .filter((e) => e.isDirectory())
    .map((e) => ({ nombre: e.name, archivos: contarArchivos(root, e.name) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** The files of one Lab folder (as `carpetasLab` names it), newest first. */
export function archivosLab(root: string, carpeta: string): ArchivoLab[] {
  const dir = rutaEnLab(root, carpeta)
  if (basename(carpeta) !== carpeta || carpeta.startsWith('.')) throw new Error(`${carpeta} no es una carpeta de Lab/`)
  return entradasVisibles(root, join(LAB, carpeta))
    .filter((e) => e.isFile())
    .flatMap((e) => {
      try {
        const { size, mtime } = statSync(join(dir, e.name))
        return [{ nombre: e.name, tipo: extname(e.name).slice(1).toUpperCase(), bytes: size, modificado: mtime.toISOString() }]
      } catch {
        return [] // gone since the folder was read
      }
    })
    .sort((a, b) => b.modificado.localeCompare(a.modificado) || a.nombre.localeCompare(b.nombre, 'es'))
}

function contarArchivos(root: string, carpeta: string): number | null {
  try {
    return entradasVisibles(root, join(LAB, carpeta)).filter((f) => f.isFile()).length
  } catch {
    return null
  }
}

/** A folder's entries, hidden ones apart (`ruta` relative to the root), or why it could not be read. */
function entradasVisibles(root: string, ruta: string): Dirent[] {
  try {
    return readdirSync(join(root, ruta), { withFileTypes: true }).filter((e) => !e.name.startsWith('.'))
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new Error(`No se encontró la carpeta ${ruta}/ en ${root}`, { cause: e })
    throw new Error(`No se pudo leer la carpeta ${ruta}/ (${code ?? String(e)})`, { cause: e })
  }
}

/** Where a path really is, links followed; as written when it doesn't exist. */
function real(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

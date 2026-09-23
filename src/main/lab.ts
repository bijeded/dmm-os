import { readdirSync, statSync, type Dirent } from 'node:fs'
import { extname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import type { ArchivoLab, CarpetaLab } from '../shared/dominio'

/**
 * Lab: a read-only view of `Lab/`, where Claude Desktop output lands. Its subfolders are read per
 * call, so a folder added on disk shows up with no code change. Nothing here writes.
 */

const LAB = 'Lab'

/** The absolute path of `ruta` (a folder or file relative to `Lab/`); refused unless it stays inside. */
export function rutaEnLab(root: string, ruta: string): string {
  const lab = resolve(root, LAB)
  const abs = resolve(lab, ruta)
  const rel = relative(lab, abs)
  if (isAbsolute(ruta) || rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`La ruta está fuera de Lab/: ${ruta}`)
  }
  return abs
}

/** Every subfolder of `Lab/` by name, with how many files it holds (hidden ones apart). */
export function carpetasLab(root: string): CarpetaLab[] {
  return leer(root, LAB)
    .filter((e) => e.isDirectory())
    .map((e) => ({ nombre: e.name, archivos: leer(root, posix.join(LAB, e.name)).filter((f) => f.isFile()).length }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** The files of one Lab folder, newest first. Subfolders inside it are not listed. */
export function archivosLab(root: string, carpeta: string): ArchivoLab[] {
  const dir = rutaEnLab(root, carpeta)
  return leer(root, posix.join(LAB, carpeta))
    .filter((e) => e.isFile())
    .map((e) => {
      const { size, mtime } = statSync(join(dir, e.name))
      return { nombre: e.name, tipo: extname(e.name).slice(1).toUpperCase(), bytes: size, modificado: mtime.toISOString() }
    })
    .sort((a, b) => b.modificado.localeCompare(a.modificado) || a.nombre.localeCompare(b.nombre, 'es'))
}

/** A folder's visible entries (`ruta` relative to the root), or why it could not be read. */
function leer(root: string, ruta: string): Dirent[] {
  try {
    return readdirSync(join(root, ruta), { withFileTypes: true }).filter((e) => !e.name.startsWith('.'))
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new Error(`No se encontró la carpeta ${ruta}/ en ${root}`, { cause: e })
    throw new Error(`No se pudo leer la carpeta ${ruta}/ (${code ?? String(e)})`, { cause: e })
  }
}

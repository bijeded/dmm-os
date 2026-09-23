import { closeSync, openSync, readdirSync, readSync, realpathSync, statSync, type Dirent } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import type { ArchivoEnLab, ArchivoLab, CarpetaLab, VistaPreviaLab } from '../shared/dominio'
import { normalizar } from '../shared/formato'
import { toAbsolute, toRelative } from './paths'

/**
 * Lab: a read-only view of `Lab/`, where Claude Desktop output lands. Its subfolders are read per
 * call, so a folder added on disk shows up with no code change. Nothing here writes.
 */

const LAB = 'Lab'

/** How much of a text file a preview shows; the rest is only in the file. */
export const VISTA_PREVIA_BYTES = 64 * 1024

/** The only types Lab previews; anything else only opens in its own app. */
const CON_VISTA_PREVIA = new Set(['.md', '.txt'])

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
  rutaEnLab(root, carpeta)
  if (basename(carpeta) !== carpeta || carpeta.startsWith('.')) throw new Error(`${carpeta} no es una carpeta de Lab/`)
  return archivosDe(root, carpeta).sort(recientes)
}

/**
 * The files in any Lab folder whose name holds `consulta`, ignoring case and accents as the other
 * sections' searches do; newest first. A folder that can't be read is skipped, as its count is.
 */
export function buscarLab(root: string, consulta: string): ArchivoEnLab[] {
  const q = normalizar(consulta.trim())
  if (!q) return []
  return carpetasLab(root)
    .flatMap(({ nombre: carpeta, archivos }) => (archivos === null ? [] : archivosDe(root, carpeta).map((a) => ({ carpeta, ...a }))))
    .filter((a) => normalizar(a.nombre).includes(q))
    .sort(recientes)
}

/** The start of a `.md` or `.txt` file, up to `VISTA_PREVIA_BYTES`; `null` for any other type. */
export function vistaPreviaLab(root: string, ruta: string): VistaPreviaLab | null {
  const abs = rutaEnLab(root, ruta)
  if (!CON_VISTA_PREVIA.has(extname(abs).toLowerCase())) return null
  const fd = openSync(abs, 'r')
  try {
    // One byte past the cap says whether there is more.
    const buf = Buffer.alloc(VISTA_PREVIA_BYTES + 1)
    const leidos = readSync(fd, buf, 0, buf.length, 0)
    const recortado = leidos > VISTA_PREVIA_BYTES
    // The decoder holds back a character cut by the cap instead of garbling it.
    return { texto: new StringDecoder('utf8').write(buf.subarray(0, Math.min(leidos, VISTA_PREVIA_BYTES))), recortado }
  } finally {
    closeSync(fd)
  }
}

/** The files directly in a Lab folder, with no order. */
function archivosDe(root: string, carpeta: string): ArchivoLab[] {
  return entradasVisibles(root, join(LAB, carpeta))
    .filter((e) => e.isFile())
    .flatMap((e) => {
      try {
        const { size, mtime } = statSync(join(root, LAB, carpeta, e.name))
        return [{ nombre: e.name, tipo: extname(e.name).slice(1).toUpperCase(), bytes: size, modificado: mtime.toISOString() }]
      } catch {
        return [] // gone since the folder was read
      }
    })
}

const recientes = (a: ArchivoLab, b: ArchivoLab) => b.modificado.localeCompare(a.modificado) || a.nombre.localeCompare(b.nombre, 'es')

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

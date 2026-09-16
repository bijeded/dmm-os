import { isAbsolute, posix, relative, resolve, sep } from 'node:path'

/** Stored paths are relative to the DMM OS root (ADR 0001). */
export function toRelative(root: string, absolutePath: string): string {
  const rel = relative(resolve(root), resolve(absolutePath))
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Path is outside the DMM OS root: ${absolutePath}`)
  }
  return rel.split(sep).join(posix.sep)
}

export function toAbsolute(root: string, storedPath: string): string {
  if (isAbsolute(storedPath)) throw new Error(`Stored path must be relative: ${storedPath}`)
  const abs = resolve(root, storedPath)
  toRelative(root, abs)
  return abs
}

/** Where each kind of location keeps a Proyecto's folder, relative to its own root. */
const CARPETAS_DE_PROYECTOS = {
  proyectos: 'Proyectos',
  archivo: 'Archivo/Proyectos',
  hdd_externo: 'Proyectos'
} as const

export type TipoCarpetaProyecto = keyof typeof CARPETAS_DE_PROYECTOS

export function carpetaDeProyectos(tipo: TipoCarpetaProyecto): string {
  return CARPETAS_DE_PROYECTOS[tipo]
}

/** The stored path of a Proyecto's folder, whether or not it was ever seen on disk. */
export function rutaDeProyecto(tipo: TipoCarpetaProyecto, nombre: string): string {
  return posix.join(CARPETAS_DE_PROYECTOS[tipo], nombre)
}

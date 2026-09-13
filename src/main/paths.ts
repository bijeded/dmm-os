import { isAbsolute, posix, relative, resolve, sep } from 'node:path'

/** Stored paths are relative to the DMM OS root (ADR 0001). */
export function toRelative(root: string, absolutePath: string): string {
  const rel = relative(resolve(root), resolve(absolutePath))
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
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

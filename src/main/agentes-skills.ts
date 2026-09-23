import { existsSync, readdirSync, readFileSync, type Dirent } from 'node:fs'
import { join, posix } from 'node:path'
import type { Db } from './db'
import { carpetasDeProyectos } from './proyectos'
import type { AgenteOSkill, TipoAgenteSkill } from '../shared/dominio'

/**
 * Agentes y Skills: the agents (`AI/agents/<name>.md`) and skills (`AI/skills/<name>/SKILL.md`)
 * kept in `AI/`, read per call. A Proyecto uses one when its folder, or a folder directly inside
 * it (a code repo such as `App/`), has a copy with the same name under `.claude/`; with no copy
 * the item is en prueba. Read-only: nothing is stored and nothing is written.
 */

const AI = 'AI'
const SKILL = 'SKILL.md'

/** Where a copy of each kind lives under a `.claude/` folder. */
const COPIA: Record<TipoAgenteSkill, (nombre: string) => string> = {
  agente: (nombre) => join('agents', `${nombre}.md`),
  skill: (nombre) => join('skills', nombre)
}

/** Every agent, then every skill, each by name. Refused with why when `AI/` can't be read. */
export function agentesYSkills(db: Db, root: string): AgenteOSkill[] {
  const lista = listar(root)
  const proyectos = carpetasDeProyectos(db, root)
    .map(({ nombre, absoluta }) => ({ nombre, claudes: [absoluta, ...subcarpetas(absoluta)].map((c) => join(c, '.claude')) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return lista.map(({ carpeta, ...item }) => {
    const copia = COPIA[item.tipo](carpeta)
    return { ...item, usadoEn: proyectos.filter((p) => p.claudes.some((c) => existsSync(join(c, copia)))).map((p) => p.nombre) }
  })
}

/** The absolute path of `archivo` (relative to `AI/`); refused unless it is a listed agent's or skill's file. */
export function rutaAgenteOSkill(root: string, archivo: string): string {
  if (!listar(root).some((i) => i.archivo === archivo)) throw new Error(`${archivo} no es un agente ni un skill de AI/`)
  return join(root, AI, archivo)
}

/** What `AI/` holds, each with its file or folder name (`carpeta`), which is what a copy is named. */
function listar(root: string): (Omit<AgenteOSkill, 'usadoEn'> & { carpeta: string })[] {
  const ai = entradas(join(root, AI))
  if (ai === null) throw new Error(`No se encontró la carpeta ${AI}/ en ${root}`)
  const leer = (tipo: TipoAgenteSkill, carpeta: string, archivo: string) => {
    const campos = frontmatter(readFileSync(join(root, AI, archivo), 'utf8'))
    return { tipo, nombre: campos.name || carpeta, descripcion: campos.description || null, archivo, carpeta }
  }
  const agentes = (dir: string) =>
    (entradas(join(root, AI, dir)) ?? [])
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => leer('agente', e.name.slice(0, -'.md'.length), posix.join(dir, e.name)))
  const skills = (dir: string) =>
    (entradas(join(root, AI, dir)) ?? [])
      .filter((e) => e.isDirectory() && (entradas(join(root, AI, dir, e.name)) ?? []).some((f) => f.isFile() && f.name === SKILL))
      .map((e) => leer('skill', e.name, posix.join(dir, e.name, SKILL)))
  return [...ai.filter(esCarpeta('agents')).flatMap((c) => agentes(c.name)), ...ai.filter(esCarpeta('skills')).flatMap((c) => skills(c.name))].sort(
    (a, b) => a.tipo.localeCompare(b.tipo) || a.nombre.localeCompare(b.nombre, 'es')
  )
}

/** `AI/Agents` on disk is `agents`: Finder names folders with a capital. */
const esCarpeta = (nombre: string) => (e: Dirent) => e.isDirectory() && e.name.toLowerCase() === nombre

/** The folders directly in a Proyecto folder; none when it can't be read. */
function subcarpetas(carpeta: string): string[] {
  try {
    return (entradas(carpeta) ?? []).filter((e) => e.isDirectory()).map((e) => join(carpeta, e.name))
  } catch {
    return []
  }
}

/**
 * The top-level `key: value` fields of a Markdown file's frontmatter, as agents and skills write
 * them: plain or quoted on one line, or a `>` / `|` block on the indented lines below.
 */
function frontmatter(texto: string): Record<string, string> {
  const lineas = texto.split(/\r?\n/)
  if (lineas[0]?.trim() !== '---') return {}
  const fin = lineas.indexOf('---', 1)
  const cuerpo = lineas.slice(1, fin === -1 ? undefined : fin)
  const campos: Record<string, string> = {}
  for (let i = 0; i < cuerpo.length; i++) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(cuerpo[i])
    if (!m) continue
    const [, clave, valor] = m
    if (/^[>|][+-]?$/.test(valor)) {
      const bloque: string[] = []
      while (i + 1 < cuerpo.length && (/^\s/.test(cuerpo[i + 1]) || cuerpo[i + 1] === '')) bloque.push(cuerpo[++i].trim())
      campos[clave] = bloque.join(valor.startsWith('>') ? ' ' : '\n').trim()
    } else {
      campos[clave] = sinComillas(valor.trim())
    }
  }
  return campos
}

const sinComillas = (v: string) => (/^(["']).*\1$/.test(v) ? v.slice(1, -1) : v)

/** A folder's entries, hidden ones apart; `null` when it doesn't exist. */
function entradas(ruta: string): Dirent[] | null {
  try {
    return readdirSync(ruta, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'))
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return null
    throw new Error(`No se pudo leer la carpeta ${ruta} (${code ?? String(e)})`, { cause: e })
  }
}

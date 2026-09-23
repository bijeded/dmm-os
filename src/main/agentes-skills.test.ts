import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { agentesYSkills, rutaAgenteOSkill } from './agentes-skills'
import { proyectos, ubicacionesArchivo } from './db/schema'
import { db, reiniciarDb } from './db/test-db'

let root: string

const archivo = (ruta: string, contenido = '') => {
  mkdirSync(dirname(join(root, ruta)), { recursive: true })
  writeFileSync(join(root, ruta), contenido)
}

/** A personal Proyecto whose folder is `ruta`, on disk or not. */
const proyecto = (nombre: string, ruta: string, tipo: 'proyectos' | 'archivo' = 'proyectos') => {
  const { id } = db.insert(proyectos).values({ nombre, categoria: 'ai', etiqueta: 'personal' }).returning().get()
  db.insert(ubicacionesArchivo).values({ proyectoId: id, tipo, rutaRelativa: ruta }).run()
}

const frontmatter = (campos: string) => `---\n${campos}\n---\n\n# Cuerpo\n`

beforeEach(() => {
  reiniciarDb()
  root = mkdtempSync(join(tmpdir(), 'dmm-ai-'))
  archivo('AI/agents/code-reviewer.md', frontmatter('name: code-reviewer\ndescription: Revisa cambios antes de publicarlos.'))
  archivo('AI/skills/newsletter-writer/SKILL.md', frontmatter('name: newsletter-writer\ndescription: "Escribe el boletín: tono DMM."'))
  archivo('AI/skills/newsletter-writer/references/tono.md', '# Tono')
})

describe('Agentes y Skills', () => {
  it('lists agents and skills with their type, name and description', () => {
    expect(agentesYSkills(db, root)).toEqual([
      { tipo: 'agente', nombre: 'code-reviewer', descripcion: 'Revisa cambios antes de publicarlos.', archivo: 'agents/code-reviewer.md', usadoEn: [] },
      { tipo: 'skill', nombre: 'newsletter-writer', descripcion: 'Escribe el boletín: tono DMM.', archivo: 'skills/newsletter-writer/SKILL.md', usadoEn: [] }
    ])
  })

  it('reads a description written over several lines, and names an item by its file when its frontmatter has no name', () => {
    archivo('AI/agents/traductor.md', frontmatter('description: >-\n  Traduce cotizaciones\n  al inglés.\nmodel: sonnet'))
    archivo('AI/agents/notas.txt', 'no es un agente')
    expect(agentesYSkills(db, root).find((a) => a.nombre === 'traductor')).toEqual({
      tipo: 'agente',
      nombre: 'traductor',
      descripcion: 'Traduce cotizaciones al inglés.',
      archivo: 'agents/traductor.md',
      usadoEn: []
    })
  })

  it('reads AI/Agents and AI/Skills as Finder names them', () => {
    root = mkdtempSync(join(tmpdir(), 'dmm-ai-'))
    archivo('AI/Agents/code-reviewer.md', frontmatter('name: code-reviewer'))
    archivo('AI/Skills/design-md-planner/SKILL.md', frontmatter('name: design-md-planner'))
    expect(agentesYSkills(db, root).map((a) => a.archivo)).toEqual(['Agents/code-reviewer.md', 'Skills/design-md-planner/SKILL.md'])
  })

  it('lists as Usado en the Proyectos whose folder holds a copy with the same name', () => {
    proyecto('Netdeckr', 'Proyectos/Netdeckr')
    archivo('Proyectos/Netdeckr/.claude/agents/code-reviewer.md')
    archivo('Proyectos/Netdeckr/.claude/skills/newsletter-writer/SKILL.md')
    // A code repo inside the Proyecto keeps its own .claude.
    proyecto('Aura', 'Proyectos/Aura Maristany')
    archivo('Proyectos/Aura Maristany/App/.claude/agents/code-reviewer.md')
    // Archived to Archivo/, still on disk.
    proyecto('Versa', 'Archivo/Proyectos/Versa', 'archivo')
    archivo('Archivo/Proyectos/Versa/.claude/agents/code-reviewer.md')
    // Another agent's copy, and a Proyecto whose folder isn't on disk.
    proyecto('Sonríeme', 'Proyectos/Sonríeme')
    archivo('Proyectos/Sonríeme/.claude/agents/otro.md')
    proyecto('Hospital Jardín', 'Proyectos/Hospital Jardín')

    expect(agentesYSkills(db, root).map((a) => [a.nombre, a.usadoEn])).toEqual([
      ['code-reviewer', ['Aura', 'Netdeckr', 'Versa']],
      ['newsletter-writer', ['Netdeckr']]
    ])
  })

  it('leaves an item no Proyecto has a copy of en prueba', () => {
    proyecto('Netdeckr', 'Proyectos/Netdeckr')
    archivo('Proyectos/Netdeckr/.claude/agents/code-reviewer.md')
    expect(agentesYSkills(db, root).find((a) => a.tipo === 'skill')?.usadoEn).toEqual([])
  })

  it('says so when AI/ is missing', () => {
    expect(() => agentesYSkills(db, mkdtempSync(join(tmpdir(), 'dmm-sin-ai-')))).toThrow(/No se encontró la carpeta AI/)
  })
})

describe('Ver archivo', () => {
  it('opens the file of a listed agent or skill', () => {
    expect(rutaAgenteOSkill(root, 'skills/newsletter-writer/SKILL.md')).toBe(join(root, 'AI/skills/newsletter-writer/SKILL.md'))
  })

  it('refuses any file that is not a listed agent or skill', () => {
    expect(() => rutaAgenteOSkill(root, 'skills/newsletter-writer/references/tono.md')).toThrow(/no es un agente ni un skill/)
    expect(() => rutaAgenteOSkill(root, '../Vault/dmm.db')).toThrow(/no es un agente ni un skill/)
  })
})

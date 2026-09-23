import { chmodSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { archivosLab, carpetasLab, rutaEnLab } from './lab'

let root: string
let lab: string

const archivo = (ruta: string, contenido: string, modificado: string) => {
  writeFileSync(join(lab, ruta), contenido)
  const t = new Date(modificado)
  utimesSync(join(lab, ruta), t, t)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dmm-lab-'))
  lab = join(root, 'Lab')
  mkdirSync(join(lab, 'Benchmarks'), { recursive: true })
  mkdirSync(join(lab, 'Design Systems'))
  archivo('Benchmarks/benchmark-landing-hoteles.md', '# Hoteles', '2026-09-09T10:00:00.000Z')
  archivo('Benchmarks/competencia-agencias-cdmx.xlsx', 'xlsx', '2026-08-14T10:00:00.000Z')
  archivo('Benchmarks/benchmark-ecommerce-mezcal.pdf', '%PDF-1.7', '2026-08-28T10:00:00.000Z')
  writeFileSync(join(lab, 'Benchmarks', '.DS_Store'), '')
  writeFileSync(join(lab, 'suelto.md'), '')
})

describe('las carpetas de Lab', () => {
  it('lists every subfolder with its file count, empty ones at 0', () => {
    expect(carpetasLab(root)).toEqual([
      { nombre: 'Benchmarks', archivos: 3 },
      { nombre: 'Design Systems', archivos: 0 }
    ])
  })

  it('shows a folder added on disk on the next read', () => {
    carpetasLab(root)
    mkdirSync(join(lab, 'Newsletter'))
    expect(carpetasLab(root).map((c) => c.nombre)).toEqual(['Benchmarks', 'Design Systems', 'Newsletter'])
  })

  it('says so when Lab/ is missing', () => {
    expect(() => carpetasLab(mkdtempSync(join(tmpdir(), 'dmm-sin-lab-')))).toThrow(/No se encontró la carpeta Lab/)
  })

  it.skipIf(process.getuid?.() === 0)('says so when Lab/ cannot be read', () => {
    chmodSync(lab, 0o000)
    try {
      expect(() => carpetasLab(root)).toThrow(/No se pudo leer la carpeta Lab/)
    } finally {
      chmodSync(lab, 0o755)
    }
  })
})

describe('los archivos de una carpeta de Lab', () => {
  it('lists them newest first with name, type, size and modified date', () => {
    expect(archivosLab(root, 'Benchmarks')).toEqual([
      { nombre: 'benchmark-landing-hoteles.md', tipo: 'MD', bytes: 9, modificado: '2026-09-09T10:00:00.000Z' },
      { nombre: 'benchmark-ecommerce-mezcal.pdf', tipo: 'PDF', bytes: 8, modificado: '2026-08-28T10:00:00.000Z' },
      { nombre: 'competencia-agencias-cdmx.xlsx', tipo: 'XLSX', bytes: 4, modificado: '2026-08-14T10:00:00.000Z' }
    ])
  })

  it('has none in an empty folder', () => {
    expect(archivosLab(root, 'Design Systems')).toEqual([])
  })

  it('refuses a folder outside Lab/', () => {
    expect(() => archivosLab(root, '..')).toThrow(/fuera de Lab/)
    expect(() => archivosLab(root, '../Proyectos')).toThrow(/fuera de Lab/)
  })
})

describe('abrir en Lab', () => {
  it('resolves a folder or a file inside Lab/', () => {
    expect(rutaEnLab(root, 'Benchmarks')).toBe(join(lab, 'Benchmarks'))
    expect(rutaEnLab(root, 'Benchmarks/benchmark-landing-hoteles.md')).toBe(join(lab, 'Benchmarks', 'benchmark-landing-hoteles.md'))
  })

  it('refuses paths outside Lab/', () => {
    for (const ruta of ['', '.', '..', '../Vault/dmm.db', 'Benchmarks/../../Vault', '/etc/passwd']) {
      expect(() => rutaEnLab(root, ruta), ruta).toThrow(/fuera de Lab/)
    }
  })
})

import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { archivosLab, buscarLab, carpetasLab, rutaEnLab, VISTA_PREVIA_BYTES, vistaPreviaLab } from './lab'

let root: string
let lab: string

const archivo = (ruta: string, contenido: string, modificado: string) => {
  writeFileSync(join(lab, ruta), contenido)
  const t = new Date(modificado)
  utimesSync(join(lab, ruta), t, t)
}

/** Temp folders made by the current test, removed after it. */
const temporales: string[] = []
function temporal(prefijo: string) {
  const dir = mkdtempSync(join(tmpdir(), prefijo))
  temporales.push(dir)
  return dir
}
afterEach(() => temporales.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

beforeEach(() => {
  root = temporal('dmm-lab-')
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
    expect(() => carpetasLab(temporal('dmm-sin-lab-'))).toThrow(/No se encontró la carpeta Lab/)
  })

  it.skipIf(process.getuid?.() === 0)('still lists the others when one folder cannot be read', () => {
    chmodSync(join(lab, 'Design Systems'), 0o000)
    try {
      expect(carpetasLab(root)).toEqual([
        { nombre: 'Benchmarks', archivos: 3 },
        { nombre: 'Design Systems', archivos: null }
      ])
    } finally {
      chmodSync(join(lab, 'Design Systems'), 0o755)
    }
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

  it('reads only the folders Lab lists', () => {
    mkdirSync(join(lab, 'Benchmarks', 'viejos'))
    mkdirSync(join(lab, '.oculta'))
    for (const carpeta of ['Benchmarks/viejos', 'Benchmarks/../Design Systems', '.oculta']) {
      expect(() => archivosLab(root, carpeta), carpeta).toThrow(/no es una carpeta de Lab/)
    }
  })
})

describe('abrir en Lab', () => {
  it('resolves a folder or a file inside Lab/', () => {
    expect(rutaEnLab(root, 'Benchmarks')).toBe(join(lab, 'Benchmarks'))
    expect(rutaEnLab(root, 'Benchmarks/benchmark-landing-hoteles.md')).toBe(join(lab, 'Benchmarks', 'benchmark-landing-hoteles.md'))
  })

  it('refuses a link that leads outside Lab/', () => {
    mkdirSync(join(root, 'Vault'))
    writeFileSync(join(root, 'Vault', 'dmm.db'), '')
    symlinkSync(join(root, 'Vault'), join(lab, 'fuga'))
    expect(() => rutaEnLab(root, 'fuga/dmm.db')).toThrow(/fuera de Lab/)
    expect(() => archivosLab(root, 'fuga')).toThrow(/fuera de Lab/)
  })

  it('refuses paths outside Lab/', () => {
    for (const ruta of ['', '.', '..', '../Vault/dmm.db', 'Benchmarks/../../Vault', '/etc/passwd']) {
      expect(() => rutaEnLab(root, ruta), ruta).toThrow(/fuera de Lab/)
    }
  })
})

describe('buscar en Lab', () => {
  beforeEach(() => {
    archivo('Design Systems/sistema-hoteles.txt', 'tokens', '2026-09-15T10:00:00.000Z')
    mkdirSync(join(lab, 'Newsletter'))
    archivo('Newsletter/Boletín Hotelería.md', '', '2026-07-01T10:00:00.000Z')
  })

  it('finds files by name in any Lab folder, newest first, saying where each is', () => {
    expect(buscarLab(root, 'hotel')).toEqual([
      { carpeta: 'Design Systems', nombre: 'sistema-hoteles.txt', tipo: 'TXT', bytes: 6, modificado: '2026-09-15T10:00:00.000Z' },
      { carpeta: 'Benchmarks', nombre: 'benchmark-landing-hoteles.md', tipo: 'MD', bytes: 9, modificado: '2026-09-09T10:00:00.000Z' },
      { carpeta: 'Newsletter', nombre: 'Boletín Hotelería.md', tipo: 'MD', bytes: 0, modificado: '2026-07-01T10:00:00.000Z' }
    ])
  })

  it('ignores case, accents and surrounding spaces, as the other searches do', () => {
    expect(buscarLab(root, '  BOLETIN hoteleria ').map((a) => a.nombre)).toEqual(['Boletín Hotelería.md'])
  })

  it('finds nothing for an empty search, a folder name or a hidden file', () => {
    expect(buscarLab(root, '  ')).toEqual([])
    expect(buscarLab(root, 'Benchmarks')).toEqual([])
    expect(buscarLab(root, 'DS_Store')).toEqual([])
  })

  it.skipIf(process.getuid?.() === 0)('still searches the others when one folder cannot be read', () => {
    chmodSync(join(lab, 'Design Systems'), 0o000)
    try {
      expect(buscarLab(root, 'hotel').map((a) => a.carpeta)).toEqual(['Benchmarks', 'Newsletter'])
    } finally {
      chmodSync(join(lab, 'Design Systems'), 0o755)
    }
  })
})

describe('vista previa en Lab', () => {
  it('shows a .md or .txt file’s text', () => {
    archivo('Benchmarks/notas.TXT', 'línea 1\nlínea 2', '2026-09-01T10:00:00.000Z')
    expect(vistaPreviaLab(root, 'Benchmarks/benchmark-landing-hoteles.md')).toEqual({ texto: '# Hoteles', recortado: false })
    expect(vistaPreviaLab(root, 'Benchmarks/notas.TXT')).toEqual({ texto: 'línea 1\nlínea 2', recortado: false })
  })

  it('caps a long file, never splitting a character', () => {
    archivo('Benchmarks/largo.md', 'a'.repeat(VISTA_PREVIA_BYTES - 1) + 'ñ' + 'resto', '2026-09-01T10:00:00.000Z')
    const vista = vistaPreviaLab(root, 'Benchmarks/largo.md')
    expect(vista).toEqual({ texto: 'a'.repeat(VISTA_PREVIA_BYTES - 1), recortado: true })
  })

  it('has none for other file types', () => {
    expect(vistaPreviaLab(root, 'Benchmarks/benchmark-ecommerce-mezcal.pdf')).toBeNull()
    expect(vistaPreviaLab(root, 'Benchmarks/competencia-agencias-cdmx.xlsx')).toBeNull()
  })

  it('refuses paths outside Lab/', () => {
    writeFileSync(join(root, 'secreto.md'), 'no')
    expect(() => vistaPreviaLab(root, '../secreto.md')).toThrow(/fuera de Lab/)
  })
})

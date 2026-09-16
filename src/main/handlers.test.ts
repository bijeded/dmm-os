import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type Conexion } from './db'
import { crearHandlers, type HandlersOptions } from './handlers'
import type { DmmHandlers } from '../shared/ipc'

const migrationsFolder = resolve(import.meta.dirname, '../../drizzle')

let root: string
let conexion: Conexion
let opciones: HandlersOptions
let h: DmmHandlers

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dmm-handlers-'))
  conexion = createDatabase(migrationsFolder).abrir(':memory:')
  opciones = {
    conexion,
    info: { version: '0.1.0', dbPath: ':memory:', dmmOsRoot: root },
    respaldos: {
      estado: vi.fn(),
      crear: vi.fn(),
      configurar: vi.fn(),
      restaurar: vi.fn(() => ({ restaurado: true }))
    } as unknown as HandlersOptions['respaldos'],
    elegirRespaldo: vi.fn(async () => undefined),
    elegirHdd: vi.fn(async () => undefined),
    abrirCarpeta: vi.fn(async () => ''),
    ahora: () => '2026-09-16T10:00:00.000Z'
  }
  h = crearHandlers(opciones)
})

describe('el disco externo', () => {
  it('remembers the chosen drive, and the folder scan reads it', async () => {
    const hdd = mkdtempSync(join(tmpdir(), 'dmm-hdd-'))
    mkdirSync(join(hdd, 'Proyectos'))
    vi.mocked(opciones.elegirHdd).mockResolvedValue(hdd)

    expect(await h.rutas.elegirHdd()).toMatchObject({ hddRoot: hdd, hddConectado: true })
    expect(conexion.ajustes.leer('hdd.root')).toBe(hdd)
    expect((await h.importacion.carpetas()).hddConectado).toBe(true)
  })

  it('keeps the drive it had when the choice is cancelled', async () => {
    conexion.ajustes.escribir('hdd.root', '/Volumes/HDD')
    expect((await h.rutas.elegirHdd()).hddRoot).toBe('/Volumes/HDD')
  })

  it('forgets the drive', async () => {
    conexion.ajustes.escribir('hdd.root', '/Volumes/HDD')
    expect(await h.rutas.olvidarHdd()).toMatchObject({ hddRoot: null, hddConectado: false })
    expect((await h.importacion.carpetas()).hddConectado).toBe(false)
  })
})

describe('Logs', () => {
  it('shows nothing until an importer runs, then its last run', async () => {
    expect(await h.importacion.estado()).toEqual({ facturas: null, carpetas: null })
    const log = await h.importacion.facturas()
    expect(await h.importacion.estado()).toEqual({ facturas: { corridoEn: '2026-09-16T10:00:00.000Z', log }, carpetas: null })
  })
})

describe('Restauración', () => {
  it('restores the given Respaldo without asking', async () => {
    expect(await h.respaldos.restaurar('/v/a.db')).toEqual({ restaurado: true })
    expect(opciones.elegirRespaldo).not.toHaveBeenCalled()
  })

  it('asks for a Respaldo, and restores nothing when the choice is cancelled', async () => {
    expect(await h.respaldos.restaurar()).toEqual({ restaurado: false })
    expect(opciones.respaldos.restaurar).not.toHaveBeenCalled()

    vi.mocked(opciones.elegirRespaldo).mockResolvedValue('/v/b.db')
    await h.respaldos.restaurar()
    expect(opciones.respaldos.restaurar).toHaveBeenCalledWith('/v/b.db')
  })
})

describe('abrir carpetas', () => {
  it('opens Entrada or the root', async () => {
    await h.rutas.abrir('entrada')
    await h.rutas.abrir('raiz')
    expect(opciones.abrirCarpeta).toHaveBeenNthCalledWith(1, join(root, 'Entrada'))
    expect(opciones.abrirCarpeta).toHaveBeenNthCalledWith(2, root)
  })

  it('fails with the reason the folder could not be opened', async () => {
    vi.mocked(opciones.abrirCarpeta).mockResolvedValue('No existe')
    await expect(h.rutas.abrir('entrada')).rejects.toThrow('No existe')
  })
})

describe('Sugerencias de importación', () => {
  it('starts with none pending', async () => {
    mkdirSync(join(root, 'Entrada'))
    writeFileSync(join(root, 'Entrada', 'x.pdf'), '')
    expect(await h.importacion.sugerencias()).toEqual([])
    expect((await h.rutas.leer()).entrada).toBe(1)
  })
})

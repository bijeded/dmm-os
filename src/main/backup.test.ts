import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type Conexion } from './db'
import { settings } from './db/schema'
import { createRespaldos, isBackupDue, listBackups, type Programar } from './backup'

const database = createDatabase(resolve(import.meta.dirname, '../../drizzle'))
const day = 24 * 60 * 60 * 1000

let dir: string
let dbPath: string
let vault: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dmm-os-backup-'))
  dbPath = join(dir, 'app.db')
  vault = join(dir, 'Vault', 'DB')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** Respaldos bound to a freshly opened database, with fake clock, schedule and relaunch. */
function setup({ now = () => new Date('2026-09-13T23:00:00Z') }: { now?: () => Date } = {}) {
  const conexion = database.abrir(dbPath)
  const relaunch = vi.fn()
  const detenerProgramacion = vi.fn()
  const programar = vi.fn<Programar>(() => detenerProgramacion)
  const respaldos = createRespaldos({ dir: vault, dbPath, database, relaunch, now, programar })
  respaldos.conectar(conexion)
  return { conexion, respaldos, relaunch, programar, detenerProgramacion }
}

function valueOf(file: string, key: string) {
  const db = new Database(file, { readonly: true })
  const row = db.prepare('select value from settings where key = ?').get(key) as { value: string } | undefined
  db.close()
  return row?.value
}

describe('isBackupDue', () => {
  const now = new Date('2026-09-13T12:00:00Z')
  it('is due when there has never been a backup', () => {
    expect(isBackupDue(undefined, now, 7)).toBe(true)
  })
  it('is due once the frequency has elapsed', () => {
    expect(isBackupDue(new Date(now.getTime() - 7 * day), now, 7)).toBe(true)
    expect(isBackupDue(new Date(now.getTime() - 6 * day), now, 7)).toBe(false)
  })
})

describe('Respaldos', () => {
  it('writes a readable copy of the database into the Vault folder', () => {
    const { conexion, respaldos } = setup()
    conexion.db.insert(settings).values({ key: 'x', value: '1' }).run()
    const b = respaldos.crear()
    conexion.close()
    expect(b.motivo).toBe('manual')
    expect(valueOf(b.path, 'x')).toBe('1')
  })

  it('lists a Respaldo taken before a reimport', () => {
    const { conexion, respaldos } = setup()
    const b = respaldos.antesDeReimportar()
    conexion.close()
    expect(b.motivo).toBe('antes-de-reimportar')
    expect(listBackups(vault)).toEqual([expect.objectContaining({ archivo: b.archivo, motivo: 'antes-de-reimportar' })])
  })

  it('keeps only the configured number per motivo, dropping the oldest', () => {
    let t = Date.parse('2026-01-01T00:00:00Z')
    const { conexion, respaldos } = setup({ now: () => new Date((t += day)) })
    for (let i = 0; i < 6; i++) respaldos.crear()
    respaldos.antesDeMigrar(conexion)
    conexion.close()

    const manual = listBackups(vault).filter((b) => b.motivo === 'manual')
    expect(manual).toHaveLength(4)
    expect(manual[0].creadoEn).toBe('2026-01-07T00:00:00.000Z')
    expect(manual[3].creadoEn).toBe('2026-01-04T00:00:00.000Z')
    expect(listBackups(vault).filter((b) => b.motivo === 'migracion')).toHaveLength(1)
  })

  it('reads and stores frequency and retention, defaulting to weekly and 4', () => {
    const { conexion, respaldos } = setup()
    expect(respaldos.estado()).toMatchObject({ frecuenciaDias: 7, conservar: 4, ultimo: null, respaldos: [] })
    expect(respaldos.configurar({ frecuenciaDias: 1, conservar: 2 })).toMatchObject({ frecuenciaDias: 1, conservar: 2 })
    expect(() => respaldos.configurar({ frecuenciaDias: 0, conservar: 2 })).toThrow()
    conexion.close()
  })

  it('refuses to work before a database is connected, except antesDeMigrar', () => {
    const respaldos = createRespaldos({ dir: vault, dbPath, database, relaunch: vi.fn() })
    expect(() => respaldos.crear()).toThrow(/conectada/)
    const conexion = database.abrir(dbPath)
    expect(() => respaldos.antesDeMigrar(conexion)).not.toThrow()
    conexion.close()
  })
})

describe('Respaldos schedule', () => {
  it('backs up weekly; a manual backup does not reset the weekly clock', () => {
    let now = new Date('2026-09-01T00:00:00Z')
    const { conexion, respaldos } = setup({ now: () => now })
    expect(respaldos.respaldarSiToca()).not.toBeNull()
    now = new Date('2026-09-05T00:00:00Z')
    expect(respaldos.respaldarSiToca()).toBeNull()
    now = new Date('2026-09-08T00:00:00Z')
    expect(respaldos.respaldarSiToca()?.motivo).toBe('semanal')
    now = new Date('2026-09-14T00:00:00Z')
    respaldos.crear()
    now = new Date('2026-09-15T00:00:00Z')
    expect(respaldos.respaldarSiToca()?.motivo).toBe('semanal')
    conexion.close()
  })

  it('iniciar runs a check now and schedules hourly; failures are logged, not thrown', () => {
    const { conexion, respaldos, programar, detenerProgramacion } = setup()
    respaldos.iniciar()
    expect(listBackups(vault).map((b) => b.motivo)).toEqual(['semanal'])
    expect(programar).toHaveBeenCalledWith(expect.any(Function), 60 * 60 * 1000)

    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    conexion.close()
    expect(() => programar.mock.calls[0][0]()).not.toThrow()
    expect(error).toHaveBeenCalled()
    error.mockRestore()

    respaldos.detener()
    expect(detenerProgramacion).toHaveBeenCalled()
  })
})

describe('Restauración', () => {
  function backupWith(conexion: Conexion, value: string) {
    conexion.ajustes.escribir('k', value)
    const path = join(dir, `fuente-${value}.db`)
    conexion.copiarA(path)
    return path
  }

  it('stops the schedule, closes, swaps in the backup, relaunches, keeping a safety backup', () => {
    const { conexion, respaldos, relaunch, detenerProgramacion } = setup()
    respaldos.iniciar()
    const source = backupWith(conexion, 'antes')
    conexion.ajustes.escribir('k', 'despues')

    expect(respaldos.restaurar(source)).toEqual({ restaurado: true })

    expect(detenerProgramacion).toHaveBeenCalled()
    expect(relaunch).toHaveBeenCalledOnce()
    expect(() => conexion.db.select().from(settings).all()).toThrow(/not open/)
    expect(existsSync(`${dbPath}-wal`)).toBe(false)
    expect(readdirSync(dir).filter((f) => f.includes('restaurar'))).toEqual([])
    const safety = listBackups(vault).find((b) => b.motivo === 'antes-de-restaurar')!
    expect(valueOf(safety.path, 'k')).toBe('despues')

    const reopened = database.abrir(dbPath)
    expect(reopened.ajustes.leer('k')).toBe('antes')
    reopened.close()
  })

  it('restores a backup that the safety backup prunes (it is staged first)', () => {
    const { conexion, respaldos, relaunch } = setup()
    respaldos.configurar({ frecuenciaDias: 7, conservar: 1 })
    conexion.ajustes.escribir('k', 'antes')
    mkdirSync(vault, { recursive: true })
    const source = join(vault, 'dmm-os-2026-01-01T000000000Z-antes-de-restaurar.db')
    conexion.copiarA(source)
    conexion.ajustes.escribir('k', 'despues')

    respaldos.restaurar(source)

    expect(existsSync(source)).toBe(false)
    expect(relaunch).toHaveBeenCalledOnce()
    const reopened = database.abrir(dbPath)
    expect(reopened.ajustes.leer('k')).toBe('antes')
    reopened.close()
  })

  it('rejects an invalid file, leaving the live database open and nothing staged', () => {
    const { conexion, respaldos, relaunch } = setup()
    const bogus = join(dir, 'x.db')
    writeFileSync(bogus, 'no soy sqlite')
    expect(() => respaldos.restaurar(bogus)).toThrow(/respaldo/i)
    expect(relaunch).not.toHaveBeenCalled()
    expect(conexion.ajustes.leer('k')).toBeUndefined()
    expect(readdirSync(dir).filter((f) => f.includes('restaurar'))).toEqual([])
    expect(listBackups(vault)).toEqual([])
    conexion.close()
  })

  it('aborts when the safety backup fails, leaving the live database untouched', () => {
    const { conexion, respaldos, relaunch, detenerProgramacion } = setup()
    respaldos.iniciar()
    const source = backupWith(conexion, 'antes')
    conexion.ajustes.escribir('k', 'despues')
    rmSync(vault, { recursive: true, force: true })
    writeFileSync(vault, 'Vault is a file, so backups cannot be written')

    expect(() => respaldos.restaurar(source)).toThrow()

    expect(relaunch).not.toHaveBeenCalled()
    expect(detenerProgramacion).not.toHaveBeenCalled()
    expect(conexion.ajustes.leer('k')).toBe('despues')
    expect(readdirSync(dir).filter((f) => f.includes('restaurar'))).toEqual([])
    conexion.close()
  })
})

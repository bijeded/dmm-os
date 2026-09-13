import { copyFileSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { EstadoRespaldos, MotivoRespaldo, Respaldo } from '../shared/ipc'

const DEFAULT_FRECUENCIA_DIAS = 7
const DEFAULT_CONSERVAR = 4
const KEY_FRECUENCIA = 'respaldos.frecuenciaDias'
const KEY_CONSERVAR = 'respaldos.conservar'
const DAY_MS = 24 * 60 * 60 * 1000

const NAME = /^dmm-os-(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z-([a-z-]+)\.db$/

function fileName(at: Date, motivo: MotivoRespaldo): string {
  return `dmm-os-${at.toISOString().replace(/[:.]/g, '')}-${motivo}.db`
}

/** Backups in `dir`, newest first. Files not named by the app are ignored. */
export function listBackups(dir: string): Respaldo[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names
    .flatMap((archivo) => {
      const m = NAME.exec(archivo)
      if (!m) return []
      const path = join(dir, archivo)
      const creadoEn = `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`
      return [{ archivo, path, creadoEn, motivo: m[6] as MotivoRespaldo, bytes: statSync(path).size }]
    })
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
}

export function isBackupDue(last: Date | undefined, now: Date, frecuenciaDias: number): boolean {
  return !last || now.getTime() - last.getTime() >= frecuenciaDias * DAY_MS
}

interface BackupServiceOptions {
  sqlite: Database.Database
  dir: string
  now?: () => Date
}

export function createBackupService({ sqlite, dir, now = () => new Date() }: BackupServiceOptions) {
  const readSetting = (key: string, fallback: number): number => {
    const row = sqlite.prepare('select value from settings where key = ?').get(key) as { value: string } | undefined
    const n = Number(row?.value)
    return Number.isInteger(n) && n > 0 ? n : fallback
  }
  const writeSetting = (key: string, value: number) =>
    sqlite.prepare('insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value').run(key, String(value))

  const frecuenciaDias = () => readSetting(KEY_FRECUENCIA, DEFAULT_FRECUENCIA_DIAS)
  const conservar = () => readSetting(KEY_CONSERVAR, DEFAULT_CONSERVAR)

  function backupNow(motivo: MotivoRespaldo): Respaldo {
    mkdirSync(dir, { recursive: true })
    const path = join(dir, fileName(now(), motivo))
    // VACUUM INTO writes a consistent single-file copy, WAL contents included.
    sqlite.prepare('VACUUM INTO ?').run(path)
    for (const old of listBackups(dir).slice(conservar())) rmSync(old.path, { force: true })
    return listBackups(dir).find((b) => b.path === path)!
  }

  return {
    backupNow,
    estado(): EstadoRespaldos {
      const respaldos = listBackups(dir)
      return { dir, frecuenciaDias: frecuenciaDias(), conservar: conservar(), ultimo: respaldos[0]?.creadoEn ?? null, respaldos }
    },
    configurar({ frecuenciaDias, conservar }: { frecuenciaDias: number; conservar: number }) {
      for (const n of [frecuenciaDias, conservar]) {
        if (!Number.isInteger(n) || n < 1) throw new Error('Frecuencia y respaldos a conservar deben ser enteros mayores a 0')
      }
      writeSetting(KEY_FRECUENCIA, frecuenciaDias)
      writeSetting(KEY_CONSERVAR, conservar)
    },
    /** Weekly (configurable) backup; returns null when not yet due. */
    respaldarSiToca(): Respaldo | null {
      const last = listBackups(dir)[0]
      return isBackupDue(last && new Date(last.creadoEn), now(), frecuenciaDias()) ? backupNow('semanal') : null
    }
  }
}

export type BackupService = ReturnType<typeof createBackupService>

function journalTimes(migrationsFolder: string): number[] {
  const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')) as { entries: { when: number }[] }
  return journal.entries.map((e) => e.when)
}

/** Latest applied migration time, or null when the database was never migrated. */
function lastApplied(sqlite: Database.Database): number | null {
  const table = sqlite.prepare("select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'").get()
  if (!table) return null
  const row = sqlite.prepare('select max(created_at) as t from __drizzle_migrations').get() as { t: number | null }
  return row.t
}

/** True when an already-migrated database has migrations waiting (drizzle applies those newer than the last one). */
export function hasPendingMigrations(sqlite: Database.Database, migrationsFolder: string): boolean {
  const last = lastApplied(sqlite)
  return last !== null && journalTimes(migrationsFolder).some((when) => when > last)
}

/** Copies a backup next to the live database and checks it can be restored. Returns the staged file. */
export function stageRestore(source: string, dbPath: string, migrationsFolder: string): string {
  const staged = `${dbPath}.restaurar`
  copyFileSync(source, staged)
  try {
    let copy: Database.Database
    try {
      copy = new Database(staged, { readonly: true, fileMustExist: true })
    } catch {
      throw new Error('El archivo no es un respaldo de DMM OS')
    }
    try {
      let last: number | null
      try {
        const ok = copy.pragma('integrity_check', { simple: true })
        last = ok === 'ok' ? lastApplied(copy) : null
      } catch {
        last = null
      }
      if (last === null) throw new Error('El archivo no es un respaldo de DMM OS')
      if (last > Math.max(...journalTimes(migrationsFolder))) {
        throw new Error('El respaldo es de una versión más nueva de DMM OS; actualiza la app antes de restaurar')
      }
    } finally {
      copy.close()
    }
    return staged
  } catch (e) {
    rmSync(staged, { force: true })
    throw e
  }
}

/** Swaps the staged backup in. The live database must be closed first; migrations run on next open. */
export function installRestore(staged: string, dbPath: string): void {
  rmSync(`${dbPath}-wal`, { force: true })
  rmSync(`${dbPath}-shm`, { force: true })
  renameSync(staged, dbPath)
}

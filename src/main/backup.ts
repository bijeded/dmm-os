import { copyFileSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MOTIVOS_RESPALDO, type ConfigRespaldos, type EstadoRespaldos, type MotivoRespaldo, type Respaldo } from '../shared/ipc'
import type { Conexion, DatabaseModule } from './db'

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
      if (!m || !(MOTIVOS_RESPALDO as readonly string[]).includes(m[6])) return []
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
  conexion: Conexion
  dir: string
  now?: () => Date
}

export function createBackupService({ conexion, dir, now = () => new Date() }: BackupServiceOptions) {
  const readSetting = (key: string, fallback: number): number => {
    const n = Number(conexion.ajustes.leer(key))
    return Number.isInteger(n) && n > 0 ? n : fallback
  }
  const writeSetting = (key: string, value: number) => conexion.ajustes.escribir(key, String(value))

  const frecuenciaDias = () => readSetting(KEY_FRECUENCIA, DEFAULT_FRECUENCIA_DIAS)
  const conservar = () => readSetting(KEY_CONSERVAR, DEFAULT_CONSERVAR)

  function backupNow(motivo: MotivoRespaldo): Respaldo {
    mkdirSync(dir, { recursive: true })
    const path = join(dir, fileName(now(), motivo))
    conexion.copiarA(path)
    // Retention counts each motivo separately so manual or migration backups never push out the weekly ones.
    for (const old of listBackups(dir).filter((b) => b.motivo === motivo).slice(conservar())) rmSync(old.path, { force: true })
    return listBackups(dir).find((b) => b.path === path)!
  }

  return {
    backupNow,
    estado(): EstadoRespaldos {
      const respaldos = listBackups(dir)
      return { dir, frecuenciaDias: frecuenciaDias(), conservar: conservar(), ultimo: respaldos[0]?.creadoEn ?? null, respaldos }
    },
    configurar({ frecuenciaDias, conservar }: ConfigRespaldos) {
      for (const n of [frecuenciaDias, conservar]) {
        if (!Number.isInteger(n) || n < 1) throw new Error('Frecuencia y respaldos a conservar deben ser enteros mayores a 0')
      }
      writeSetting(KEY_FRECUENCIA, frecuenciaDias)
      writeSetting(KEY_CONSERVAR, conservar)
    },
    /** Weekly (configurable) backup; returns null when not yet due. */
    respaldarSiToca(): Respaldo | null {
      const last = listBackups(dir).find((b) => b.motivo === 'semanal')
      return isBackupDue(last && new Date(last.creadoEn), now(), frecuenciaDias()) ? backupNow('semanal') : null
    }
  }
}

export type BackupService = ReturnType<typeof createBackupService>

/** Copies a backup next to the live database and checks it can be restored. Returns the staged file. */
export function stageRestore(source: string, dbPath: string, database: DatabaseModule): string {
  const staged = `${dbPath}.restaurar`
  copyFileSync(source, staged)
  try {
    database.verificarRestaurable(staged)
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

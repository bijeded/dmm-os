import { copyFileSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MOTIVOS_RESPALDO, type ConfigRespaldos, type EstadoRespaldos, type MotivoRespaldo, type Respaldo, type ResultadoRestaurar } from '../shared/dominio'
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

/** Schedules `fn` to repeat; returns a function that stops it. */
export type Programar = (fn: () => void, ms: number) => () => void

interface RespaldosOptions {
  dir: string
  /** The live database file that a Restauración replaces. */
  dbPath: string
  database: DatabaseModule
  /** Restarts the app so the restored database opens and migrates. */
  relaunch: () => void
  now?: () => Date
  programar?: Programar
}

const HOUR_MS = 60 * 60 * 1000

const programarConIntervalo: Programar = (fn, ms) => {
  const timer = setInterval(fn, ms)
  return () => clearInterval(timer)
}

/**
 * Respaldos: dated copies of the database in Vault, kept per motivo, plus Restauración.
 * Bind the live Conexion with `conectar` before using anything but `antesDeMigrar`.
 */
export function createRespaldos({ dir, dbPath, database, relaunch, now = () => new Date(), programar = programarConIntervalo }: RespaldosOptions) {
  let conexion: Conexion | null = null
  let detenerProgramacion: (() => void) | null = null

  const conectada = (): Conexion => {
    if (!conexion) throw new Error('Respaldos sin base de datos conectada')
    return conexion
  }

  const readSetting = (c: Conexion, key: string, fallback: number): number => {
    const n = Number(c.ajustes.leer(key))
    return Number.isInteger(n) && n > 0 ? n : fallback
  }

  function respaldar(c: Conexion, motivo: MotivoRespaldo): Respaldo {
    mkdirSync(dir, { recursive: true })
    const path = join(dir, fileName(now(), motivo))
    c.copiarA(path)
    // Retention counts each motivo separately so manual or migration backups never push out the weekly ones.
    const conservar = readSetting(c, KEY_CONSERVAR, DEFAULT_CONSERVAR)
    for (const old of listBackups(dir).filter((b) => b.motivo === motivo).slice(conservar)) rmSync(old.path, { force: true })
    return listBackups(dir).find((b) => b.path === path)!
  }

  function estado(): EstadoRespaldos {
    const c = conectada()
    const respaldos = listBackups(dir)
    return {
      dir,
      frecuenciaDias: readSetting(c, KEY_FRECUENCIA, DEFAULT_FRECUENCIA_DIAS),
      conservar: readSetting(c, KEY_CONSERVAR, DEFAULT_CONSERVAR),
      ultimo: respaldos[0]?.creadoEn ?? null,
      respaldos
    }
  }

  /** Weekly (configurable) backup; returns null when not yet due. */
  function respaldarSiToca(): Respaldo | null {
    const c = conectada()
    const last = listBackups(dir).find((b) => b.motivo === 'semanal')
    const frecuencia = readSetting(c, KEY_FRECUENCIA, DEFAULT_FRECUENCIA_DIAS)
    return isBackupDue(last && new Date(last.creadoEn), now(), frecuencia) ? respaldar(c, 'semanal') : null
  }

  function detener() {
    detenerProgramacion?.()
    detenerProgramacion = null
  }

  return {
    /** Pass as `antesDeMigrar` when opening the database. */
    antesDeMigrar: (c: Conexion) => void respaldar(c, 'migracion'),
    conectar(c: Conexion) {
      conexion = c
    },
    /** Runs the scheduled backup now and then hourly. Failures are logged, never thrown. */
    iniciar() {
      detener()
      const tick = () => {
        try {
          respaldarSiToca()
        } catch (e) {
          console.error('[respaldos] scheduled backup failed', e)
        }
      }
      tick()
      detenerProgramacion = programar(tick, HOUR_MS)
    },
    detener,
    estado,
    respaldarSiToca,
    crear: () => respaldar(conectada(), 'manual'),
    /** The Respaldo Reimportar desde cero takes before removing anything. */
    antesDeReimportar: () => respaldar(conectada(), 'antes-de-reimportar'),
    configurar({ frecuenciaDias, conservar }: ConfigRespaldos): EstadoRespaldos {
      for (const n of [frecuenciaDias, conservar]) {
        if (!Number.isInteger(n) || n < 1) throw new Error('Frecuencia y respaldos a conservar deben ser enteros mayores a 0')
      }
      const c = conectada()
      c.ajustes.escribir(KEY_FRECUENCIA, String(frecuenciaDias))
      c.ajustes.escribir(KEY_CONSERVAR, String(conservar))
      return estado()
    },
    /**
     * Restauración: replaces the live database with `source` and relaunches.
     * Order matters: stage first (the safety backup may prune `source`), then the safety
     * backup (abort and clean up if it fails), then stop the schedule, close, swap in.
     */
    restaurar(source: string): ResultadoRestaurar {
      const c = conectada()
      const staged = `${dbPath}.restaurar`
      copyFileSync(source, staged)
      try {
        database.verificarRestaurable(staged)
        respaldar(c, 'antes-de-restaurar')
      } catch (e) {
        rmSync(staged, { force: true })
        throw e
      }
      detener()
      c.close()
      conexion = null
      rmSync(`${dbPath}-wal`, { force: true })
      rmSync(`${dbPath}-shm`, { force: true })
      renameSync(staged, dbPath)
      relaunch()
      return { restaurado: true }
    }
  }
}

export type Respaldos = ReturnType<typeof createRespaldos>

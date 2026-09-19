import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { journalTimes, lastApplied } from './migrations'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema>

const NO_ES_RESPALDO = 'El archivo no es un respaldo de DMM OS'

/** Key/value settings stored in the database. */
export interface Ajustes {
  leer(clave: string): string | undefined
  escribir(clave: string, valor: string): void
}

export interface Conexion {
  db: Db
  ajustes: Ajustes
  /** Writes a consistent single-file copy of the database, WAL contents included. */
  copiarA(path: string): void
  close(): void
}

interface AbrirOptions {
  /**
   * Called before pending migrations touch an existing database (not on a fresh one).
   * If it throws, nothing is migrated: no migration runs without its backup.
   */
  antesDeMigrar?: (conexion: Conexion) => void
}

/**
 * Applies pending migrations as drizzle's migrator would, recording them in the same table, but
 * with foreign keys off: PRAGMA foreign_keys is ignored inside a transaction, so a table rebuilt
 * by a migration would otherwise cascade-delete or refuse to drop under its references. The
 * references are checked before commit, and any break rolls every pending migration back.
 */
function migrar(sqlite: Database.Database, migrationsFolder: string): void {
  sqlite.exec('CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)')
  const ultima = lastApplied(sqlite)
  const pendientes = readMigrationFiles({ migrationsFolder }).filter((m) => ultima === null || ultima < m.folderMillis)
  if (pendientes.length === 0) return
  const registrar = sqlite.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
  sqlite.pragma('foreign_keys = OFF')
  try {
    sqlite.transaction(() => {
      for (const m of pendientes) {
        for (const stmt of m.sql) if (stmt.trim()) sqlite.exec(stmt)
        registrar.run(m.hash, m.folderMillis)
      }
      if ((sqlite.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('La migración dejó referencias rotas')
    })()
  } finally {
    sqlite.pragma('foreign_keys = ON')
  }
}

/** The database module, bound to the app's migrations. Owns schema version compatibility. */
export function createDatabase(migrationsFolder: string) {
  const ultimaConocida = () => Math.max(...journalTimes(migrationsFolder))

  function conectar(file: string): { conexion: Conexion; sqlite: Database.Database } {
    const sqlite = new Database(file)
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')
    const conexion: Conexion = {
      db: drizzle(sqlite, { schema }),
      ajustes: {
        leer: (clave) =>
          (sqlite.prepare('select value from settings where key = ?').get(clave) as { value: string } | undefined)?.value,
        escribir: (clave, valor) => {
          sqlite
            .prepare('insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value')
            .run(clave, valor)
        }
      },
      copiarA: (path) => {
        sqlite.prepare('VACUUM INTO ?').run(path)
      },
      close: () => sqlite.close()
    }
    return { conexion, sqlite }
  }

  return {
    abrir(file: string, { antesDeMigrar }: AbrirOptions = {}): Conexion {
      const { conexion, sqlite } = conectar(file)
      try {
        const last = lastApplied(sqlite)
        if (antesDeMigrar && last !== null && journalTimes(migrationsFolder).some((when) => when > last)) {
          antesDeMigrar(conexion)
        }
        migrar(sqlite, migrationsFolder)
      } catch (e) {
        conexion.close()
        throw e
      }
      return conexion
    },

    /** Throws unless `file` is an intact DMM OS database this version of the app can open. */
    verificarRestaurable(file: string): void {
      let copy: Database.Database
      try {
        copy = new Database(file, { readonly: true, fileMustExist: true })
      } catch {
        throw new Error(NO_ES_RESPALDO)
      }
      try {
        let last: number | null
        try {
          last = copy.pragma('integrity_check', { simple: true }) === 'ok' ? lastApplied(copy) : null
        } catch {
          last = null
        }
        if (last === null) throw new Error(NO_ES_RESPALDO)
        if (last > ultimaConocida()) {
          throw new Error('El respaldo es de una versión más nueva de DMM OS; actualiza la app antes de restaurar')
        }
      } finally {
        copy.close()
      }
    }
  }
}

export type DatabaseModule = ReturnType<typeof createDatabase>

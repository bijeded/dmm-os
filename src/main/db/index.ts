import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { hasPendingMigrations } from '../backup'
import * as schema from './schema'

interface OpenOptions {
  /** Called before pending migrations touch an existing database (not on a fresh one). */
  beforeMigrate?: (sqlite: Database.Database) => void
}

export function openDatabase(file: string, migrationsFolder: string, { beforeMigrate }: OpenOptions = {}) {
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  if (beforeMigrate && hasPendingMigrations(sqlite, migrationsFolder)) beforeMigrate(sqlite)
  migrate(db, { migrationsFolder })
  return { db, sqlite, close: () => sqlite.close() }
}

export type Db = ReturnType<typeof openDatabase>['db']

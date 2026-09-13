import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'

export function journalTimes(migrationsFolder: string): number[] {
  const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')) as { entries: { when: number }[] }
  return journal.entries.map((e) => e.when)
}

/** Latest applied migration time, or null when the database was never migrated. */
export function lastApplied(sqlite: Database.Database): number | null {
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

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase } from './index'
import { proyectos, settings } from './schema'

const migrationsFolder = resolve(import.meta.dirname, '../../../drizzle')
const database = createDatabase(migrationsFolder)

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dmm-os-test-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** A migrations folder holding only the first migration, standing in for an older app version. */
function olderMigrations(): string {
  const older = join(dir, 'older-migrations')
  mkdirSync(join(older, 'meta'), { recursive: true })
  const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8'))
  const first = journal.entries[0]
  writeFileSync(join(older, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: [first] }))
  copyFileSync(join(migrationsFolder, `${first.tag}.sql`), join(older, `${first.tag}.sql`))
  return older
}

const migrationCount = (file: string) => {
  const copy = new Database(file, { readonly: true })
  const { n } = copy.prepare('select count(*) as n from __drizzle_migrations').get() as { n: number }
  copy.close()
  return n
}

describe('abrir', () => {
  it('applies migrations so the schema is usable', () => {
    const { db, close } = database.abrir(':memory:')
    db.insert(settings).values({ key: 'dmmOsRoot', value: '/x' }).run()
    expect(db.select().from(settings).all()).toEqual([{ key: 'dmmOsRoot', value: '/x' }])
    close()
  })

  it('is idempotent when opened twice on the same file', () => {
    const file = join(dir, 'test.db')
    database.abrir(file).close()
    const { db, close } = database.abrir(file)
    expect(db.select().from(settings).all()).toEqual([])
    close()
  })

  it('calls antesDeMigrar only when an existing database has pending migrations', () => {
    const file = join(dir, 'app.db')
    const copies: string[] = []
    const antesDeMigrar = (c: { copiarA(path: string): void }) => {
      const path = join(dir, `copia-${copies.length}.db`)
      c.copiarA(path)
      copies.push(path)
    }
    const older = createDatabase(olderMigrations())

    // Fresh install: nothing to protect.
    older.abrir(file, { antesDeMigrar }).close()
    // Up to date: nothing to do.
    older.abrir(file, { antesDeMigrar }).close()
    expect(copies).toHaveLength(0)

    // Pending migrations: the hook sees the pre-migration database.
    database.abrir(file, { antesDeMigrar }).close()
    expect(copies).toHaveLength(1)
    expect(migrationCount(copies[0])).toBe(1)
    expect(migrationCount(file)).toBeGreaterThan(1)
  })

  it('refuses to migrate when antesDeMigrar fails', () => {
    const file = join(dir, 'app.db')
    createDatabase(olderMigrations()).abrir(file).close()
    expect(() =>
      database.abrir(file, {
        antesDeMigrar: () => {
          throw new Error('Vault no disponible')
        }
      })
    ).toThrow('Vault no disponible')
    expect(migrationCount(file)).toBe(1)
  })
})

describe('ajustes', () => {
  it('reads undefined for a missing key and overwrites on write', () => {
    const { ajustes, close } = database.abrir(':memory:')
    expect(ajustes.leer('k')).toBeUndefined()
    ajustes.escribir('k', '1')
    ajustes.escribir('k', '2')
    expect(ajustes.leer('k')).toBe('2')
    close()
  })
})

describe('copiaEnMemoria', () => {
  it('copies the live data, WAL included, and keeps writes to the copy away from it', () => {
    const conexion = database.abrir(join(dir, 'app.db'))
    conexion.db.insert(settings).values({ key: 'a', value: '1' }).run()

    const copia = conexion.copiaEnMemoria()
    expect(copia.db.select().from(settings).all()).toEqual([{ key: 'a', value: '1' }])
    copia.db.insert(settings).values({ key: 'b', value: '2' }).run()
    expect(copia.db.select().from(settings).all()).toHaveLength(2)
    copia.close()

    expect(conexion.db.select().from(settings).all()).toEqual([{ key: 'a', value: '1' }])
    conexion.close()
  })

  it('enforces foreign keys on the copy', () => {
    const conexion = database.abrir(join(dir, 'app.db'))
    const copia = conexion.copiaEnMemoria()
    expect(() =>
      copia.db.insert(proyectos).values({ nombre: 'x', contactoId: 999, categoria: 'other' }).run()
    ).toThrow(/FOREIGN KEY/)
    copia.close()
    conexion.close()
  })
})

describe('verificarRestaurable', () => {
  it('accepts a copy of a current database', () => {
    const { copiarA, close } = database.abrir(join(dir, 'app.db'))
    copiarA(join(dir, 'copia.db'))
    close()
    expect(() => database.verificarRestaurable(join(dir, 'copia.db'))).not.toThrow()
  })

  it('accepts a database from an older version, which migrates on open', () => {
    const file = join(dir, 'old.db')
    createDatabase(olderMigrations()).abrir(file).close()
    expect(() => database.verificarRestaurable(file)).not.toThrow()
  })

  it('rejects a file that is not a DMM OS database', () => {
    const bogus = join(dir, 'x.db')
    writeFileSync(bogus, 'no soy sqlite')
    expect(() => database.verificarRestaurable(bogus)).toThrow(/respaldo/i)

    const empty = join(dir, 'empty.db')
    new Database(empty).close()
    expect(() => database.verificarRestaurable(empty)).toThrow(/respaldo/i)

    expect(() => database.verificarRestaurable(join(dir, 'missing.db'))).toThrow(/respaldo/i)
  })

  it('rejects a database made by a newer version of the app', () => {
    const file = join(dir, 'newer.db')
    const { close } = database.abrir(file)
    close()
    const raw = new Database(file)
    raw.prepare("insert into __drizzle_migrations (hash, created_at) values ('futuro', 9999999999999)").run()
    raw.close()
    expect(() => database.verificarRestaurable(file)).toThrow(/versión/i)
  })
})

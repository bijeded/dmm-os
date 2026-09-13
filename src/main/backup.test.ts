import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './db'
import { settings } from './db/schema'
import { createBackupService, installRestore, isBackupDue, listBackups, stageRestore } from './backup'

const migrationsFolder = resolve(import.meta.dirname, '../../drizzle')

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dmm-os-backup-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const day = 24 * 60 * 60 * 1000

function openAt(file: string) {
  return openDatabase(file, migrationsFolder)
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

describe('backup service', () => {
  it('writes a readable copy of the database into the Vault folder', () => {
    const { db, sqlite, close } = openAt(join(dir, 'app.db'))
    db.insert(settings).values({ key: 'x', value: '1' }).run()
    const vault = join(dir, 'Vault', 'DB')
    const service = createBackupService({ sqlite, dir: vault, now: () => new Date('2026-09-13T23:00:00Z') })

    const b = service.backupNow('manual')
    close()

    expect(b.motivo).toBe('manual')
    const copy = new Database(b.path, { readonly: true })
    expect(copy.prepare("select value from settings where key = 'x'").get()).toEqual({ value: '1' })
    copy.close()
  })

  it('keeps only the configured number of backups, dropping the oldest', () => {
    const { sqlite, close } = openAt(join(dir, 'app.db'))
    let t = Date.parse('2026-01-01T00:00:00Z')
    const service = createBackupService({ sqlite, dir: join(dir, 'v'), now: () => new Date((t += day)) })
    for (let i = 0; i < 6; i++) service.backupNow('semanal')
    close()

    const kept = listBackups(join(dir, 'v'))
    expect(kept).toHaveLength(4)
    expect(kept[0].creadoEn).toBe('2026-01-07T00:00:00.000Z')
    expect(kept[3].creadoEn).toBe('2026-01-04T00:00:00.000Z')
  })

  it('counts retention per motivo so manual backups never push out weekly ones', () => {
    const { sqlite, close } = openAt(join(dir, 'app.db'))
    let t = Date.parse('2026-01-01T00:00:00Z')
    const service = createBackupService({ sqlite, dir: join(dir, 'v'), now: () => new Date((t += day)) })
    for (let i = 0; i < 4; i++) service.backupNow('semanal')
    for (let i = 0; i < 5; i++) service.backupNow('manual')
    close()
    const kept = listBackups(join(dir, 'v'))
    expect(kept.filter((b) => b.motivo === 'semanal')).toHaveLength(4)
    expect(kept.filter((b) => b.motivo === 'manual')).toHaveLength(4)
  })

  it('reads and stores frequency and retention in settings, defaulting to weekly and 4', () => {
    const { sqlite, close } = openAt(join(dir, 'app.db'))
    const service = createBackupService({ sqlite, dir: join(dir, 'v') })
    expect(service.estado()).toMatchObject({ frecuenciaDias: 7, conservar: 4, ultimo: null, respaldos: [] })
    service.configurar({ frecuenciaDias: 1, conservar: 2 })
    expect(service.estado()).toMatchObject({ frecuenciaDias: 1, conservar: 2 })
    expect(() => service.configurar({ frecuenciaDias: 0, conservar: 2 })).toThrow()
    close()
  })

  it('runs the scheduled backup only when due', () => {
    const { sqlite, close } = openAt(join(dir, 'app.db'))
    let now = new Date('2026-09-01T00:00:00Z')
    const service = createBackupService({ sqlite, dir: join(dir, 'v'), now: () => now })
    expect(service.respaldarSiToca()).not.toBeNull()
    now = new Date('2026-09-05T00:00:00Z')
    expect(service.respaldarSiToca()).toBeNull()
    now = new Date('2026-09-08T00:00:00Z')
    expect(service.respaldarSiToca()?.motivo).toBe('semanal')
    // A manual backup does not reset the weekly clock.
    now = new Date('2026-09-14T00:00:00Z')
    service.backupNow('manual')
    now = new Date('2026-09-15T00:00:00Z')
    expect(service.respaldarSiToca()?.motivo).toBe('semanal')
    close()
  })
})

describe('backup before migrations', () => {
  it('backs up an existing database before applying pending migrations, not a fresh one', () => {
    const file = join(dir, 'app.db')
    const vault = join(dir, 'v')
    const calls: number[] = []
    const beforeMigrate = (sqlite: Database.Database) => {
      calls.push(1)
      createBackupService({ sqlite, dir: vault }).backupNow('migracion')
    }

    // Fresh install: nothing to protect.
    const older = join(dir, 'older-migrations')
    mkdirSync(join(older, 'meta'), { recursive: true })
    const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8'))
    const first = journal.entries[0]
    writeFileSync(join(older, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: [first] }))
    copyFileSync(join(migrationsFolder, `${first.tag}.sql`), join(older, `${first.tag}.sql`))
    openDatabase(file, older, { beforeMigrate }).close()
    expect(calls).toHaveLength(0)

    // Up to date: no backup.
    openDatabase(file, older, { beforeMigrate }).close()
    expect(calls).toHaveLength(0)

    // New migrations pending: backup first, holding the pre-migration schema.
    openDatabase(file, migrationsFolder, { beforeMigrate }).close()
    expect(calls).toHaveLength(1)
    const [b] = listBackups(vault)
    expect(b.motivo).toBe('migracion')
    const copy = new Database(b.path, { readonly: true })
    expect(copy.prepare('select count(*) as n from __drizzle_migrations').get()).toEqual({ n: 1 })
    copy.close()
  })
})

describe('restore', () => {
  it('replaces the database with a backup, which then opens and migrates', () => {
    const file = join(dir, 'app.db')
    const a = openAt(file)
    a.db.insert(settings).values({ key: 'k', value: 'antes' }).run()
    const backup = createBackupService({ sqlite: a.sqlite, dir: join(dir, 'v') }).backupNow('manual')
    a.db.update(settings).set({ value: 'despues' }).run()
    a.close()

    const staged = stageRestore(backup.path, file, migrationsFolder)
    installRestore(staged, file)

    expect(existsSync(`${file}-wal`)).toBe(false)
    const b = openAt(file)
    expect(b.db.select().from(settings).all()).toEqual([{ key: 'k', value: 'antes' }])
    b.close()
    expect(readdirSync(dir).filter((f) => f.includes('restaurar'))).toEqual([])
  })

  it('rejects a file that is not a DMM OS database', () => {
    const bogus = join(dir, 'x.db')
    writeFileSync(bogus, 'no soy sqlite')
    expect(() => stageRestore(bogus, join(dir, 'app.db'), migrationsFolder)).toThrow(/respaldo/i)

    const empty = join(dir, 'empty.db')
    new Database(empty).close()
    expect(() => stageRestore(empty, join(dir, 'app.db'), migrationsFolder)).toThrow(/respaldo/i)
  })

  it('rejects a backup made by a newer version of the app', () => {
    const file = join(dir, 'newer.db')
    const { sqlite, close } = openAt(file)
    sqlite.prepare("insert into __drizzle_migrations (hash, created_at) values ('futuro', 9999999999999)").run()
    close()
    expect(() => stageRestore(file, join(dir, 'app.db'), migrationsFolder)).toThrow(/versión/i)
  })
})

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase } from './index'
import { settings } from './schema'

const migrationsFolder = resolve(import.meta.dirname, '../../../drizzle')

describe('openDatabase', () => {
  it('applies migrations so the schema is usable', () => {
    const { db, close } = openDatabase(':memory:', migrationsFolder)
    db.insert(settings).values({ key: 'dmmOsRoot', value: '/x' }).run()
    expect(db.select().from(settings).all()).toEqual([{ key: 'dmmOsRoot', value: '/x' }])
    close()
  })

  it('is idempotent when opened twice on the same file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dmm-os-test-'))
    const file = join(dir, 'test.db')
    openDatabase(file, migrationsFolder).close()
    const { db, close } = openDatabase(file, migrationsFolder)
    expect(db.select().from(settings).all()).toEqual([])
    close()
    rmSync(dir, { recursive: true, force: true })
  })
})

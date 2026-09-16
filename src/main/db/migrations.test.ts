import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createDatabase } from './index'
import { journalTimes } from './migrations'
import { cotizaciones, sugerenciasImportacion } from './schema'

const drizzleDir = resolve(import.meta.dirname, '../../../drizzle')
let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dmm-upg-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

it('migrates a database that already holds data from before 0004', () => {
  const file = join(dir, 'old.db')
  const sqlite = new Database(file)
  sqlite.pragma('foreign_keys = ON')
  // Bring it up to 0003 exactly as the old app would have.
  for (const m of [
    '0000_brown_menace.sql',
    '0001_modelo_de_datos.sql',
    '0002_revision_modelo.sql',
    '0003_importacion_cfdi.sql'
  ]) {
    for (const stmt of readFileSync(join(drizzleDir, m), 'utf8').split('--> statement-breakpoint')) {
      if (stmt.trim()) sqlite.exec(stmt)
    }
  }
  // Record 0000–0003 as applied, exactly as the migrator would have.
  sqlite.exec(
    'create table __drizzle_migrations (id integer primary key autoincrement, hash text not null, created_at numeric)'
  )
  const aplicar = sqlite.prepare('insert into __drizzle_migrations (hash, created_at) values (?, ?)')
  for (const when of journalTimes(drizzleDir).slice(0, 4)) aplicar.run(String(when), when)

  sqlite.exec(`
    insert into contactos (id, nombre) values (1, 'Estudio Ocho');
    insert into cotizaciones (id, folio, contacto_id, categoria, estado, fecha)
      values (1, 475, 1, 'website', 'aceptada', '2025-01-01');
    insert into proyectos (id, nombre, contacto_id, categoria) values (1, 'Clicme', 1, 'website');
    insert into ingresos (id, categoria, estado, estado_facturacion, subtotal, iva, total, fecha_registro)
      values (1, 'factura', 'pendiente', 'facturado', 1000, 160, 1160, '2025-02-01');
    insert into sugerencias_importacion (entidad, entidad_id, proyecto_id, motivo)
      values ('ingreso', 1, 1, 'monto y fecha');
  `)
  sqlite.close()

  const { db } = createDatabase(drizzleDir).abrir(file)

  // The pre-existing Sugerencia survived, defaulted to the 'vincular' action.
  expect(db.select().from(sugerenciasImportacion).all()).toEqual([
    expect.objectContaining({
      entidad: 'ingreso',
      entidadId: 1,
      accion: 'vincular',
      proyectoId: 1,
      contactoId: null,
      motivo: 'monto y fecha',
      estado: 'pendiente'
    })
  ])
  // The existing Cotización kept its Folio and gained the new columns.
  expect(db.select().from(cotizaciones).get()).toMatchObject({
    folio: 475,
    folioSufijo: '',
    nombre: null
  })
})

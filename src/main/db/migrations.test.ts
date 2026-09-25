import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

it('0009 marks imported CFDIs paid on their date, and leaves the rest alone', () => {
  const file = join(dir, 'cfdi.db')
  createDatabase(drizzleDir).abrir(file).close()
  const sqlite = new Database(file)
  sqlite.exec(`
    insert into ingresos (categoria, estado, estado_facturacion, subtotal, iva, total, fecha_registro, cfdi_uuid) values
      ('factura', 'pendiente', 'facturado', 100, 16, 116, '2024-05-02', 'A'),
      ('factura', 'cancelado', 'facturado', 100, 16, 116, '2024-05-03', 'B'),
      ('sin_factura', 'pendiente', null, 100, 0, 100, '2024-05-04', null);
    insert into costos (nombre, categoria, estado, subtotal, iva, total, fecha, cfdi_uuid) values
      ('Hosting', 'unico', 'pendiente', 100, 16, 116, '2024-06-01', 'C'),
      ('Manual', 'unico', 'pendiente', 100, 0, 100, '2024-06-02', null);
  `)
  for (const stmt of readFileSync(join(drizzleDir, '0009_cfdi_pagados.sql'), 'utf8').split('--> statement-breakpoint')) sqlite.exec(stmt)
  expect(sqlite.prepare('select cfdi_uuid, estado, fecha_pago from ingresos order by id').all()).toEqual([
    { cfdi_uuid: 'A', estado: 'pagado', fecha_pago: '2024-05-02' },
    { cfdi_uuid: 'B', estado: 'cancelado', fecha_pago: null },
    { cfdi_uuid: null, estado: 'pendiente', fecha_pago: null }
  ])
  expect(sqlite.prepare('select nombre, estado, fecha_pago from costos order by id').all()).toEqual([
    { nombre: 'Hosting', estado: 'pagado', fecha_pago: '2024-06-01' },
    { nombre: 'Manual', estado: 'pendiente', fecha_pago: null }
  ])
  sqlite.close()
})

it('0013 moves negative IVA on imported CFDIs into retenciones, keeping the total, and leaves the rest alone', () => {
  const file = join(dir, 'iva.db')
  createDatabase(drizzleDir).abrir(file).close()
  const sqlite = new Database(file)
  sqlite.exec(`
    insert into ingresos (categoria, estado, estado_facturacion, subtotal, iva, total, fecha_registro, cfdi_uuid) values
      ('factura', 'pagado', 'facturado', 100000, -4667, 95333, '2024-05-02', 'A'),
      ('factura', 'pagado', 'facturado', 100000, 16000, 116000, '2024-05-03', 'B'),
      ('sin_factura', 'pendiente', null, 100000, -500, 99500, '2024-05-04', null);
    insert into costos (nombre, categoria, estado, subtotal, iva, total, fecha, cfdi_uuid) values
      ('Honorarios', 'unico', 'pagado', 100000, -1000, 99000, '2024-06-01', 'C');
  `)
  for (const stmt of readFileSync(join(drizzleDir, '0013_corregir_iva.sql'), 'utf8').split('--> statement-breakpoint')) sqlite.exec(stmt)
  expect(sqlite.prepare('select iva, retenciones, total from ingresos order by id').all()).toEqual([
    { iva: 0, retenciones: 4667, total: 95333 },
    { iva: 16000, retenciones: 0, total: 116000 },
    { iva: -500, retenciones: 0, total: 99500 }
  ])
  expect(sqlite.prepare('select iva, retenciones, total from costos').all()).toEqual([
    { iva: 0, retenciones: 1000, total: 99000 }
  ])
  sqlite.close()
})

it('0012 gives existing amounts zero retenciones and keeps rows linked to rebuilt tables', () => {
  const file = join(dir, 'retenciones.db')
  const sqlite = new Database(file)
  sqlite.pragma('foreign_keys = ON')
  const anteriores = journalTimes(drizzleDir).slice(0, 12)
  const archivos = JSON.parse(readFileSync(join(drizzleDir, 'meta', '_journal.json'), 'utf8')).entries
    .slice(0, 12)
    .map((e: { tag: string }) => `${e.tag}.sql`)
  for (const m of archivos) {
    for (const stmt of readFileSync(join(drizzleDir, m), 'utf8').split('--> statement-breakpoint')) {
      if (stmt.trim()) sqlite.exec(stmt)
    }
  }
  sqlite.exec(
    'create table __drizzle_migrations (id integer primary key autoincrement, hash text not null, created_at numeric)'
  )
  const aplicar = sqlite.prepare('insert into __drizzle_migrations (hash, created_at) values (?, ?)')
  for (const when of anteriores) aplicar.run(String(when), when)
  sqlite.exec(`
    insert into definiciones_ingreso (id, tipo, categoria, subtotal, iva, total, dia_del_mes, periodo_inicio)
      values (1, 'mensual', 'sin_factura', 1000, 0, 1000, 1, '2026-01');
    insert into ingresos (categoria, estado, subtotal, iva, total, fecha_registro, periodo, definicion_id)
      values ('sin_factura', 'pendiente', 1000, 0, 1000, '2026-01-01', '2026-01', 1);
    insert into definiciones_costo (id, nombre, tipo, dia_del_mes, periodo_inicio)
      values (1, 'Hosting', 'mensual', 1, '2026-01');
    insert into vigencias_precio (definicion_costo_id, desde, subtotal, iva, total) values (1, '2026-01', 100, 16, 116);
    insert into costos (id, nombre, categoria, estado, subtotal, iva, total, fecha, periodo, definicion_id)
      values (1, 'Hosting', 'mensual', 'pagado', 100, 16, 116, '2026-01-01', '2026-01', 1);
  `)
  sqlite.close()

  createDatabase(drizzleDir).abrir(file).close()

  const migrada = new Database(file)
  for (const tabla of ['definiciones_ingreso', 'ingresos', 'vigencias_precio', 'costos']) {
    expect(migrada.prepare(`select retenciones from ${tabla}`).all()).toEqual([{ retenciones: 0 }])
  }
  expect(migrada.prepare('select definicion_id from ingresos').get()).toEqual({ definicion_id: 1 })
  expect(migrada.pragma('foreign_key_check')).toEqual([])
  expect(() =>
    migrada.exec(
      `insert into costos (nombre, categoria, estado, subtotal, iva, retenciones, total, fecha) values ('x', 'unico', 'pagado', 100, 16, 10, 116, '2026-01-01')`
    )
  ).toThrow(/CHECK/)
  migrada.close()
})

it('0017 gives imported CFDIs Parcialidad 0 and lets one CFDI hold several Parcialidades', () => {
  const file = join(dir, 'parcialidades.db')
  const sqlite = new Database(file)
  sqlite.pragma('foreign_keys = ON')
  const entradas = JSON.parse(readFileSync(join(drizzleDir, 'meta', '_journal.json'), 'utf8')).entries.slice(0, 17)
  for (const { tag } of entradas as { tag: string }[]) {
    for (const stmt of readFileSync(join(drizzleDir, `${tag}.sql`), 'utf8').split('--> statement-breakpoint')) {
      if (stmt.trim()) sqlite.exec(stmt)
    }
  }
  sqlite.exec(
    'create table __drizzle_migrations (id integer primary key autoincrement, hash text not null, created_at numeric)'
  )
  const aplicar = sqlite.prepare('insert into __drizzle_migrations (hash, created_at) values (?, ?)')
  for (const when of journalTimes(drizzleDir).slice(0, 17)) aplicar.run(String(when), when)
  sqlite.exec(`
    insert into ingresos (categoria, estado, estado_facturacion, subtotal, iva, total, fecha_registro, cfdi_uuid)
      values ('factura', 'pagado', 'facturado', 1000, 160, 1160, '2019-08-29', 'A');
  `)
  sqlite.close()

  createDatabase(drizzleDir).abrir(file).close()

  const migrada = new Database(file)
  expect(migrada.prepare('select cfdi_uuid, cfdi_parcialidad from ingresos').all()).toEqual([
    { cfdi_uuid: 'A', cfdi_parcialidad: 0 }
  ])
  const insertar = (parcialidad: number) =>
    migrada.exec(
      `insert into ingresos (categoria, estado, estado_facturacion, subtotal, iva, total, cfdi_uuid, cfdi_parcialidad)
        values ('factura', 'pagado', 'facturado', 500, 80, 580, 'B', ${parcialidad})`
    )
  insertar(1)
  insertar(2)
  expect(() => insertar(2)).toThrow(/UNIQUE/)
  migrada.close()
})

it('rolls back a migration that leaves broken references, so the database stays as it was', () => {
  const carpeta = join(dir, 'drizzle')
  cpSync(drizzleDir, carpeta, { recursive: true })
  const journal = JSON.parse(readFileSync(join(carpeta, 'meta', '_journal.json'), 'utf8'))
  const ultima = journal.entries.at(-1)
  journal.entries.push({ ...ultima, idx: ultima.idx + 1, when: ultima.when + 1, tag: '9999_rota' })
  writeFileSync(join(carpeta, 'meta', '_journal.json'), JSON.stringify(journal))
  writeFileSync(
    join(carpeta, '9999_rota.sql'),
    `insert into ingresos (categoria, estado, subtotal, iva, total, definicion_id) values ('sin_factura', 'pendiente', 1, 0, 1, 999);`
  )
  const file = join(dir, 'rota.db')
  createDatabase(drizzleDir).abrir(file).close()

  expect(() => createDatabase(carpeta).abrir(file)).toThrow(/referencias rotas/)

  const sqlite = new Database(file)
  expect(sqlite.prepare('select count(*) as n from ingresos').get()).toEqual({ n: 0 })
  expect(sqlite.prepare('select max(created_at) as t from __drizzle_migrations').get()).toEqual({ t: ultima.when })
  sqlite.close()
})

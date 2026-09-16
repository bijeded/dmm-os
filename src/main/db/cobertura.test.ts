import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { coberturaCostos } from './cobertura'
import { importarFacturas } from '../importacion'
import { db, reiniciarDb } from './test-db'
import { cfdiXml, RFC_DMM } from '../test-cfdi'

let root: string

beforeEach(() => {
  reiniciarDb()
  root = mkdtempSync(join(tmpdir(), 'dmm-cobertura-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('coberturaCostos', () => {
  it('marks Sin datos the years whose Costos were never imported', () => {
    mkdirSync(join(root, 'Facturas', 'Recibidas'), { recursive: true })
    writeFileSync(join(root, 'Facturas', 'Recibidas', 'a.xml'), cfdiXml({ receptor: RFC_DMM, fecha: '2026-02-03' }))
    importarFacturas(db, root)
    expect(coberturaCostos(db, 2024, 2026)).toEqual([
      { anio: 2024, sinDatos: true },
      { anio: 2025, sinDatos: true },
      { anio: 2026, sinDatos: false }
    ])
  })
})

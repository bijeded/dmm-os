import { beforeEach, describe, expect, it } from 'vitest'
import { coberturaCostos } from './cobertura'
import { importarCfdi } from './importacion'
import { db, reiniciarDb } from './test-db'
import { cfdiXml, RFC_DMM } from '../test-cfdi'

beforeEach(reiniciarDb)

describe('coberturaCostos', () => {
  it('marks Sin datos the years whose Costos were never imported', () => {
    importarCfdi(db, cfdiXml({ receptor: RFC_DMM, fecha: '2026-02-03' }), 'recibida')
    expect(coberturaCostos(db, 2024, 2026)).toEqual([
      { anio: 2024, sinDatos: true },
      { anio: 2025, sinDatos: true },
      { anio: 2026, sinDatos: false }
    ])
  })
})

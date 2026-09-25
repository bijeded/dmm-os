import { beforeEach, describe, expect, it } from 'vitest'
import { coberturaCostos } from './cobertura'
import { costos } from './schema'
import { db, reiniciarDb } from './test-db'

beforeEach(() => reiniciarDb())

describe('coberturaCostos', () => {
  it('marks Sin datos the years with no Costos', () => {
    db.insert(costos).values({ nombre: 'Hosting', categoria: 'unico', estado: 'pagado', subtotal: 100, total: 100, fecha: '2026-02-03' }).run()
    expect(coberturaCostos(db, 2024, 2026)).toEqual([
      { anio: 2024, sinDatos: true },
      { anio: 2025, sinDatos: true },
      { anio: 2026, sinDatos: false }
    ])
  })
})

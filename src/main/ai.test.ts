import { beforeEach, describe, expect, it } from 'vitest'
import { leerUso, resumenAi, type EjecutarUso, type Fuente } from './ai'
import { contacto, db, reiniciarDb } from './db/test-db'
import { costos, cotizaciones } from './db/schema'

beforeEach(reiniciarDb)

const HOY = '2026-09-22'
const AHORA = '2026-09-22T15:00:00.000Z'

const AURA = '-Users-dmm-Desktop-DMM-OS-Proyectos-Aura'
const NETDECKR = '-Users-dmm-Desktop-DMM-OS-Proyectos-Netdeckr'

interface Modelo {
  modelo: string
  entrada?: number
  salida?: number
  cacheEscritura?: number
  cacheLectura?: number
  costo?: number
}

/** A day of one project as `ccusage claude daily --json --instances --breakdown` prints it. */
const diaCc = (date: string, modelos: Modelo[]) => ({
  date,
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  totalTokens: 0,
  totalCost: 0,
  modelsUsed: modelos.map((m) => m.modelo),
  modelBreakdowns: modelos.map((m) => ({
    modelName: m.modelo,
    inputTokens: m.entrada ?? 0,
    outputTokens: m.salida ?? 0,
    cacheCreationTokens: m.cacheEscritura ?? 0,
    cacheReadTokens: m.cacheLectura ?? 0,
    cost: m.costo ?? 0
  }))
})

const ccusage = (projects: Record<string, ReturnType<typeof diaCc>[]>) => JSON.stringify({ projects, totals: {} })

/** What `rtk gain --daily --format json` prints. */
const rtk = (dias: Record<string, number>) =>
  JSON.stringify({
    summary: { total_saved: Object.values(dias).reduce((s, n) => s + n, 0) },
    daily: Object.entries(dias).map(([date, saved_tokens]) => ({ date, commands: 1, input_tokens: 0, output_tokens: 0, saved_tokens, savings_pct: 0 }))
  })

const USO = ccusage({
  [AURA]: [
    diaCc('2026-08-30', [{ modelo: 'claude-sonnet-4-5', entrada: 100, salida: 200, cacheEscritura: 300, cacheLectura: 400, costo: 1.25 }]),
    diaCc('2026-09-21', [
      { modelo: 'claude-opus-5', entrada: 1_000, salida: 2_000, cacheEscritura: 3_000, cacheLectura: 4_000, costo: 10.5 },
      { modelo: 'claude-haiku-4-5', entrada: 10, salida: 20, costo: 0.004 }
    ])
  ],
  [NETDECKR]: [diaCc('2026-09-22', [{ modelo: 'claude-opus-5', entrada: 500, salida: 500, costo: 2.1 }])]
})

const AHORRO = rtk({ '2026-08-30': 1_000, '2026-09-21': 9_000 })

/** A runner answering each source with its fixture, or failing with its error. */
const fijo =
  (salidas: Partial<Record<Fuente, string | Error>>): EjecutarUso =>
  async (fuente) => {
    const salida = salidas[fuente]
    if (salida === undefined) throw new Error(`no se encontró ${fuente}`)
    if (salida instanceof Error) throw salida
    return salida
  }

const leer = (salidas: Partial<Record<Fuente, string | Error>> = { ccusage: USO, rtk: AHORRO }, ahora = AHORA) =>
  leerUso(db, fijo(salidas), ahora)

describe('leerUso', () => {
  it('stores CC Usage and RTK output, so the totals count it', async () => {
    await leer()
    expect(resumenAi(db, 'todo', HOY)).toMatchObject({
      tokens: 1_000 + 10_000 + 30 + 1_000,
      tokensAhorrados: 10_000,
      // 1.25 + 10.50 + 0.004 (a fraction of a cent) + 2.10 USD
      costoApiUsd: 125 + 1_050 + 0 + 210
    })
  })

  it('gives the same totals when read again', async () => {
    await leer()
    const una = resumenAi(db, 'todo', HOY)
    await leer()
    expect(resumenAi(db, 'todo', HOY)).toEqual(una)
  })

  it('replaces the days a re-read covers and keeps the ones it no longer sees', async () => {
    await leer()
    // Claude Code has since pruned August's transcripts, and today went on.
    await leer({
      ccusage: ccusage({ [NETDECKR]: [diaCc('2026-09-22', [{ modelo: 'claude-opus-5', entrada: 2_000, salida: 2_000, costo: 4 }])] }),
      rtk: rtk({ '2026-09-21': 9_500 })
    })
    expect(resumenAi(db, 'todo', HOY)).toMatchObject({
      tokens: 1_000 + 10_000 + 30 + 4_000,
      tokensAhorrados: 1_000 + 9_500,
      costoApiUsd: 125 + 1_050 + 400
    })
  })

  it('records when usage was last read, and nothing to warn about', async () => {
    expect(resumenAi(db, 'mes', HOY)).toMatchObject({ ultimoEscaneo: null, avisos: [] })
    expect(await leer()).toEqual({ ultimoEscaneo: AHORA, avisos: [] })
    expect(resumenAi(db, 'mes', HOY)).toMatchObject({ ultimoEscaneo: AHORA, avisos: [] })
  })

  it('still reads RTK when CC Usage is missing, and says why CC Usage was not read', async () => {
    const lectura = await leer({ ccusage: new Error('no está instalado (no se encontró ccusage)'), rtk: AHORRO })
    expect(lectura.avisos).toEqual(['CC Usage: no está instalado (no se encontró ccusage)'])
    expect(resumenAi(db, 'todo', HOY)).toMatchObject({ tokens: 0, tokensAhorrados: 10_000, ultimoEscaneo: AHORA, avisos: lectura.avisos })
  })

  it('still reads CC Usage when RTK output is not what it expects', async () => {
    const lectura = await leer({ ccusage: USO, rtk: '{"summary":' })
    expect(lectura.avisos).toEqual([expect.stringMatching(/^RTK: .*formato/)])
    expect(resumenAi(db, 'todo', HOY)).toMatchObject({ tokens: 12_030, tokensAhorrados: 0 })
  })

  it('keeps the last scan and the stored usage when neither source can be read', async () => {
    await leer()
    const lectura = await leer({ ccusage: new Error('falló'), rtk: new Error('falló') }, '2026-09-23T10:00:00.000Z')
    expect(lectura).toEqual({ ultimoEscaneo: AHORA, avisos: ['CC Usage: falló', 'RTK: falló'] })
    expect(resumenAi(db, 'todo', HOY)).toMatchObject({ tokens: 12_030, tokensAhorrados: 10_000 })
  })

  it('forgets a warning once its source reads again', async () => {
    await leer({ ccusage: new Error('falló'), rtk: AHORRO })
    expect((await leer()).avisos).toEqual([])
    expect(resumenAi(db, 'mes', HOY).avisos).toEqual([])
  })
})

describe('resumenAi', () => {
  beforeEach(() => leer())

  it('Este mes counts only this month to today', () => {
    expect(resumenAi(db, 'mes', HOY)).toMatchObject({
      periodo: 'mes',
      tokens: 10_000 + 30 + 1_000,
      tokensAhorrados: 9_000,
      costoApiUsd: 1_050 + 210
    })
  })

  it('gives the saving as a share of used plus saved', () => {
    expect(resumenAi(db, 'mes', HOY).ahorro).toBeCloseTo(9_000 / (11_030 + 9_000))
    expect(resumenAi(db, 'mes', '2026-10-01')).toMatchObject({ tokens: 0, tokensAhorrados: 0, ahorro: null })
  })

  it('shows the API cost in USD only while the app has no tipo de cambio', () => {
    expect(resumenAi(db, 'todo', HOY)).toMatchObject({ costoApiUsd: 1_385, costoApiMxn: null, tipoCambio: null })
  })

  it('converts the API cost to pesos at the most recent tipo de cambio recorded', () => {
    const { id } = contacto()
    db.insert(cotizaciones)
      .values({ contactoId: id, folio: 1, categoria: 'ai', estado: 'aceptada', fecha: '2026-06-01', moneda: 'USD', tipoCambio: 17.5 })
      .run()
    // A USD subscription received later, at 18.40 pesos per dollar.
    db.insert(costos)
      .values({ nombre: 'Claude Pro', categoria: 'mensual', fecha: '2026-09-18', subtotal: 36_800, iva: 0, total: 36_800, montoOriginal: 2_000, monedaOriginal: 'USD' })
      .run()
    expect(resumenAi(db, 'todo', HOY)).toMatchObject({ costoApiUsd: 1_385, tipoCambio: 18.4, costoApiMxn: Math.round(1_385 * 18.4) })
  })
})

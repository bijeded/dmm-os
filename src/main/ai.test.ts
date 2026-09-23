import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { leerUso, resumenAi, type EjecutarUso, type Fuente } from './ai'
import { ajustes, contacto, db, reiniciarDb } from './db/test-db'
import { costos, cotizaciones, ingresos, proyectos, ubicacionesArchivo, usoTokens } from './db/schema'
import { resumenFinanzas } from './finanzas'
import { nuevoCosto, reembolsar } from './movimientos'
import type { CostoNuevo } from '../shared/dominio'

beforeEach(reiniciarDb)

const HOY = '2026-09-22'
const AHORA = '2026-09-22T15:00:00.000Z'

const ROOT = '/Users/dmm/Desktop/DMM OS'
/** The DMM OS root on this machine's disk, where Proyecto folders are checked. */
const DISCO = mkdtempSync(join(tmpdir(), 'dmm-ai-'))
afterAll(() => rmSync(DISCO, { recursive: true, force: true }))
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

const USO_AURA = [
  diaCc('2026-08-30', [{ modelo: 'claude-sonnet-4-5', entrada: 100, salida: 200, cacheEscritura: 300, cacheLectura: 400, costo: 1.25 }]),
  diaCc('2026-09-21', [
    { modelo: 'claude-opus-5', entrada: 1_000, salida: 2_000, cacheEscritura: 3_000, cacheLectura: 4_000, costo: 10.5 },
    { modelo: 'claude-haiku-4-5', entrada: 10, salida: 20, costo: 0.004 }
  ])
]

const USO = ccusage({
  [AURA]: USO_AURA,
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
  leerUso(db, ajustes, ROOT, fijo(salidas), ahora)

describe('leerUso', () => {
  it('stores CC Usage and RTK output, so the totals count it', async () => {
    await leer()
    expect(resumenAi(db, ajustes, DISCO, 'todo', HOY)).toMatchObject({
      tokens: 1_000 + 10_000 + 30 + 1_000,
      tokensAhorrados: 10_000,
      // 1.25 + 10.50 + 0.004 (a fraction of a cent) + 2.10 USD
      costoApiUsd: 125 + 1_050 + 0 + 210
    })
  })

  it('gives the same totals when read again', async () => {
    await leer()
    const una = resumenAi(db, ajustes, DISCO, 'todo', HOY)
    await leer()
    expect(resumenAi(db, ajustes, DISCO, 'todo', HOY)).toEqual(una)
  })

  it('replaces the days a re-read covers and keeps the ones it no longer sees', async () => {
    await leer()
    // Claude Code has since pruned Aura's transcripts, a Netdeckr one from the 21st turned up, and today went on.
    await leer({
      ccusage: ccusage({
        [NETDECKR]: [
          diaCc('2026-09-21', [{ modelo: 'claude-opus-5', entrada: 250, salida: 250, costo: 1 }]),
          diaCc('2026-09-22', [{ modelo: 'claude-opus-5', entrada: 2_000, salida: 2_000, costo: 4 }])
        ]
      }),
      rtk: rtk({ '2026-09-21': 9_500 })
    })
    expect(resumenAi(db, ajustes, DISCO, 'todo', HOY)).toMatchObject({
      tokens: 1_000 + 10_000 + 30 + 500 + 4_000,
      tokensAhorrados: 1_000 + 9_500,
      costoApiUsd: 125 + 1_050 + 100 + 400
    })
  })

  it('keeps each folder relative to the DMM OS root, so its usage survives a move to a new Mac', async () => {
    await leer({ ccusage: ccusage({ [AURA]: USO_AURA, '-Users-dmm-Desktop-DMM-OS': USO_AURA, '-Users-dmm-Desktop-Cowork-Notas': USO_AURA }), rtk: AHORRO })
    const carpetas = new Set(db.select({ carpeta: usoTokens.carpeta }).from(usoTokens).all().map((f) => f.carpeta))
    expect([...carpetas].sort()).toEqual(['', '-Users-dmm-Desktop-Cowork-Notas', 'Proyectos-Aura'])
  })

  it('records when usage was last read, and nothing to warn about', async () => {
    expect(resumenAi(db, ajustes, DISCO, 'mes', HOY)).toMatchObject({ ultimoEscaneo: null, avisos: [] })
    expect(await leer()).toEqual({ ultimoEscaneo: AHORA, avisos: [] })
    expect(resumenAi(db, ajustes, DISCO, 'mes', HOY)).toMatchObject({ ultimoEscaneo: AHORA, avisos: [] })
  })

  it('still reads RTK when CC Usage is missing, and says why CC Usage was not read', async () => {
    const lectura = await leer({ ccusage: new Error('no está instalado (no se encontró ccusage)'), rtk: AHORRO })
    expect(lectura.avisos).toEqual(['CC Usage: no está instalado (no se encontró ccusage)'])
    expect(resumenAi(db, ajustes, DISCO, 'todo', HOY)).toMatchObject({ tokens: 0, tokensAhorrados: 10_000, ultimoEscaneo: AHORA, avisos: lectura.avisos })
  })

  it('still reads CC Usage when RTK output is not what it expects', async () => {
    const lectura = await leer({ ccusage: USO, rtk: '{"summary":' })
    expect(lectura.avisos).toEqual([expect.stringMatching(/^RTK: .*formato/)])
    expect(resumenAi(db, ajustes, DISCO, 'todo', HOY)).toMatchObject({ tokens: 12_030, tokensAhorrados: 0 })
  })

  it('keeps the last scan and the stored usage when neither source can be read', async () => {
    await leer()
    const lectura = await leer({ ccusage: new Error('falló'), rtk: new Error('falló') }, '2026-09-23T10:00:00.000Z')
    expect(lectura).toEqual({ ultimoEscaneo: AHORA, avisos: ['CC Usage: falló', 'RTK: falló'] })
    expect(resumenAi(db, ajustes, DISCO, 'todo', HOY)).toMatchObject({ tokens: 12_030, tokensAhorrados: 10_000 })
  })

  it('forgets a warning once its source reads again', async () => {
    await leer({ ccusage: new Error('falló'), rtk: AHORRO })
    expect((await leer()).avisos).toEqual([])
    expect(resumenAi(db, ajustes, DISCO, 'mes', HOY).avisos).toEqual([])
  })
})

describe('resumenAi', () => {
  beforeEach(() => leer())

  it('Este mes counts only this month to today', () => {
    expect(resumenAi(db, ajustes, DISCO, 'mes', HOY)).toMatchObject({
      periodo: 'mes',
      tokens: 10_000 + 30 + 1_000,
      tokensAhorrados: 9_000,
      costoApiUsd: 1_050 + 210
    })
  })

  it('gives the saving as a share of used plus saved', () => {
    expect(resumenAi(db, ajustes, DISCO, 'mes', HOY).ahorro).toBeCloseTo(9_000 / (11_030 + 9_000))
    expect(resumenAi(db, ajustes, DISCO, 'mes', '2026-10-01')).toMatchObject({ tokens: 0, tokensAhorrados: 0, ahorro: null })
  })

  it('shows the API cost in USD only while the app has no tipo de cambio', () => {
    expect(resumenAi(db, ajustes, DISCO, 'todo', HOY)).toMatchObject({ costoApiUsd: 1_385, costoApiMxn: null, tipoCambio: null })
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
    expect(resumenAi(db, ajustes, DISCO, 'todo', HOY)).toMatchObject({ costoApiUsd: 1_385, tipoCambio: 18.4, costoApiMxn: Math.round(1_385 * 18.4) })
  })
})

describe('Tokens por modelo', () => {
  beforeEach(() => leer())

  const uso = (proveedor: string, modelo: string, dia: string, tokens: number, costoUsd: number) =>
    db.insert(usoTokens).values({ dia, carpeta: '', proveedor, modelo, tokensEntrada: tokens, tokensSalida: 0, tokensCacheEscritura: 0, tokensCacheLectura: 0, costoUsd }).run()

  it('lists every model ever seen by its family, with zero in a period it was not used', () => {
    expect(resumenAi(db, ajustes, DISCO, 'todo', HOY).modelos).toEqual([
      { proveedor: 'claude', familia: 'haiku', tokens: 30, costoUsd: 0 },
      { proveedor: 'claude', familia: 'sonnet', tokens: 1_000, costoUsd: 125 },
      { proveedor: 'claude', familia: 'opus', tokens: 10_000 + 1_000, costoUsd: 1_050 + 210 }
    ])
    expect(resumenAi(db, ajustes, DISCO, 'mes', HOY).modelos).toEqual([
      { proveedor: 'claude', familia: 'haiku', tokens: 30, costoUsd: 0 },
      { proveedor: 'claude', familia: 'sonnet', tokens: 0, costoUsd: 0 },
      { proveedor: 'claude', familia: 'opus', tokens: 11_000, costoUsd: 1_260 }
    ])
  })

  it('adds up a family’s versions and groups the models by provider', () => {
    uso('openai', 'gpt-5', '2026-09-10', 400, 30)
    uso('claude', 'claude-3-5-sonnet-20241022', '2026-09-10', 500, 40)
    uso('claude', 'claude-fable-5-1', '2026-09-11', 700, 90)
    expect(resumenAi(db, ajustes, DISCO, 'mes', HOY).modelos).toEqual([
      { proveedor: 'claude', familia: 'haiku', tokens: 30, costoUsd: 0 },
      { proveedor: 'claude', familia: 'sonnet', tokens: 500, costoUsd: 40 },
      { proveedor: 'claude', familia: 'opus', tokens: 11_000, costoUsd: 1_260 },
      { proveedor: 'claude', familia: 'fable', tokens: 700, costoUsd: 90 },
      { proveedor: 'openai', familia: 'gpt', tokens: 400, costoUsd: 30 }
    ])
  })

  it('is empty before any usage is read', () => {
    reiniciarDb()
    expect(resumenAi(db, ajustes, DISCO, 'todo', HOY).modelos).toEqual([])
  })
})

describe('Suscripciones', () => {
  const nuevo = (cambios: Partial<CostoNuevo>) =>
    nuevoCosto(
      db,
      { nombre: 'Hosting', proveedor: 'Hostinger', referencia: null, categoria: 'unico', proyectoId: null, fecha: '2026-09-10', subtotal: 20_000, conIva: false, parcialidades: null, suscripcionIa: false, pagado: true, ...cambios },
      HOY
    )

  /** A Costo as the Facturas run leaves a received CFDI. */
  const recibido = (proveedor: string, fecha: string, subtotal: number, estado: 'pagado' | 'cancelado' = 'pagado') => {
    const iva = Math.round(subtotal * 0.16)
    return db
      .insert(costos)
      .values({ nombre: `CFDI ${proveedor}`, categoria: 'unico', estado, proveedor, fecha, fechaPago: fecha, subtotal, iva, total: subtotal + iva, cfdiUuid: `${proveedor}-${fecha}` })
      .returning()
      .get()
  }

  beforeEach(() => {
    // Claude Max entered by hand and marked Suscripción de IA: August and September so far.
    nuevo({ nombre: 'Claude Max', proveedor: 'Anthropic', categoria: 'mensual', fecha: '2026-08-05', subtotal: 170_000, suscripcionIa: true })
    // Not from an AI vendor.
    nuevo({ nombre: 'Figma', proveedor: 'Figma', categoria: 'mensual', fecha: '2026-08-07', subtotal: 30_000 })
    nuevo({})
    recibido('Hostinger', '2026-09-11', 10_000)
  })

  it('lists a Costo marked Suscripción de IA as Manual', () => {
    expect(resumenAi(db, ajustes, DISCO, 'mes', HOY).suscripciones).toEqual([
      { id: expect.any(Number), proveedor: 'Anthropic', plan: 'Claude Max', fecha: '2026-09-05', monto: 170_000, origen: 'manual' }
    ])
  })

  it('lists a received CFDI from the proveedor of a marked definición as CFDI recibido', () => {
    const cfdi = recibido('ANTHROPIC', '2026-09-18', 36_000)
    expect(resumenAi(db, ajustes, DISCO, 'mes', HOY).suscripciones).toEqual([
      { id: cfdi.id, proveedor: 'ANTHROPIC', plan: 'CFDI ANTHROPIC', fecha: '2026-09-18', monto: 36_000, origen: 'cfdi' },
      expect.objectContaining({ plan: 'Claude Max', origen: 'manual' })
    ])
  })

  it('lists a one-off Costo marked Suscripción de IA as Manual', () => {
    nuevo({ nombre: 'ChatGPT Plus', proveedor: 'OpenAI', fecha: '2026-09-12', subtotal: 40_000, suscripcionIa: true })
    expect(resumenAi(db, ajustes, DISCO, 'mes', HOY).suscripciones).toEqual([
      { id: expect.any(Number), proveedor: 'OpenAI', plan: 'ChatGPT Plus', fecha: '2026-09-12', monto: 40_000, origen: 'manual' },
      expect.objectContaining({ plan: 'Claude Max' })
    ])
  })

  it('matches a received CFDI by the vendor’s legal name', () => {
    nuevo({ nombre: 'ChatGPT Plus', proveedor: 'OpenAI', fecha: '2026-08-12', subtotal: 40_000, suscripcionIa: true })
    recibido('ANTHROPIC, PBC', '2026-09-18', 36_000)
    recibido('OPENAI OPCO LLC', '2026-09-15', 40_000)
    // Starts with the same letters, but is another company.
    recibido('ANTHROPOLOGIE SA DE CV', '2026-09-16', 50_000)
    expect(resumenAi(db, ajustes, DISCO, 'mes', HOY).suscripciones.map((s) => [s.proveedor, s.origen])).toEqual([
      ['ANTHROPIC, PBC', 'cfdi'],
      ['OPENAI OPCO LLC', 'cfdi'],
      ['Anthropic', 'manual']
    ])
  })

  it('leaves cancelled Costos out', () => {
    recibido('Anthropic', '2026-09-19', 99_000, 'cancelado')
    expect(resumenAi(db, ajustes, DISCO, 'mes', HOY).suscripciones.map((s) => s.plan)).toEqual(['Claude Max'])
  })

  it('totals the rows it lists, for Este mes and Todo el tiempo', () => {
    recibido('Anthropic', '2026-09-18', 36_000)
    const mes = resumenAi(db, ajustes, DISCO, 'mes', HOY)
    expect(mes.suscripciones.map((s) => s.fecha)).toEqual(['2026-09-18', '2026-09-05'])
    expect(mes.suscripcionesTotal).toBe(36_000 + 170_000)
    const todo = resumenAi(db, ajustes, DISCO, 'todo', HOY)
    expect(todo.suscripciones.map((s) => s.fecha)).toEqual(['2026-09-18', '2026-09-05', '2026-08-05'])
    expect(todo.suscripcionesTotal).toBe(36_000 + 170_000 + 170_000)
  })

  it('shows the same Costos Finanzas does, and leaves its totals as they were', () => {
    recibido('Anthropic', '2026-09-18', 36_000)
    const antes = resumenFinanzas(db, 'todo', HOY, 30)
    const { suscripciones } = resumenAi(db, ajustes, DISCO, 'todo', HOY)
    expect(resumenFinanzas(db, 'todo', HOY, 30)).toEqual(antes)
    const enFinanzas = antes.costos.map((c) => c.id)
    for (const { id } of suscripciones) expect(enFinanzas.filter((f) => f === id)).toHaveLength(1)
  })
})

/** A Proyecto AI; with `ruta`, its folder is recorded there. Without a Contacto it is personal. */
function proyectoAi(
  nombre: string,
  {
    contactoId = null,
    cotizacionId = null,
    fechaInicio = '2026-04-10',
    estado = 'en_curso',
    ruta = null,
    tipo = 'proyectos'
  }: {
    contactoId?: number | null
    cotizacionId?: number | null
    fechaInicio?: string
    estado?: 'en_curso' | 'pausado' | 'completado' | 'cancelado'
    ruta?: string | null
    tipo?: 'proyectos' | 'archivo'
  } = {}
) {
  const p = db
    .insert(proyectos)
    .values({ nombre, etiqueta: contactoId === null ? 'personal' : 'cliente', contactoId, cotizacionId, categoria: 'ai', fechaInicio, estado })
    .returning()
    .get()
  if (ruta) db.insert(ubicacionesArchivo).values({ proyectoId: p.id, tipo, rutaRelativa: ruta }).run()
  return p
}

let folio = 500

/** An accepted Cotización of `subtotal`: in pesos, or with `tipoCambio` in USD cents. */
const cotizacionAceptada = (contactoId: number, subtotal: number, { tipoCambio, categoria = 'ai' }: { tipoCambio?: number; categoria?: 'ai' | 'ecommerce' } = {}) =>
  db
    .insert(cotizaciones)
    .values({ contactoId, folio: folio++, categoria, estado: 'aceptada', fecha: '2026-03-01', moneda: tipoCambio ? 'USD' : 'MXN', tipoCambio, subtotal, total: subtotal })
    .returning()
    .get()

describe('Proyectos AI', () => {
  let aura: typeof proyectos.$inferSelect
  let netdeckr: typeof proyectos.$inferSelect

  beforeEach(async () => {
    const hotel = contacto('Hotel Aura')
    aura = proyectoAi('Aura', { contactoId: hotel.id, ruta: 'Proyectos/Aura' })
    netdeckr = proyectoAi('Netdeckr', { ruta: 'Proyectos/Netdeckr' })
    proyectoAi('Chatbot Terra', { contactoId: contacto('Grupo Terra').id, estado: 'pausado' })
    // Not AI work.
    db.insert(proyectos).values({ nombre: 'Tienda', contactoId: hotel.id, categoria: 'ecommerce' }).run()
    await leer()
  })

  const fila = (nombre: string, periodo: 'mes' | 'todo' = 'todo') => resumenAi(db, ajustes, DISCO, periodo, HOY).proyectos.find((p) => p.nombre === nombre)!

  it('lists only Proyectos AI, by name ascending', () => {
    expect(resumenAi(db, ajustes, DISCO, 'todo', HOY).proyectos.map((p) => p.nombre)).toEqual(['Aura', 'Chatbot Terra', 'Netdeckr'])
  })

  it('shows a client one with its referencia and Contacto, and a personal one with neither', () => {
    expect(fila('Aura')).toMatchObject({ id: aura.id, referencia: `PRY-00${aura.id}`, etiqueta: 'cliente', contacto: 'Hotel Aura', categoria: 'ai', estado: 'en_curso' })
    expect(fila('Netdeckr')).toMatchObject({ id: netdeckr.id, referencia: null, etiqueta: 'personal', contactoId: null, contacto: null })
    expect(fila('Chatbot Terra')).toMatchObject({ estado: 'pausado', contacto: 'Grupo Terra' })
  })

  it('links the usage in its folder to it, with the models it used, for each period', () => {
    expect(fila('Aura')).toMatchObject({ tokens: 1_000 + 10_000 + 30, costoUsd: 125 + 1_050, modelos: ['haiku', 'sonnet', 'opus'] })
    expect(fila('Aura', 'mes')).toMatchObject({ tokens: 10_030, costoUsd: 1_050, modelos: ['haiku', 'opus'] })
    expect(fila('Netdeckr', 'mes')).toMatchObject({ tokens: 1_000, costoUsd: 210, modelos: ['opus'] })
    expect(fila('Chatbot Terra')).toMatchObject({ tokens: 0, costoUsd: 0, modelos: [] })
  })

  it('links usage under its folder to it, and the rest to Sin proyecto', async () => {
    await leer({
      ccusage: ccusage({
        [AURA]: USO_AURA,
        [`${AURA}-web-src`]: [diaCc('2026-09-20', [{ modelo: 'claude-opus-5', entrada: 70, costo: 0.5 }])],
        // Starts like Aura's folder, but is another one.
        [`${AURA}lia`]: [diaCc('2026-09-20', [{ modelo: 'claude-opus-5', entrada: 5, costo: 0.1 }])],
        '-Users-dmm-Desktop-DMM-OS': [diaCc('2026-09-20', [{ modelo: 'claude-sonnet-4-5', entrada: 200, costo: 0.2 }])],
        '-Users-dmm-Desktop-Notas': [diaCc('2026-09-20', [{ modelo: 'claude-haiku-4-5', entrada: 300, costo: 0.3 }])]
      }),
      rtk: AHORRO
    })
    const r = resumenAi(db, ajustes, DISCO, 'mes', HOY)
    expect(r.proyectos.find((p) => p.nombre === 'Aura')).toMatchObject({ tokens: 10_030 + 70, costoUsd: 1_050 + 50 })
    // Netdeckr's usage from the first read is still there.
    expect(r.sinProyecto).toEqual({ tokens: 5 + 200 + 300, costoUsd: 10 + 20 + 30, costoApiMxn: null })
  })

  it('gives each row’s API cost in pesos too, at the most recent tipo de cambio', () => {
    expect(fila('Aura')).toMatchObject({ costoUsd: 1_175, costoApiMxn: null })
    db.insert(costos)
      .values({ nombre: 'Claude Pro', categoria: 'mensual', fecha: '2026-09-18', subtotal: 36_800, iva: 0, total: 36_800, montoOriginal: 2_000, monedaOriginal: 'USD' })
      .run()
    expect(fila('Aura')).toMatchObject({ costoUsd: 1_175, costoApiMxn: Math.round(1_175 * 18.4) })
    expect(fila('Chatbot Terra')).toMatchObject({ costoUsd: 0, costoApiMxn: 0 })
  })

  it('gives a subfolder to the Proyecto whose folder it is, not to the one it sits under', async () => {
    const web = proyectoAi('Aura web', { contactoId: aura.contactoId, ruta: 'Proyectos/Aura/web' })
    await leer({ ccusage: ccusage({ [`${AURA}-web`]: [diaCc('2026-09-20', [{ modelo: 'claude-opus-5', entrada: 70 }])] }), rtk: AHORRO })
    expect(fila('Aura web', 'mes')).toMatchObject({ id: web.id, tokens: 70 })
    expect(fila('Aura', 'mes').tokens).toBe(10_030)
  })

  it('re-links usage when a Proyecto’s folder is renamed or moved, without reading usage again', () => {
    const mover = (ruta: string) => db.update(ubicacionesArchivo).set({ rutaRelativa: ruta }).where(eq(ubicacionesArchivo.proyectoId, aura.id)).run()
    mover('Proyectos/Hotel Aura')
    expect(fila('Aura').tokens).toBe(0)
    expect(resumenAi(db, ajustes, DISCO, 'todo', HOY).sinProyecto.tokens).toBe(11_030)
    mover('Proyectos/Aura')
    expect(fila('Aura').tokens).toBe(11_030)
    expect(resumenAi(db, ajustes, DISCO, 'todo', HOY).sinProyecto.tokens).toBe(0)
  })

  it('keeps its usage once its folder is archived', () => {
    db.insert(ubicacionesArchivo).values({ proyectoId: netdeckr.id, tipo: 'archivo', rutaRelativa: 'Archivo/Proyectos/Netdeckr' }).run()
    expect(fila('Netdeckr').tokens).toBe(1_000)
  })

  it('shows each folder as Proyectos does: Disponible, Archivado, No disponible or none', () => {
    mkdirSync(join(DISCO, 'Proyectos', 'Aura'), { recursive: true })
    proyectoAi('Voz', { ruta: 'Archivo/Proyectos/Voz', tipo: 'archivo', estado: 'completado' })
    expect(fila('Aura').carpeta).toEqual({ estado: 'disponible', ruta: 'Proyectos/Aura', abrible: true })
    expect(fila('Netdeckr').carpeta).toEqual({ estado: 'no_disponible', ruta: 'Proyectos/Netdeckr', abrible: false })
    expect(fila('Voz').carpeta).toEqual({ estado: 'archivado', ruta: 'Archivo/Proyectos/Voz', abrible: false })
    expect(fila('Chatbot Terra').carpeta).toEqual({ estado: 'sin_carpeta', ruta: null, abrible: false })
  })
})

describe('Ingreso cards', () => {
  /** An Ingreso of a Proyecto AI, paid on `fecha` unless `pendiente`. */
  const ingreso = (proyectoId: number, fecha: string, subtotal: number, estado: 'pagado' | 'pendiente' = 'pagado') =>
    db
      .insert(ingresos)
      .values({ categoria: 'sin_factura', estado, subtotal, iva: 0, total: subtotal, proyectoId, fechaRegistro: fecha, fechaPago: estado === 'pagado' ? fecha : null })
      .returning()
      .get()

  let aura: typeof proyectos.$inferSelect
  let terra: typeof proyectos.$inferSelect

  beforeEach(() => {
    const hotel = contacto('Hotel Aura')
    const grupo = contacto('Grupo Terra')
    aura = proyectoAi('Aura', { contactoId: hotel.id, cotizacionId: cotizacionAceptada(hotel.id, 5_800_000).id, fechaInicio: '2026-04-10' })
    // Quoted in USD: 1,000.00 USD, accepted at 18.50.
    terra = proyectoAi('Chatbot Terra', { contactoId: grupo.id, cotizacionId: cotizacionAceptada(grupo.id, 100_000, { tipoCambio: 18.5 }).id, fechaInicio: '2026-09-03' })
    proyectoAi('Netdeckr', { fechaInicio: '2026-09-01' })
    // Not AI work.
    const tienda = db
      .insert(proyectos)
      .values({ nombre: 'Tienda', contactoId: hotel.id, cotizacionId: cotizacionAceptada(hotel.id, 9_900_000, { categoria: 'ecommerce' }).id, categoria: 'ecommerce', fechaInicio: '2026-09-05' })
      .returning()
      .get()
    ingreso(tienda.id, '2026-09-06', 9_900_000)
  })

  it('Ingreso proyectos AI adds up the accepted Cotizaciones of Proyectos AI started in the period, in pesos', () => {
    expect(resumenAi(db, ajustes, DISCO, 'mes', HOY).ingresoProyectos).toBe(1_850_000)
    expect(resumenAi(db, ajustes, DISCO, 'todo', HOY).ingresoProyectos).toBe(5_800_000 + 1_850_000)
  })

  it('counts a Proyecto with no start date in Todo el tiempo only', () => {
    db.update(proyectos).set({ fechaInicio: null }).where(eq(proyectos.id, aura.id)).run()
    expect(resumenAi(db, ajustes, DISCO, 'mes', HOY).ingresoProyectos).toBe(1_850_000)
    expect(resumenAi(db, ajustes, DISCO, 'todo', HOY).ingresoProyectos).toBe(5_800_000 + 1_850_000)
  })

  it('leaves out a cancelled Cotización', () => {
    db.update(cotizaciones).set({ estado: 'cancelada' }).where(eq(cotizaciones.id, terra.cotizacionId!)).run()
    expect(resumenAi(db, ajustes, DISCO, 'mes', HOY).ingresoProyectos).toBe(0)
  })

  it('Ingreso AI adds up the paid Ingresos of Proyectos AI in the period, net of Reembolsos', () => {
    ingreso(aura.id, '2026-05-02', 2_900_000)
    const septiembre = ingreso(aura.id, '2026-09-02', 1_000_000)
    ingreso(terra.id, '2026-09-10', 800_000)
    ingreso(terra.id, '2026-09-12', 500_000, 'pendiente')
    reembolsar(db, septiembre.id, 200_000, HOY)
    expect(resumenAi(db, ajustes, DISCO, 'mes', HOY).ingresoAi).toBe(1_000_000 + 800_000 - 200_000)
    expect(resumenAi(db, ajustes, DISCO, 'todo', HOY).ingresoAi).toBe(2_900_000 + 1_000_000 + 800_000 - 200_000)
  })

  it('counts a Reembolso in the period it was given back', () => {
    const mayo = ingreso(aura.id, '2026-05-02', 2_900_000)
    reembolsar(db, mayo.id, 900_000, HOY)
    expect(resumenAi(db, ajustes, DISCO, 'mes', HOY).ingresoAi).toBe(-900_000)
  })

  it('is zero with no AI income', () => {
    reiniciarDb()
    expect(resumenAi(db, ajustes, DISCO, 'todo', HOY)).toMatchObject({ ingresoProyectos: 0, ingresoAi: 0 })
  })
})

describe('Asignación de costo', () => {
  /** Claude Max, marked Suscripción de IA: $360 a month since April, on the 5th. */
  const suscripcion = () =>
    nuevoCosto(
      db,
      { nombre: 'Claude Max', proveedor: 'Anthropic', referencia: null, categoria: 'mensual', proyectoId: null, fecha: '2026-04-05', subtotal: 36_000, conIva: false, parcialidades: null, suscripcionIa: true, pagado: true },
      HOY
    )

  /** This month's usage: `tokens` per folder, all on the 20th. */
  const usoDelMes = (tokens: Record<string, number>) =>
    leer({
      ccusage: ccusage(Object.fromEntries(Object.entries(tokens).map(([carpeta, entrada]) => [carpeta, [diaCc('2026-09-20', [{ modelo: 'claude-opus-5', entrada }])]]))),
      rtk: AHORRO
    })

  const asignacion = (hoy = HOY) => resumenAi(db, ajustes, DISCO, 'mes', hoy).asignacion

  beforeEach(suscripcion)

  it('leaves out Proyectos AI with no usage while another has some', async () => {
    proyectoAi('Aura', { ruta: 'Proyectos/Aura' })
    proyectoAi('Netdeckr', { ruta: 'Proyectos/Netdeckr' })
    await usoDelMes({ [NETDECKR]: 500 })
    expect(asignacion().filas.map((f) => [f.nombre, f.monto])).toEqual([['Netdeckr', 36_000]])
  })

  it('gives the whole pool to the only Proyecto AI (Aura, April 2026)', async () => {
    const aura = proyectoAi('Aura', { fechaInicio: '2026-04-10', ruta: 'Proyectos/Aura' })
    await leer({ ccusage: ccusage({ [AURA]: [diaCc('2026-04-12', [{ modelo: 'claude-opus-5', entrada: 800 }])] }) })
    expect(asignacion('2026-04-22')).toEqual({
      mes: '2026-04',
      total: 36_000,
      criterio: 'tokens',
      filas: [{ proyectoId: aura.id, nombre: 'Aura', tokens: 800, parte: 1, monto: 36_000 }],
      sinAsignar: 0
    })
  })

  it('keeps Sin proyecto usage out of the split, leaving the pool Sin asignar with no Proyecto AI', async () => {
    // Usage in a folder, but no Proyecto AI to give it to.
    db.insert(proyectos).values({ nombre: 'Tienda', contactoId: contacto().id, categoria: 'ecommerce', fechaInicio: '2026-01-10' }).run()
    await usoDelMes({ [AURA]: 900 })
    expect(asignacion()).toEqual({ mes: '2026-09', total: 36_000, criterio: 'sin_proyectos', filas: [], sinAsignar: 36_000 })
  })

  it('adds up Sin asignar across the months in Todo el tiempo', () => {
    // No Proyecto AI was Abierto en el mes from April to June.
    const aura = proyectoAi('Aura', { fechaInicio: '2026-07-01' })
    const a = resumenAi(db, ajustes, DISCO, 'todo', HOY).asignacion
    expect(a).toMatchObject({ mes: null, total: 6 * 36_000, criterio: null, sinAsignar: 3 * 36_000 })
    expect(a.filas).toEqual([{ proyectoId: aura.id, nombre: 'Aura', tokens: 0, parte: 0.5, monto: 3 * 36_000 }])
  })

  it('is empty with no Suscripciones this month', () => {
    reiniciarDb()
    proyectoAi('Aura')
    expect(asignacion()).toMatchObject({ total: 0, filas: [{ nombre: 'Aura', monto: 0 }], sinAsignar: 0 })
  })

  it('never stores anything, so Finanzas totals and Costos stay as they were', async () => {
    proyectoAi('Aura', { ruta: 'Proyectos/Aura' })
    proyectoAi('Netdeckr', { ruta: 'Proyectos/Netdeckr' })
    await usoDelMes({ [AURA]: 9_100, [NETDECKR]: 6_600 })
    const costosAntes = db.select().from(costos).all()
    const antes = resumenFinanzas(db, 'todo', HOY, 30)
    resumenAi(db, ajustes, DISCO, 'mes', HOY)
    resumenAi(db, ajustes, DISCO, 'todo', HOY)
    expect(resumenFinanzas(db, 'todo', HOY, 30)).toEqual(antes)
    expect(db.select().from(costos).all()).toEqual(costosAntes)
  })

  describe('Costo real', () => {
    let aura: typeof proyectos.$inferSelect
    let netdeckr: typeof proyectos.$inferSelect

    beforeEach(async () => {
      aura = proyectoAi('Aura', { contactoId: contacto('Hotel Aura').id, fechaInicio: '2026-04-10', ruta: 'Proyectos/Aura' })
      netdeckr = proyectoAi('Netdeckr', { fechaInicio: '2026-09-01', ruta: 'Proyectos/Netdeckr' })
      // Aura: 1,000 tokens on Aug 30 and 10,030 in September; Netdeckr: 1,000 in September.
      await leer()
    })

    const costoReal = (nombre: string, periodo: 'mes' | 'todo') => resumenAi(db, ajustes, DISCO, periodo, HOY).proyectos.find((p) => p.nombre === nombre)!.costoReal

    /** A Costo linked to a Proyecto. */
    const ligado = (proyectoId: number, fecha: string, subtotal: number, estado: 'pagado' | 'cancelado' = 'pagado') =>
      db.insert(costos).values({ nombre: 'Hosting', categoria: 'unico', estado, proveedor: 'Hostinger', fecha, subtotal, iva: 0, total: subtotal, proyectoId }).run()

    it('is the period’s Asignación de costo plus the Costos linked to it', () => {
      ligado(aura.id, '2026-09-03', 5_000)
      ligado(aura.id, '2026-06-03', 7_000)
      ligado(aura.id, '2026-09-04', 9_000, 'cancelado')
      // September: 36,000 × 10,030 ÷ 11,030 = 32,736.17 and × 1,000 ÷ 11,030 = 3,263.83.
      expect(costoReal('Aura', 'mes')).toBe(32_736 + 5_000)
      expect(costoReal('Netdeckr', 'mes')).toBe(3_264)
      // April to July Aura was the only Proyecto AI Abierto en el mes, with no usage; August it was the only one with usage.
      expect(costoReal('Aura', 'todo')).toBe(4 * 36_000 + 36_000 + 32_736 + 5_000 + 7_000)
      expect(costoReal('Netdeckr', 'todo')).toBe(3_264)
    })

    it('adds up every month in Todo el tiempo, matching Costo real', () => {
      // April to August Aura takes the whole pool; September is split 32,736 / 3,264.
      const asignado = 5 * 36_000 + 32_736
      expect(resumenAi(db, ajustes, DISCO, 'todo', HOY).asignacion).toEqual({
        mes: null,
        total: 6 * 36_000,
        criterio: null,
        filas: [
          { proyectoId: aura.id, nombre: 'Aura', tokens: 1_000 + 10_030, parte: asignado / (6 * 36_000), monto: asignado },
          { proyectoId: netdeckr.id, nombre: 'Netdeckr', tokens: 1_000, parte: 3_264 / (6 * 36_000), monto: 3_264 }
        ],
        sinAsignar: 0
      })
      expect(costoReal('Aura', 'todo')).toBe(asignado)
    })

    it('does not count a Suscripción linked to it twice', () => {
      nuevoCosto(
        db,
        { nombre: 'API créditos', proveedor: 'OpenAI', referencia: null, categoria: 'unico', proyectoId: aura.id, fecha: '2026-09-02', subtotal: 11_030, conIva: false, parcialidades: null, suscripcionIa: true, pagado: true },
        HOY
      )
      // The pool is now 47,030: 47,030 × 10,030 ÷ 11,030 = 42,766.
      expect(costoReal('Aura', 'mes')).toBe(42_766)
    })

    it('is zero with no pool and nothing linked', () => {
      reiniciarDb()
      proyectoAi('Aura')
      expect(costoReal('Aura', 'todo')).toBe(0)
    })
  })
})

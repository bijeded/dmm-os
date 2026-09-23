import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { and, eq, gte, isNotNull, lte, ne, sql } from 'drizzle-orm'
import type { Ajustes, Db } from './db'
import { ahorroTokens, costos, cotizaciones, ingresos, usoTokens } from './db/schema'
import { convertir } from './dinero'
import { rangos } from './finanzas'
import type { LecturaUso, PeriodoAi, ResumenAi } from '../shared/dominio'

/**
 * AI: token usage imported from CC Usage (tokens and approximate API cost) and RTK (tokens
 * saved). Usage is read on demand, never live: `leerUso` stores it and the AI section reads
 * what is stored. The stored rows are linked to Proyectos when read, not here.
 */

/** The CLIs usage comes from. */
export type Fuente = 'ccusage' | 'rtk'

/** Runs a source's CLI and answers with its JSON output; throws with why when it can't. Tests pass fixtures. */
export type EjecutarUso = (fuente: Fuente) => Promise<string>

const NOMBRES: Record<Fuente, string> = { ccusage: 'CC Usage', rtk: 'RTK' }

const COMANDOS: Record<Fuente, string[]> = {
  ccusage: ['claude', 'daily', '--json', '--instances', '--breakdown'],
  rtk: ['gain', '--daily', '--format', 'json']
}

// An app opened from Finder gets a bare PATH; these are where Homebrew, npm and cargo put CLIs.
const RUTAS_CLI = ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.cargo', 'bin'), join(homedir(), '.local', 'bin')]

/** Runs the installed `ccusage` or `rtk`. */
export const ejecutarCli: EjecutarUso = async (fuente) => {
  const PATH = [process.env.PATH, ...RUTAS_CLI].filter(Boolean).join(delimiter)
  try {
    const { stdout } = await promisify(execFile)(fuente, COMANDOS[fuente], {
      env: { ...process.env, PATH, NO_COLOR: '1' },
      timeout: 120_000,
      maxBuffer: 256 * 1024 * 1024
    })
    return stdout
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string }
    if (err.code === 'ENOENT') throw new Error(`no está instalado (no se encontró \`${fuente}\`)`, { cause: e })
    const detalle = err.stderr?.split('\n').find((l) => l.trim())?.trim() ?? err.message
    throw new Error(`falló: ${detalle}`, { cause: e })
  }
}

const FORMATO = 'devolvió un formato que no se reconoce'

const esDia = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** A count from CLI output; anything that isn't a finite number counts as 0. */
const cuenta = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** How Claude Code names a working directory: every character but letters and digits becomes `-`. */
const nombreClaude = (ruta: string) => ruta.replace(/[^a-zA-Z0-9]/g, '-')

/**
 * A CC Usage project as stored (ADR-0001): relative to the DMM OS root, still in Claude Code's
 * naming (`Proyectos-Aura`, '' for the root itself). A folder outside the root keeps its whole
 * name, which starts with `-`; it can't be a Proyecto's.
 */
function carpetaRelativa(root: string, proyecto: string): string {
  const raiz = nombreClaude(root)
  if (proyecto === raiz) return ''
  return proyecto.startsWith(`${raiz}-`) ? proyecto.slice(raiz.length + 1) : proyecto
}

type FilaUso = typeof usoTokens.$inferInsert

/**
 * `ccusage claude daily --instances --breakdown`: per project, its days, each with its models.
 * Every (day, folder) it lists is covered, even one with no tokens left to store.
 */
function parsearCcusage(root: string, salida: string): { cubiertos: { dia: string; carpeta: string }[]; filas: FilaUso[] } {
  const { projects } = JSON.parse(salida) as { projects?: unknown }
  if (!projects || typeof projects !== 'object') throw new Error(FORMATO)
  const cubiertos = new Map<string, { dia: string; carpeta: string }>()
  const filas = new Map<string, FilaUso & { dolares: number }>()
  for (const [proyecto, entradas] of Object.entries(projects)) {
    if (!Array.isArray(entradas)) throw new Error(FORMATO)
    const carpeta = carpetaRelativa(root, proyecto)
    for (const { date, modelBreakdowns } of entradas as { date?: unknown; modelBreakdowns?: unknown }[]) {
      if (!esDia(date) || !Array.isArray(modelBreakdowns)) throw new Error(FORMATO)
      cubiertos.set(JSON.stringify([date, carpeta]), { dia: date, carpeta })
      for (const m of modelBreakdowns as Record<string, unknown>[]) {
        if (typeof m.modelName !== 'string') throw new Error(FORMATO)
        const clave = JSON.stringify([date, carpeta, m.modelName])
        const fila = filas.get(clave) ?? {
          dia: date,
          carpeta,
          // Everything CC Usage reads under `claude` is Claude Code.
          proveedor: 'claude',
          modelo: m.modelName,
          tokensEntrada: 0,
          tokensSalida: 0,
          tokensCacheEscritura: 0,
          tokensCacheLectura: 0,
          costoUsd: 0,
          dolares: 0
        }
        fila.tokensEntrada += cuenta(m.inputTokens)
        fila.tokensSalida += cuenta(m.outputTokens)
        fila.tokensCacheEscritura += cuenta(m.cacheCreationTokens)
        fila.tokensCacheLectura += cuenta(m.cacheReadTokens)
        fila.dolares += cuenta(m.cost)
        filas.set(clave, fila)
      }
    }
  }
  return {
    cubiertos: [...cubiertos.values()],
    filas: [...filas.values()]
      .map(({ dolares, ...f }) => ({ ...f, costoUsd: Math.round(dolares * 100) }))
      .filter((f) => f.tokensEntrada + f.tokensSalida + f.tokensCacheEscritura + f.tokensCacheLectura > 0 || f.costoUsd > 0)
  }
}

/** `rtk gain --daily`: tokens saved per day. */
function parsearRtk(salida: string): (typeof ahorroTokens.$inferInsert)[] {
  const { daily } = JSON.parse(salida) as { daily?: unknown }
  if (!Array.isArray(daily)) throw new Error(FORMATO)
  return (daily as { date?: unknown; saved_tokens?: unknown }[]).map(({ date, saved_tokens }) => {
    if (!esDia(date) || typeof saved_tokens !== 'number') throw new Error(FORMATO)
    return { dia: date, tokens: saved_tokens }
  })
}

const CLAVE_ESCANEO = 'ai.ultimoEscaneo'
const CLAVE_AVISOS = 'ai.avisos'

const ultimaLectura = (ajustes: Ajustes): LecturaUso => ({
  ultimoEscaneo: ajustes.leer(CLAVE_ESCANEO) ?? null,
  avisos: JSON.parse(ajustes.leer(CLAVE_AVISOS) ?? '[]')
})

/**
 * Reads token usage from CC Usage and RTK and stores it. A re-read replaces what it covers (for
 * CC Usage each day of each folder, for RTK each day), so reading again never counts anything
 * twice, and what a source no longer lists (Claude Code prunes old transcripts) stays as it was.
 * A source that is missing or fails is named in the answer; the other is still read. Último
 * escaneo moves only when a source was read.
 */
export async function leerUso(db: Db, ajustes: Ajustes, root: string, ejecutar: EjecutarUso, ahora: string): Promise<LecturaUso> {
  const avisos: string[] = []
  let fuentesLeidas = 0
  const leer = async <T>(fuente: Fuente, parsear: (salida: string) => T, guardar: (datos: T) => void) => {
    try {
      const datos = parsear(await ejecutar(fuente))
      db.transaction(() => guardar(datos))
      fuentesLeidas++
    } catch (e) {
      const texto = e instanceof SyntaxError ? FORMATO : e instanceof Error ? e.message : String(e)
      avisos.push(`${NOMBRES[fuente]}: ${texto}`)
    }
  }

  await leer('ccusage', (salida) => parsearCcusage(root, salida), ({ cubiertos, filas }) => {
    for (const { dia, carpeta } of cubiertos) db.delete(usoTokens).where(and(eq(usoTokens.dia, dia), eq(usoTokens.carpeta, carpeta))).run()
    for (const fila of filas) db.insert(usoTokens).values(fila).run()
  })
  await leer('rtk', parsearRtk, (filas) => {
    for (const fila of filas) {
      db.insert(ahorroTokens).values(fila).onConflictDoUpdate({ target: ahorroTokens.dia, set: { tokens: fila.tokens } }).run()
    }
  })

  if (fuentesLeidas > 0) ajustes.escribir(CLAVE_ESCANEO, ahora)
  ajustes.escribir(CLAVE_AVISOS, JSON.stringify(avisos))
  return ultimaLectura(ajustes)
}

/**
 * The most recent pesos per USD the app has recorded: a USD Cotización's rate (set when it is
 * accepted), or the rate a USD Ingreso or Costo was recorded at. `null` when there is none.
 */
function tipoCambioReciente(db: Db): number | null {
  const conOriginalUsd = <T extends typeof ingresos | typeof costos>(t: T) =>
    and(eq(t.monedaOriginal, 'USD'), isNotNull(t.montoOriginal), ne(t.montoOriginal, 0))
  const candidatos = [
    ...db
      .select({ fecha: cotizaciones.fecha, tasa: cotizaciones.tipoCambio })
      .from(cotizaciones)
      .where(isNotNull(cotizaciones.tipoCambio))
      .all(),
    ...db
      .select({ fecha: sql<string | null>`coalesce(${ingresos.fechaPago}, ${ingresos.fechaRegistro})`, total: ingresos.total, original: ingresos.montoOriginal })
      .from(ingresos)
      .where(conOriginalUsd(ingresos))
      .all()
      .map(({ fecha, total, original }) => ({ fecha, tasa: total / original! })),
    ...db
      .select({ fecha: costos.fecha, total: costos.total, original: costos.montoOriginal })
      .from(costos)
      .where(conOriginalUsd(costos))
      .all()
      .map(({ fecha, total, original }) => ({ fecha, tasa: total / original! }))
  ].filter((c): c is { fecha: string; tasa: number } => c.fecha !== null && c.tasa !== null && c.tasa > 0)
  if (candidatos.length === 0) return null
  const { tasa } = candidatos.reduce((a, b) => (b.fecha > a.fecha ? b : a))
  return Math.round(tasa * 10_000) / 10_000
}

/** The AI section's figures for `periodo`: Este mes runs, as in Finanzas, from the 1st to `hoy`. */
export function resumenAi(db: Db, ajustes: Ajustes, periodo: PeriodoAi, hoy: string): ResumenAi {
  const { desde, hasta } = rangos('mes', hoy).rango
  const enPeriodo = (dia: typeof usoTokens.dia | typeof ahorroTokens.dia) => (periodo === 'mes' ? and(gte(dia, desde), lte(dia, hasta)) : undefined)
  const uso = db
    .select({
      tokens: sql<number>`coalesce(sum(${usoTokens.tokensEntrada} + ${usoTokens.tokensSalida} + ${usoTokens.tokensCacheEscritura} + ${usoTokens.tokensCacheLectura}), 0)`,
      costoUsd: sql<number>`coalesce(sum(${usoTokens.costoUsd}), 0)`
    })
    .from(usoTokens)
    .where(enPeriodo(usoTokens.dia))
    .get()!
  const { ahorrados } = db
    .select({ ahorrados: sql<number>`coalesce(sum(${ahorroTokens.tokens}), 0)` })
    .from(ahorroTokens)
    .where(enPeriodo(ahorroTokens.dia))
    .get()!
  const tipoCambio = tipoCambioReciente(db)
  return {
    periodo,
    tokens: uso.tokens,
    tokensAhorrados: ahorrados,
    ahorro: uso.tokens + ahorrados > 0 ? ahorrados / (uso.tokens + ahorrados) : null,
    costoApiUsd: uso.costoUsd,
    costoApiMxn: tipoCambio === null ? null : convertir(uso.costoUsd, 'USD', 'MXN', tipoCambio),
    tipoCambio,
    ...ultimaLectura(ajustes)
  }
}

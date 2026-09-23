import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { and, desc, eq, gte, isNotNull, lte, ne, sql, type SQL } from 'drizzle-orm'
import type { Ajustes, Db } from './db'
import { ahorroTokens, contactos, costos, cotizaciones, definicionesCosto, ingresos, proyectos, ubicacionesArchivo, usoTokens } from './db/schema'
import { convertir } from './dinero'
import { rangos } from './finanzas'
import { alDia } from './ledger'
import { clave } from './nombres'
import { carpetaEntre, referenciaProyecto } from './proyectos'
import type { FilaSuscripcion, LecturaUso, PeriodoAi, Rango, ResumenAi, UsoModelo } from '../shared/dominio'

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

/** A proveedor's words, compared as `clave` compares names: `ANTHROPIC, PBC` is `anthropic pbc`. */
const palabras = (proveedor: string | null) => clave(proveedor ?? '').split(' ').filter(Boolean)

/**
 * Whether `proveedor` is the vendor named `marcado`, or its legal name: `OPENAI OPCO LLC` is
 * OpenAI, `ANTHROPOLOGIE SA` is not Anthropic.
 */
const esDelProveedor = (marcado: string[], proveedor: string[]) => marcado.every((p, i) => proveedor[i] === p)

/**
 * Suscripciones: the Costos marked Suscripción de IA (a recurring one through its definición), or
 * from the proveedor of a marked one, under its own name or its legal name (which catches received
 * CFDIs from the same vendor). Read straight from Costos, as Finanzas reads them, never copied;
 * cancelled ones don't count. Newest first.
 */
function suscripciones(db: Db, rango: Rango): FilaSuscripcion[] {
  const definiciones = db
    .select({ id: definicionesCosto.id, proveedor: definicionesCosto.proveedor })
    .from(definicionesCosto)
    .where(eq(definicionesCosto.suscripcionIa, true))
    .all()
  const marcadas = new Set(definiciones.map((d) => d.id))
  const unicos = db.select({ proveedor: costos.proveedor }).from(costos).where(eq(costos.suscripcionIa, true)).all()
  const proveedores = [...definiciones, ...unicos].map((m) => palabras(m.proveedor)).filter((p) => p.length > 0)
  return db
    .select()
    .from(costos)
    .where(and(ne(costos.estado, 'cancelado'), gte(costos.fecha, rango.desde), lte(costos.fecha, rango.hasta)))
    .orderBy(desc(costos.fecha), desc(costos.id))
    .all()
    .filter(
      (c) =>
        c.suscripcionIa ||
        (c.definicionId !== null && marcadas.has(c.definicionId)) ||
        proveedores.some((p) => esDelProveedor(p, palabras(c.proveedor)))
    )
    .map((c) => ({ id: c.id, proveedor: c.proveedor, plan: c.nombre, fecha: c.fecha, monto: c.subtotal, origen: c.cfdiUuid ? 'cfdi' : 'manual' }))
}

/** A usage row's input, output and cache tokens. */
const TOKENS = sql`${usoTokens.tokensEntrada} + ${usoTokens.tokensSalida} + ${usoTokens.tokensCacheEscritura} + ${usoTokens.tokensCacheLectura}`

/** Claude's families, smallest first: the order the chart shows them in. */
const FAMILIAS_CLAUDE = ['haiku', 'sonnet', 'opus', 'fable']

/**
 * A model's family, the first word of its name that isn't its provider or a version:
 * `claude-sonnet-4-5-20250929` and `claude-3-5-sonnet-20241022` are sonnet, `gpt-5` is gpt.
 */
const familia = (proveedor: string, modelo: string) =>
  modelo
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .find((p) => p && p !== proveedor && p !== 'claude' && !/^\d/.test(p)) ?? modelo

const ordenFamilia = (familia: string) => {
  const k = FAMILIAS_CLAUDE.indexOf(familia)
  return k === -1 ? FAMILIAS_CLAUDE.length : k
}

/** The chart's order: by provider, then Claude's families smallest first, then by name. */
const compararModelos = (a: { proveedor: string; familia: string }, b: { proveedor: string; familia: string }) =>
  a.proveedor.localeCompare(b.proveedor) || ordenFamilia(a.familia) - ordenFamilia(b.familia) || a.familia.localeCompare(b.familia)

/**
 * Tokens and API cost per model family in the period. Every family ever seen is listed, with
 * zero when unused, so the chart keeps the same bars across periods. By provider, then Claude's
 * families smallest first, then by name.
 */
function usoPorModelo(db: Db, enPeriodo: SQL | undefined): UsoModelo[] {
  const dentro = enPeriodo ?? sql`1`
  const filas = db
    .select({
      proveedor: usoTokens.proveedor,
      modelo: usoTokens.modelo,
      tokens: sql<number>`coalesce(sum(case when ${dentro} then ${TOKENS} else 0 end), 0)`,
      costoUsd: sql<number>`coalesce(sum(case when ${dentro} then ${usoTokens.costoUsd} else 0 end), 0)`
    })
    .from(usoTokens)
    .groupBy(usoTokens.proveedor, usoTokens.modelo)
    .all()
  const modelos = new Map<string, UsoModelo>()
  for (const f of filas) {
    const suya = familia(f.proveedor, f.modelo)
    const k = JSON.stringify([f.proveedor, suya])
    const m = modelos.get(k) ?? { proveedor: f.proveedor, familia: suya, tokens: 0, costoUsd: 0 }
    m.tokens += f.tokens
    m.costoUsd += f.costoUsd
    modelos.set(k, m)
  }
  return [...modelos.values()].sort(compararModelos)
}

type Ubicacion = typeof ubicacionesArchivo.$inferSelect

/**
 * Which Proyecto a usage folder belongs to: the one whose folder under the DMM OS root (its
 * working folder in `Proyectos/` or its `Archivo/` one) it is at or under, compared in Claude
 * Code's naming as usage is stored. The deepest folder wins, so a Proyecto kept inside another's
 * folder keeps its own usage. `null` is Sin proyecto.
 */
function enlazarUso(ubicaciones: Ubicacion[]): (carpeta: string) => number | null {
  const suyas = ubicaciones
    .filter((u) => u.tipo === 'proyectos' || u.tipo === 'archivo')
    .map((u) => ({ proyectoId: u.proyectoId, carpeta: nombreClaude(u.rutaRelativa.replace(/\/+$/, '')) }))
    .filter((u) => u.carpeta !== '')
    .sort((a, b) => b.carpeta.length - a.carpeta.length)
  return (carpeta) => suyas.find((u) => carpeta === u.carpeta || carpeta.startsWith(`${u.carpeta}-`))?.proyectoId ?? null
}

/**
 * The AI Proyectos by name, each with the period's usage at or under its folder, and the usage
 * no Proyecto's folder holds. Linked here, when read, so a moved or renamed folder re-links.
 */
function proyectosAi(db: Db, root: string, enPeriodo: SQL | undefined): Pick<ResumenAi, 'proyectos' | 'sinProyecto'> {
  const ubicaciones = db.select().from(ubicacionesArchivo).all()
  const enlazar = enlazarUso(ubicaciones)
  const usos = new Map<number | null, { tokens: number; costoUsd: number; modelos: { proveedor: string; familia: string }[] }>()
  const filas = db
    .select({
      carpeta: usoTokens.carpeta,
      proveedor: usoTokens.proveedor,
      modelo: usoTokens.modelo,
      tokens: sql<number>`sum(${TOKENS})`,
      costoUsd: sql<number>`sum(${usoTokens.costoUsd})`
    })
    .from(usoTokens)
    .where(enPeriodo)
    .groupBy(usoTokens.carpeta, usoTokens.proveedor, usoTokens.modelo)
    .all()
  for (const f of filas) {
    const proyectoId = enlazar(f.carpeta)
    const uso = usos.get(proyectoId) ?? { tokens: 0, costoUsd: 0, modelos: [] }
    uso.tokens += f.tokens
    uso.costoUsd += f.costoUsd
    if (f.tokens > 0) uso.modelos.push({ proveedor: f.proveedor, familia: familia(f.proveedor, f.modelo) })
    usos.set(proyectoId, uso)
  }

  const deAi = db
    .select({ p: proyectos, contacto: contactos.nombre })
    .from(proyectos)
    .leftJoin(contactos, eq(contactos.id, proyectos.contactoId))
    .where(eq(proyectos.categoria, 'ai'))
    .all()
    .sort((a, b) => a.p.nombre.localeCompare(b.p.nombre, 'es'))
  const sinProyecto = usos.get(null)
  return {
    proyectos: deAi.map(({ p, contacto }) => {
      const uso = usos.get(p.id)
      const personal = p.etiqueta === 'personal'
      return {
        id: p.id,
        referencia: personal ? null : referenciaProyecto(p.id),
        nombre: p.nombre,
        etiqueta: p.etiqueta,
        contactoId: p.contactoId,
        contacto: personal ? null : contacto,
        clienteFinal: p.clienteFinal,
        categoria: p.categoria,
        fechaInicio: p.fechaInicio,
        estado: p.estado,
        carpeta: carpetaEntre(root, ubicaciones.filter((u) => u.proyectoId === p.id)),
        modelos: [...new Set((uso?.modelos ?? []).sort(compararModelos).map((m) => m.familia))],
        tokens: uso?.tokens ?? 0,
        costoUsd: uso?.costoUsd ?? 0
      }
    }),
    sinProyecto: { tokens: sinProyecto?.tokens ?? 0, costoUsd: sinProyecto?.costoUsd ?? 0 }
  }
}

/**
 * The AI Proyectos' income in `rango`, in subtotals as Finanzas KPIs are. Ingreso proyectos AI:
 * the accepted Cotizaciones of those started in it, a USD one in pesos at its own rate (else the
 * most recent recorded). Ingreso AI: their Ingresos paid in it, a Reembolso counting against the
 * period it was given back in.
 */
function ingresosAi(db: Db, rango: Rango, tipoCambio: number | null): Pick<ResumenAi, 'ingresoProyectos' | 'ingresoAi'> {
  const dentro = (fecha: string | null) => fecha !== null && fecha >= rango.desde && fecha <= rango.hasta
  const cotizadas = db
    .select({ fechaInicio: proyectos.fechaInicio, c: cotizaciones })
    .from(proyectos)
    .innerJoin(cotizaciones, eq(cotizaciones.id, proyectos.cotizacionId))
    .where(and(eq(proyectos.categoria, 'ai'), eq(cotizaciones.estado, 'aceptada')))
    .all()
    .filter(({ fechaInicio }) => dentro(fechaInicio))
  const ingresoProyectos = cotizadas.reduce((s, { c }) => {
    if (c.moneda === 'MXN') return s + c.subtotal
    const tasa = c.tipoCambio ?? tipoCambio
    return tasa === null ? s : s + convertir(c.subtotal, 'USD', 'MXN', tasa)
  }, 0)
  const { ingresoAi } = db
    .select({ ingresoAi: sql<number>`coalesce(sum(${ingresos.subtotal}), 0)` })
    .from(ingresos)
    .innerJoin(proyectos, eq(proyectos.id, ingresos.proyectoId))
    .where(
      and(
        eq(proyectos.categoria, 'ai'),
        eq(ingresos.estado, 'pagado'),
        gte(sql`coalesce(${ingresos.fechaPago}, ${ingresos.fechaRegistro})`, rango.desde),
        lte(sql`coalesce(${ingresos.fechaPago}, ${ingresos.fechaRegistro})`, rango.hasta)
      )
    )
    .get()!
  return { ingresoProyectos, ingresoAi }
}

/**
 * The AI section's figures for `periodo`: Este mes runs, as in Finanzas, from the 1st to `hoy`.
 * Money is read Al día, so this month's Suscripciones exist. Proyecto folders are checked under `root`.
 */
export function resumenAi(db: Db, ajustes: Ajustes, root: string, periodo: PeriodoAi, hoy: string): ResumenAi {
  alDia(db, hoy)
  const { desde, hasta } = rangos('mes', hoy).rango
  const enPeriodo = (dia: typeof usoTokens.dia | typeof ahorroTokens.dia) => (periodo === 'mes' ? and(gte(dia, desde), lte(dia, hasta)) : undefined)
  const uso = db
    .select({
      tokens: sql<number>`coalesce(sum(${TOKENS}), 0)`,
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
  // Todo el tiempo ends today too, as in Finanzas.
  const rango = { desde: periodo === 'mes' ? desde : '', hasta }
  const filas = suscripciones(db, rango)
  return {
    periodo,
    tokens: uso.tokens,
    tokensAhorrados: ahorrados,
    ahorro: uso.tokens + ahorrados > 0 ? ahorrados / (uso.tokens + ahorrados) : null,
    costoApiUsd: uso.costoUsd,
    costoApiMxn: tipoCambio === null ? null : convertir(uso.costoUsd, 'USD', 'MXN', tipoCambio),
    tipoCambio,
    modelos: usoPorModelo(db, enPeriodo(usoTokens.dia)),
    suscripciones: filas,
    suscripcionesTotal: filas.reduce((s, f) => s + f.monto, 0),
    ...ingresosAi(db, rango, tipoCambio),
    ...proyectosAi(db, root, enPeriodo(usoTokens.dia)),
    ...ultimaLectura(ajustes)
  }
}

export const MOTIVOS_RESPALDO = ['semanal', 'migracion', 'manual', 'antes-de-restaurar'] as const
export type MotivoRespaldo = (typeof MOTIVOS_RESPALDO)[number]

export interface Respaldo {
  archivo: string
  path: string
  creadoEn: string
  motivo: MotivoRespaldo
  bytes: number
}

export interface EstadoRespaldos extends ConfigRespaldos {
  dir: string
  ultimo: string | null
  respaldos: Respaldo[]
}

export interface ConfigRespaldos {
  frecuenciaDias: number
  conservar: number
}

/** `restaurado: false` means the user cancelled the file picker. On success the app relaunches. */
export type ResultadoRestaurar = { restaurado: boolean }

/** What one import run found, shown in Configuración → Logs. */
export interface LogImportacion {
  importados: number
  /** CFDIs whose UUID was already in the database; re-running changed nothing. */
  duplicados: number
  /** Vouchers that carry no new money (pago, nómina, traslado). */
  ignorados: number
  /** Sugerencias de importación left waiting for accept/reject. */
  sugerencias: number
  /** RFCs no Contacto claims, so their Ingresos and Costos stayed unlinked. */
  rfcsDesconocidos: string[]
  errores: { archivo: string; error: string }[]
  /** Folders the app knows but could not read on this run (No disponible). */
  noDisponibles: string[]
}

/** What one rescan of `Cotizaciones/`, `Clientes/` and `Proyectos/` found. */
export interface LogCarpetas {
  /** Keyed by Folio: `duplicadas` were already imported and changed nothing. */
  cotizaciones: { importadas: number; duplicadas: number }
  /** Contactos created from a folder name; existing ones are matched, never duplicated. */
  contactos: { creados: number }
  proyectos: { creados: number; actualizados: number }
  /** Proyectos created for an accepted Cotización whose folder was found nowhere. */
  proyectosSinCarpeta: number
  /** Sugerencias de importación this run left waiting for accept/reject. */
  sugerencias: number
  /** The external HDD is a secondary source; when absent its locations are No disponible. */
  hddConectado: boolean
  errores: { archivo: string; error: string }[]
  /** Folders the app knows but could not read on this run (No disponible). */
  noDisponibles: string[]
}

/** One import run, kept so Logs still shows what it found after the run itself is over. */
export interface Corrida<L> {
  corridoEn: string
  log: L
}

/** What Logs shows of the last run of each importer. Either is `null` until it has been run. */
export interface EstadoImportacion {
  facturas: Corrida<LogImportacion> | null
  carpetas: Corrida<LogCarpetas> | null
}

export type AccionSugerencia = 'vincular' | 'fusionar' | 'ubicacion'
export type EntidadSugerencia = 'ingreso' | 'costo' | 'cotizacion' | 'proyecto' | 'contacto'
/** For `ubicacion`, where there is nothing to accept: `aceptada` is Archivado, `rechazada` No disponible. */
export type RespuestaSugerencia = 'aceptada' | 'rechazada'

/** A Sugerencia de importación as Logs shows it: what was guessed, about what, and why. */
export interface Sugerencia {
  id: number
  accion: AccionSugerencia
  entidad: EntidadSugerencia
  /** Why the importer guessed this. */
  motivo: string
  creadoEn: string
  /** The record in doubt, e.g. `Cotización 475 · Sonrieme`. */
  registro: string
  /** The Proyecto to link to or the Contacto to merge into; `ubicacion` has none. */
  destino: string | null
}

/** The folders the app reads, and the state of the ones it cannot always reach. */
export interface Rutas {
  dmmOsRoot: string
  /** The external HDD, a secondary source; `null` until one is chosen. */
  hddRoot: string | null
  hddConectado: boolean
  /** Loose files waiting in `Entrada/`; `null` when the folder cannot be read. */
  entrada: number | null
}

/** A folder the app can reveal in Finder. */
export type CarpetaAbrible = 'raiz' | 'entrada' | 'hdd'

/** Whether a year's Costos are known at all; a year without them shows Sin datos. */
export interface CoberturaAnual {
  anio: number
  sinDatos: boolean
}

export interface AppInfo {
  version: string
  dbPath: string
  dmmOsRoot: string
}

/** One IPC endpoint: its arguments and result, carried in the type only. */
export interface Canal<A extends unknown[], R> {
  readonly esCanal: true
  readonly args?: A
  readonly resultado?: R
}

const canal = <A extends unknown[] = [], R = void>(): Canal<A, R> => ({ esCanal: true })

/**
 * The renderer<->main contract, declared once. Channel names, the preload bridge and the
 * main-side registration are derived from it: adding an endpoint means adding it here
 * and implementing its handler.
 */
export const contrato = {
  getAppInfo: canal<[], AppInfo>(),
  respaldos: {
    estado: canal<[], EstadoRespaldos>(),
    crear: canal<[], Respaldo>(),
    configurar: canal<[config: ConfigRespaldos], EstadoRespaldos>(),
    /** Without a path the user picks the file. On success the app relaunches. */
    restaurar: canal<[path?: string], ResultadoRestaurar>()
  },
  importacion: {
    /** Re-reads `Facturas/Emitidas` and `Facturas/Recibidas`; safe to run again at any time. */
    facturas: canal<[], LogImportacion>(),
    /**
     * Re-reads `Cotizaciones/`, `Clientes/`, `Proyectos/` and `Archivo/Proyectos/`, with the
     * external HDD as a secondary source. Safe to run again at any time.
     */
    carpetas: canal<[], LogCarpetas>(),
    /** What the last run of each importer found, so Logs survives leaving the screen. */
    estado: canal<[], EstadoImportacion>(),
    /** The Sugerencias de importación still waiting for an accept/reject. */
    sugerencias: canal<[], Sugerencia[]>(),
    /** Answers one Sugerencia, once, and returns the ones still pending. */
    responder: canal<[id: number, respuesta: RespuestaSugerencia], Sugerencia[]>()
  },
  rutas: {
    leer: canal<[], Rutas>(),
    /** Points at the external HDD; without a path the user picks the folder. */
    elegirHdd: canal<[path?: string], Rutas>(),
    /** Forgets the external HDD; its Proyectos stay, as No disponible. */
    olvidarHdd: canal<[], Rutas>(),
    /** Reveals the folder in Finder. */
    abrir: canal<[carpeta: CarpetaAbrible], void>()
  },
  finanzas: {
    /** Which years show Sin datos because their Costos were never imported. */
    coberturaCostos: canal<[desde: number, hasta: number], CoberturaAnual[]>()
  }
}

/** API exposed to the renderer as `window.dmm`. */
export type Api<C> = {
  [K in keyof C]: C[K] extends Canal<infer A, infer R> ? (...args: A) => Promise<R> : Api<C[K]>
}

/** What main implements for each endpoint. */
export type Handlers<C> = {
  [K in keyof C]: C[K] extends Canal<infer A, infer R> ? (...args: A) => R | Promise<R> : Handlers<C[K]>
}

export type DmmApi = Api<typeof contrato>
export type DmmHandlers = Handlers<typeof contrato>

/** Visits every endpoint with its channel name (e.g. `respaldos:estado`) and its path in the contract. */
export function recorrerContrato(nodo: object, visitar: (canal: string, ruta: string[]) => void, ruta: string[] = []): void {
  for (const [nombre, valor] of Object.entries(nodo)) {
    const aqui = [...ruta, nombre]
    if ((valor as { esCanal?: boolean }).esCanal === true) visitar(aqui.join(':'), aqui)
    else recorrerContrato(valor as object, visitar, aqui)
  }
}

/** Builds `window.dmm` from the contract, sending each call through `invoke`. */
export function crearApi(invoke: (canal: string, ...args: unknown[]) => Promise<unknown>): DmmApi {
  const api: Record<string, unknown> = {}
  recorrerContrato(contrato, (canal, ruta) => {
    let destino = api
    for (const nombre of ruta.slice(0, -1)) destino = (destino[nombre] ??= {}) as Record<string, unknown>
    destino[ruta[ruta.length - 1]] = (...args: unknown[]) => invoke(canal, ...args)
  })
  return api as DmmApi
}

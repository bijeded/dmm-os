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
export type CarpetaAbrible = 'raiz' | 'entrada'

/** Whether a year's Costos are known at all; a year without them shows Sin datos. */
export interface CoberturaAnual {
  anio: number
  sinDatos: boolean
}

/** Estado de Contacto: always derived from its Cotizaciones and Proyectos, never set by hand. */
export const ESTADOS_CONTACTO = ['lead_frio', 'lead_caliente', 'cliente_activo', 'cliente_inactivo'] as const
export type EstadoContacto = (typeof ESTADOS_CONTACTO)[number]

/** How the Estado de Contacto reads, in the app and in the CSV. */
export const NOMBRES_ESTADO_CONTACTO: Record<EstadoContacto, string> = {
  lead_frio: 'Lead frío',
  lead_caliente: 'Lead caliente',
  cliente_activo: 'Cliente activo',
  cliente_inactivo: 'Cliente inactivo'
}

/** One row of the Contactos table. Money is integer centavos, before IVA. */
export interface FilaContacto {
  id: number
  nombre: string
  empresa: string | null
  email: string | null
  telefono: string | null
  estado: EstadoContacto
  /** What the Contacto has paid, net of Reembolsos. */
  valor: number
}

export interface ListaContactos {
  /** Ascending by name. */
  contactos: FilaContacto[]
  conteo: Record<EstadoContacto, number>
  /** Top 10 by value, with each one's share (0–100) of all revenue from Contactos. */
  top: { id: number; nombre: string; valor: number; porcentaje: number }[]
}

/** One line of a Contacto's history: a Cotización, a Proyecto or a payment (Ingreso). */
export interface Movimiento {
  tipo: 'cotizacion' | 'proyecto' | 'pago'
  id: number
  fecha: string
  /** The Folio of a Cotización; nothing for the rest. */
  referencia: string | null
  detalle: string
  /** Centavos before IVA; `null` for a Proyecto, whose money is in its payments. */
  monto: number | null
  estado: string
}

/** A file already in `Clientes/<name>/`, read from disk as it is. */
export interface ArchivoCliente {
  nombre: string
  /** `Carpeta`, or the extension in capitals. */
  tipo: string
  modificado: string
}

export interface FichaContacto {
  contacto: {
    id: number
    nombre: string
    empresa: string | null
    rfc: string | null
    email: string | null
    telefono: string | null
    direccion: string | null
    notas: string | null
    creadoEn: string
  }
  estado: EstadoContacto
  /** What the Contacto has paid, net of Reembolsos: the same value as in the list. */
  valor: number
  /** Pending Ingresos. */
  porCobrar: number
  proyectos: number
  /** Drafts count; `aceptadas` is what the conversion rate is made of. */
  cotizaciones: { total: number; aceptadas: number }
  /** Newest first. */
  historial: Movimiento[]
  /** The Contacto's folder under `Clientes/`, relative to the DMM OS root; `null` when none matches. */
  carpeta: string | null
  archivos: ArchivoCliente[]
}

export const CATEGORIAS = ['website', 'ecommerce', 'app', 'ai', 'marketing', 'other'] as const
export type Categoria = (typeof CATEGORIAS)[number]

export const NOMBRES_CATEGORIA: Record<Categoria, string> = {
  website: 'Website',
  ecommerce: 'Ecommerce',
  app: 'App',
  ai: 'AI',
  marketing: 'Marketing',
  other: 'Otro'
}

/** A product or service of the Catálogo. `precio` is its default, in centavos before IVA. */
export interface ConceptoCatalogo {
  id: number
  concepto: string
  categoria: Categoria
  precio: number
}

/** Without `id` it adds a concept; with one it edits it. */
export type ConceptoNuevo = Omit<ConceptoCatalogo, 'id'> & { id?: number }

/** One line of a Cotización's items: a copy taken at creation, never a link to the Catálogo. */
export interface PartidaCotizacion {
  concepto: string
  categoria: Categoria
  cantidad: number
  /** Unit price in centavos before IVA. */
  precio: number
}

export const CATEGORIAS_COSTO = ['unico', 'mensual', 'msi', 'anual'] as const
export type CategoriaCosto = (typeof CATEGORIAS_COSTO)[number]

export const NOMBRES_CATEGORIA_COSTO: Record<CategoriaCosto, string> = {
  unico: 'Único',
  mensual: 'Mensual',
  msi: 'MSI',
  anual: 'Anual'
}

/**
 * A cost DMM expects to pay for a quote, in the quote's currency, centavos before IVA. Never
 * shown to the Contacto. `monto` is per period for recurring costs, per installment for MSI.
 */
export interface CostoEstimado {
  concepto: string
  monto: number
  categoria: CategoriaCosto
  /** How many installments, only for `msi`. */
  parcialidades: number | null
}

export const ESTADOS_COTIZACION = ['borrador', 'enviada', 'aceptada', 'rechazada', 'cancelada', 'expirada'] as const
export type EstadoCotizacion = (typeof ESTADOS_COTIZACION)[number]

/** What can be done to a quote; which ones apply depends on its estado and is decided in main. */
export type AccionCotizacion = 'editar' | 'borrar' | 'enviar' | 'aceptar' | 'rechazar' | 'cancelar'

export const NOMBRES_ESTADO_COTIZACION: Record<EstadoCotizacion, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
  expirada: 'Expirada'
}

export const FACTURACIONES = ['unica', 'mensual', 'parcialidades'] as const
export type Facturacion = (typeof FACTURACIONES)[number]

export const NOMBRES_FACTURACION: Record<Facturacion, string> = {
  unica: 'Pago único',
  mensual: 'Mensual',
  parcialidades: 'Parcialidades'
}

/** What the quote form edits. Without `id` it creates a draft; with one it edits that draft. */
export interface CotizacionNueva {
  id?: number
  contactoId: number
  /** What the quote is for; it becomes the Proyecto's name when accepted. */
  nombre: string
  categoria: Categoria
  /** `YYYY-MM-DD` */
  fecha: string
  validezDias: number
  moneda: 'MXN' | 'USD'
  partidas: PartidaCotizacion[]
  /** Adds 16% IVA on top of the subtotal. */
  conIva: boolean
  facturacion: Facturacion
  /** Number of payments, only for `parcialidades`. */
  parcialidades: number | null
  stack: string | null
  terminos: string | null
  notas: string | null
  costosEstimados: CostoEstimado[]
}

/** One row of the Cotizaciones table. Money in centavos before IVA. */
export interface FilaCotizacion {
  id: number
  /** `475b`; `null` for a draft. */
  folio: string | null
  fecha: string
  contactoId: number
  contacto: string
  nombre: string | null
  categoria: Categoria
  subtotal: number
  estado: EstadoCotizacion
  /** Whether it has an archived PDF. */
  pdf: boolean
}

export interface ListaCotizaciones {
  /** Drafts first, then by Folio descending. */
  cotizaciones: FilaCotizacion[]
  resumen: {
    /** Every quote but drafts. */
    total: number
    enviadas: number
    /** Accepted over every quote but drafts, 0–100. */
    conversion: number
    /** Subtotal of sent quotes still waiting for an answer. */
    montoAbiertas: number
    /** Average subtotal of every quote but drafts. */
    promedio: number
  }
  porCategoria: Record<Categoria, number>
}

export interface FichaCotizacion extends Required<Omit<CotizacionNueva, 'id'>> {
  id: number
  folio: string | null
  estado: EstadoCotizacion
  contacto: string
  subtotal: number
  iva: number
  total: number
  /** The archived PDF, relative to the DMM OS root. */
  pdf: string | null
  proyectoId: number | null
  /** The actions its estado allows now. */
  acciones: AccionCotizacion[]
}

export const ESTADOS_PROYECTO = ['en_curso', 'pausado', 'completado', 'cancelado'] as const
export type EstadoProyecto = (typeof ESTADOS_PROYECTO)[number]

export const NOMBRES_ESTADO_PROYECTO: Record<EstadoProyecto, string> = {
  en_curso: 'En curso',
  pausado: 'Pausado',
  completado: 'Completado',
  cancelado: 'Cancelado'
}

export type EtiquetaProyecto = 'cliente' | 'personal'

/** What can be done to a Proyecto; which ones apply depends on its estado and is decided in main. */
export type AccionProyecto = 'editar' | 'borrar' | 'pausar' | 'reanudar' | 'completar' | 'cancelar'

/**
 * Where a Proyecto's files are. `disponible`: its folder is there to open. `archivado`: its
 * files left `Proyectos/` for long-term storage. `no_disponible`: a folder the app knows but
 * cannot reach now. `sin_carpeta`: no location recorded at all.
 */
export type EstadoCarpeta = 'disponible' | 'archivado' | 'no_disponible' | 'sin_carpeta'

export interface CarpetaProyecto {
  estado: EstadoCarpeta
  /** Relative to the root of wherever it lives. */
  ruta: string | null
  /** Whether it can be revealed in Finder right now. */
  abrible: boolean
}

/** What the Proyecto form edits. Without `id` it creates one; with one it edits it. */
export interface ProyectoNuevo {
  id?: number
  nombre: string
  /** A personal Proyecto has no Contacto and no Cotización. */
  etiqueta: EtiquetaProyecto
  contactoId: number | null
  clienteFinal: string | null
  categoria: Categoria
  /** `YYYY-MM-DD` */
  fechaInicio: string | null
  fechaEntrega: string | null
  notas: string | null
}

/** One row of the Proyectos table. */
export interface FilaProyecto {
  id: number
  /** `PRY-014` */
  referencia: string
  nombre: string
  etiqueta: EtiquetaProyecto
  contactoId: number | null
  contacto: string | null
  clienteFinal: string | null
  categoria: Categoria
  fechaInicio: string | null
  estado: EstadoProyecto
  carpeta: CarpetaProyecto
}

export interface ListaProyectos {
  /** By reference, newest first. */
  proyectos: FilaProyecto[]
  conteo: Record<EstadoProyecto, number>
  porCategoria: Record<Categoria, number>
}

export interface FichaProyecto extends Required<Omit<ProyectoNuevo, 'id'>> {
  id: number
  referencia: string
  estado: EstadoProyecto
  contacto: string | null
  cotizacionId: number | null
  /** The Folio of the Cotización it came from. */
  folio: string | null
  fechaFin: string | null
  carpeta: CarpetaProyecto
  /** Pending Ingresos, centavos before IVA: while any remain it cannot be completed. */
  porCobrar: number
  cobrado: number
  /**
   * Why its estado allows completing it but its payments don't yet: how many Ingresos are
   * pending, and what is missing to reach its Cotización's total (with IVA, in the quote's
   * currency). `null` when it can be completed, or its estado doesn't allow it.
   */
  falta: { pendientes: number; faltante: number; moneda: 'MXN' | 'USD' } | null
  acciones: AccionProyecto[]
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
    /** Points at the external HDD: the user picks the folder. */
    elegirHdd: canal<[], Rutas>(),
    /** Forgets the external HDD; its Proyectos stay, as No disponible. */
    olvidarHdd: canal<[], Rutas>(),
    /** Reveals the folder in Finder. */
    abrir: canal<[carpeta: CarpetaAbrible], void>()
  },
  contactos: {
    listar: canal<[], ListaContactos>(),
    ficha: canal<[id: number], FichaContacto>(),
    /** Borrar vs cancelar: refused when the Contacto has anything linked. */
    borrar: canal<[id: number], void>(),
    /** Every Contacto as CSV, for a newsletter service. */
    csv: canal<[], string>()
  },
  catalogo: {
    /** By name. */
    listar: canal<[], ConceptoCatalogo[]>(),
    /** Adds or edits a concept and returns the Catálogo. Past Cotizaciones keep their prices. */
    guardar: canal<[concepto: ConceptoNuevo], ConceptoCatalogo[]>(),
    /** Nothing links to a concept (Cotizaciones copy it), so it can always be deleted. */
    borrar: canal<[id: number], ConceptoCatalogo[]>()
  },
  cotizaciones: {
    listar: canal<[], ListaCotizaciones>(),
    ficha: canal<[id: number], FichaCotizacion>(),
    /** Saves a draft (new or edited) and returns its record. Only drafts can be edited. */
    guardar: canal<[cotizacion: CotizacionNueva], FichaCotizacion>(),
    /** Assigns the Folio, prints the PDF into `Cotizaciones/<year>/` and marks it sent. */
    enviar: canal<[id: number], FichaCotizacion>(),
    /**
     * Creates the Proyecto, its pending Ingresos and the estimated Costos. A USD quote needs the
     * exchange rate: money is recorded in MXN, the USD amount kept as original.
     */
    aceptar: canal<[id: number, tipoCambio?: number], FichaCotizacion>(),
    rechazar: canal<[id: number], FichaCotizacion>(),
    /** Cancels the quote and its Proyecto (Cancelación con pagos). */
    cancelar: canal<[id: number], FichaCotizacion>(),
    /** Only drafts can be deleted; anything else is cancelled. */
    borrar: canal<[id: number], void>(),
    abrirPdf: canal<[id: number], void>()
  },
  proyectos: {
    listar: canal<[], ListaProyectos>(),
    ficha: canal<[id: number], FichaProyecto>(),
    /** Creates (scaffolding its folder in `Proyectos/`) or edits a Proyecto. */
    guardar: canal<[proyecto: ProyectoNuevo], FichaProyecto>(),
    pausar: canal<[id: number], FichaProyecto>(),
    reanudar: canal<[id: number], FichaProyecto>(),
    /** Refused while any Ingreso is pending: a Proyecto is only completed once fully paid. */
    completar: canal<[id: number], FichaProyecto>(),
    /** Cancels the Proyecto and its Cotización (Cancelación con pagos). */
    cancelar: canal<[id: number], FichaProyecto>(),
    /** Borrar vs cancelar: refused when it has anything linked. Its folder stays on disk. */
    borrar: canal<[id: number], void>(),
    abrirCarpeta: canal<[id: number], void>()
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

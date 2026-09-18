import type {
  CarpetaAbrible,
  CoberturaAnual,
  ConceptoCatalogo,
  ConceptoNuevo,
  ConfigRespaldos,
  ContactoNuevo,
  CostoNuevo,
  CotizacionNueva,
  EstadoImportacion,
  EstadoRespaldos,
  FichaContacto,
  FichaCotizacion,
  FichaProyecto,
  IngresoNuevo,
  ListaContactos,
  ListaCotizaciones,
  ListaProyectos,
  LogCarpetas,
  LogImportacion,
  PeriodoFinanzas,
  ProyectoNuevo,
  Respaldo,
  RespuestaSugerencia,
  ResultadoRestaurar,
  ResumenFinanzas,
  Rutas,
  Sugerencia
} from './dominio'

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
    /** Adds or edits a Contacto and returns its id. Refused if another Contacto has the same name. */
    guardar: canal<[contacto: ContactoNuevo], number>(),
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
    coberturaCostos: canal<[desde: number, hasta: number], CoberturaAnual[]>(),
    /** Generates the periods due up to this month, then reads the period against the one before. */
    resumen: canal<[periodo: PeriodoFinanzas], ResumenFinanzas>(),
    /** Days after which an unpaid invoice is Cobranza vencida. */
    configurarVencida: canal<[dias: number], void>(),
    nuevoIngreso: canal<[ingreso: IngresoNuevo], void>(),
    nuevoCosto: canal<[costo: CostoNuevo], void>(),
    pagarIngreso: canal<[id: number], void>(),
    cancelarIngreso: canal<[id: number], void>(),
    /** Borrar vs cancelar: only a hand-entered Ingreso with no Reembolso against it. */
    borrarIngreso: canal<[id: number], void>(),
    /** A Reembolso of `monto` (total, in the Ingreso's currency): a negative, paid Ingreso linked to the original, dated today. */
    reembolsar: canal<[id: number, monto: number], void>(),
    pagarCosto: canal<[id: number], void>(),
    cancelarCosto: canal<[id: number], void>(),
    /** Borrar vs cancelar: only a hand-entered one-time Costo. */
    borrarCosto: canal<[id: number], void>(),
    /** Stops the monthly or annual series the Costo belongs to after this month. */
    detenerCosto: canal<[id: number], void>()
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
